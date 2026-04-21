/**
 * tag.controller.js — CRUD + tagging + match endpoints for the
 * geographic tag system.
 *
 * Route layout (mounted under /api/tags in src/server.js):
 *
 *   GET    /                           list (public — used by admin + agent UIs)
 *   POST   /                           create (admin) — auto-geocodes
 *   PATCH  /:id                        update (admin)
 *   DELETE /:id                        soft-delete (admin, sets active=false)
 *
 *   GET    /users/:userId              list tags attached to a user
 *   PUT    /users/:userId              replace a user's tag set (admin OR owning agent)
 *   POST   /users/:userId              attach a single tag
 *   DELETE /users/:userId/:tagId       detach a single tag
 *
 *   POST   /match                      given { lat, lng } or { address }
 *                                      returns matching tags + users
 */

const pool = require('../database/pool');
const { geocodeAddress } = require('../services/geocoder');
const { matchTagsAndUsers, getDefaultRadiusMiles } = require('../services/tag-matcher');
const { logActivity } = require('../services/activity-log');

// ─── helpers ────────────────────────────────────────────────────────────────
function slugify(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 100);
}

function isAdmin(req) {
    return req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
}

function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── list/search ────────────────────────────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const { state, region, search, active } = req.query;
        const where = [];
        const params = [];

        if (state)  { params.push(state);  where.push(`state = $${params.length}`); }
        if (region) { params.push(region); where.push(`region = $${params.length}`); }
        if (search) {
            params.push(`%${String(search).toLowerCase()}%`);
            where.push(`lower(name) LIKE $${params.length}`);
        }
        if (active === 'true')  where.push(`active = TRUE`);
        if (active === 'false') where.push(`active = FALSE`);
        if (active !== 'true' && active !== 'false' && active !== 'all') where.push(`active = TRUE`);

        const sql = `
            SELECT id, slug, name, state, region, latitude, longitude, active, created_at, updated_at
            FROM tags
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY state ASC, region ASC, name ASC
            LIMIT 500
        `;
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('[tags.list]', err.message);
        res.status(500).json({ error: 'Failed to load tags.' });
    }
};

// ─── get one (by slug or id) ────────────────────────────────────────────────
// Powers the public /towns/<slug> page. Returns the tag row + counts for
// linked lakes / agents so the page can render summary numbers without
// waterfall fetches.
exports.getOne = async (req, res) => {
    try {
        const key = req.params.slugOrId;
        const byUuid = UUID_RE.test(key);
        const { rows } = await pool.query(
            `SELECT t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude, t.active,
                    (SELECT COUNT(*) FROM lake_tags lt WHERE lt.tag_id = t.id) AS lake_count,
                    (SELECT COUNT(*) FROM user_tags ut WHERE ut.tag_id = t.id) AS agent_count
             FROM tags t
             WHERE ${byUuid ? 't.id' : 't.slug'} = $1
             LIMIT 1`,
            [key]
        );
        const tag = rows[0];
        if (!tag || !tag.active) return res.status(404).json({ error: 'Tag not found.' });
        tag.lake_count  = Number(tag.lake_count)  || 0;
        tag.agent_count = Number(tag.agent_count) || 0;
        res.json(tag);
    } catch (err) {
        console.error('[tags.getOne]', err.message);
        res.status(500).json({ error: 'Failed to load tag.' });
    }
};

// ─── lakes connected to a tag (reverse lake_tags lookup) ───────────────────
// Only returns published lakes for the public /towns/<slug> page.
exports.listLakesForTag = async (req, res) => {
    try {
        const key = req.params.slugOrId;
        const byUuid = UUID_RE.test(key);
        const { rows } = await pool.query(
            `SELECT l.id, l.slug, l.name, l.state, l.region, l.county,
                    l.latitude, l.longitude, l.intro_text, l.seo_description,
                    l.featured_image_url, l.hero_image_url
             FROM lake_tags lt
             JOIN tags  t ON t.id = lt.tag_id
             JOIN lakes l ON l.id = lt.lake_id
             WHERE ${byUuid ? 't.id' : 't.slug'} = $1
               AND l.status = 'published'
             ORDER BY l.name ASC`,
            [key]
        );
        res.json(rows);
    } catch (err) {
        console.error('[tags.listLakesForTag]', err.message);
        res.status(500).json({ error: 'Failed to load lakes for tag.' });
    }
};

// ─── create (admin) ─────────────────────────────────────────────────────────
exports.create = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });

        const b = req.body || {};
        const name = String(b.name || '').trim().slice(0, 150);
        const state = String(b.state || '').trim().slice(0, 2).toUpperCase();
        const region = b.region ? String(b.region).trim().slice(0, 100) : null;
        if (!name || !state) return res.status(400).json({ error: 'name and state are required.' });

        // Slug: admin can supply one; otherwise derive from name.
        let slug = b.slug ? slugify(b.slug) : slugify(name);
        if (!slug) return res.status(400).json({ error: 'Could not derive a valid slug from name.' });

        // Coordinates: prefer explicit lat/lng from body; otherwise geocode.
        let lat = numOrNull(b.latitude);
        let lng = numOrNull(b.longitude);
        let geocoded = false;
        if (lat == null || lng == null) {
            const g = await geocodeAddress(`${name}, ${state}`);
            if (g) { lat = g.lat; lng = g.lng; geocoded = true; }
        }

        const { rows } = await pool.query(
            `INSERT INTO tags (slug, name, state, region, latitude, longitude)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [slug, name, state, region, lat, lng]
        );
        const tag = rows[0];

        logActivity({
            event_type: 'tag.create',
            event_scope: 'tag',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'tag', id: tag.id, label: `${tag.name}, ${tag.state}` },
            details: { slug, geocoded, lat, lng },
            req,
        });

        res.status(201).json({ ...tag, _geocoded: geocoded, _has_coords: lat != null && lng != null });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A tag with that slug already exists.' });
        }
        console.error('[tags.create]', err.message);
        res.status(500).json({ error: 'Failed to create tag.' });
    }
};

// ─── patch (admin) ──────────────────────────────────────────────────────────
exports.patch = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });

        const b = req.body || {};
        const fields = [];
        const vals = [];
        let i = 1;
        const push = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val); };

        if ('name' in b)      push('name',     String(b.name).trim().slice(0, 150));
        if ('state' in b)     push('state',    String(b.state).trim().slice(0, 2).toUpperCase());
        if ('region' in b)    push('region',   b.region ? String(b.region).trim().slice(0, 100) : null);
        if ('latitude' in b)  push('latitude', numOrNull(b.latitude));
        if ('longitude' in b) push('longitude',numOrNull(b.longitude));
        if ('active' in b)    push('active',   !!b.active);
        if ('slug' in b) {
            const s = slugify(b.slug);
            if (!s) return res.status(400).json({ error: 'Invalid slug.' });
            push('slug', s);
        }

        if (!fields.length) return res.json({ success: true, noop: true });

        fields.push(`updated_at = NOW()`);
        vals.push(req.params.id);
        const { rows, rowCount } = await pool.query(
            `UPDATE tags SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Tag not found.' });
        const tag = rows[0];

        logActivity({
            event_type: 'tag.update',
            event_scope: 'tag',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'tag', id: tag.id, label: `${tag.name}, ${tag.state}` },
            details: { changed: Object.keys(b) },
            req,
        });
        res.json(tag);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A tag with that slug already exists.' });
        }
        console.error('[tags.patch]', err.message);
        res.status(500).json({ error: 'Failed to update tag.' });
    }
};

// ─── soft-delete (admin) ────────────────────────────────────────────────────
exports.softDelete = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
        const { rowCount, rows } = await pool.query(
            `UPDATE tags SET active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name, state`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Tag not found.' });
        logActivity({
            event_type: 'tag.deactivate',
            event_scope: 'tag',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'tag', id: rows[0].id, label: `${rows[0].name}, ${rows[0].state}` },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[tags.softDelete]', err.message);
        res.status(500).json({ error: 'Failed to deactivate tag.' });
    }
};

// ─── list tags for a user ───────────────────────────────────────────────────
exports.listForUser = async (req, res) => {
    try {
        const { userId } = req.params;
        // Self OR admin
        if (!isAdmin(req) && req.user?.userId !== userId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        const { rows } = await pool.query(
            `SELECT t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude, t.active
             FROM user_tags ut
             JOIN tags t ON t.id = ut.tag_id
             WHERE ut.user_id = $1
             ORDER BY t.state ASC, t.name ASC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[tags.listForUser]', err.message);
        res.status(500).json({ error: 'Failed to load user tags.' });
    }
};

// ─── replace a user's tag set (PUT) ─────────────────────────────────────────
exports.replaceForUser = async (req, res) => {
    const { userId } = req.params;
    if (!isAdmin(req) && req.user?.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden.' });
    }

    const tagIds = Array.isArray(req.body?.tagIds) ? req.body.tagIds.filter(Boolean) : null;
    if (!tagIds) return res.status(400).json({ error: 'tagIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM user_tags WHERE user_id = $1`, [userId]);
        if (tagIds.length) {
            // Bulk insert, ignoring unknown tag ids via a subquery filter.
            const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO user_tags (user_id, tag_id)
                 SELECT uid, tid FROM (VALUES ${values}) AS v(uid, tid)
                 WHERE EXISTS (SELECT 1 FROM tags WHERE id = v.tid::uuid)
                 ON CONFLICT (user_id, tag_id) DO NOTHING`,
                [userId, ...tagIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'user_tags.replace',
            event_scope: 'user_tag',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'user', id: userId },
            details: { count: tagIds.length },
            req,
        });

        res.json({ success: true, count: tagIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[tags.replaceForUser]', err.message);
        res.status(500).json({ error: 'Failed to save user tags.' });
    } finally {
        client.release();
    }
};

// ─── single attach / detach (convenience) ───────────────────────────────────
exports.attachToUser = async (req, res) => {
    const { userId } = req.params;
    const tagId = req.body?.tagId;
    if (!isAdmin(req) && req.user?.userId !== userId) return res.status(403).json({ error: 'Forbidden.' });
    if (!tagId) return res.status(400).json({ error: 'tagId is required.' });

    try {
        await pool.query(
            `INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2)
             ON CONFLICT (user_id, tag_id) DO NOTHING`,
            [userId, tagId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[tags.attachToUser]', err.message);
        res.status(500).json({ error: 'Failed to attach tag.' });
    }
};

exports.detachFromUser = async (req, res) => {
    const { userId, tagId } = req.params;
    if (!isAdmin(req) && req.user?.userId !== userId) return res.status(403).json({ error: 'Forbidden.' });
    try {
        await pool.query(
            `DELETE FROM user_tags WHERE user_id = $1 AND tag_id = $2`,
            [userId, tagId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[tags.detachFromUser]', err.message);
        res.status(500).json({ error: 'Failed to detach tag.' });
    }
};

// ─── match ──────────────────────────────────────────────────────────────────
// Accepts { lat, lng, radiusMiles? } OR { address, radiusMiles? }.
// Admin-only for now (future: open to lead-routing service with a scoped key).
exports.match = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
        const b = req.body || {};
        let lat = numOrNull(b.lat ?? b.latitude);
        let lng = numOrNull(b.lng ?? b.longitude);
        let formattedAddress = null;
        let placeId = null;

        if ((lat == null || lng == null) && b.address) {
            const g = await geocodeAddress(b.address);
            if (!g) return res.status(400).json({ error: 'Could not geocode the provided address.' });
            lat = g.lat; lng = g.lng; formattedAddress = g.formattedAddress; placeId = g.placeId;
        }
        if (lat == null || lng == null) {
            return res.status(400).json({ error: 'Provide lat/lng or address.' });
        }

        const radiusMiles = numOrNull(b.radiusMiles) ?? await getDefaultRadiusMiles();
        const result = await matchTagsAndUsers({ lat, lng, radiusMiles });
        res.json({
            query: { lat, lng, radiusMiles, formattedAddress, placeId },
            ...result,
        });
    } catch (err) {
        console.error('[tags.match]', err.message);
        res.status(500).json({ error: 'Match failed.' });
    }
};
