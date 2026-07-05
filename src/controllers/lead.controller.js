const pool = require('../database/pool');
const emailService = require('../services/email');
const hubspot = require('../services/hubspot');
const { logActivity } = require('../services/activity-log');
const { geocodeAddress } = require('../services/geocoder');
const { matchTagsAndUsers } = require('../services/tag-matcher');
const { routeLead } = require('../services/lead-router');
const { getLeadMagnetForType } = require('../services/lead-magnet');
const sms = require('../services/sms');
const { scoreLead } = require('../services/lead-score');

const createLead = async (req, res) => {
    let {
        name, email, phone, notes, source, agent_id, listing_id,
        property_address, property_street, property_city,
        property_state, property_zip, property_place_id, lake_slug,
        is_waterfront, waterfront_feet, lead_session_id,
    } = req.body;

    name = (name || '').trim();
    email = (email || '').trim().toLowerCase();

    // Test 9.6: Block missing fields immediately
    if (!name || (!email && !(phone || '').trim())) {
        return res.status(400).json({ error: 'Name and either Email or Phone are required to dispatch lead.' });
    }

    // If this submission finishes a form we already captured partially (same
    // client session), drop the partial row so the full lead inserts fresh and
    // routes normally — no duplicate in the agent inbox.
    const sessionId = (lead_session_id || '').toString().trim().slice(0, 64) || null;
    if (sessionId) {
        try { await pool.query(`DELETE FROM leads WHERE lead_session_id = $1 AND is_partial = TRUE`, [sessionId]); }
        catch (e) { console.warn('[createLead] partial cleanup failed:', e.message); }
    }

    const str = (v, max) => {
        if (v === null || v === undefined || v === '') return null;
        return String(v).trim().slice(0, max) || null;
    };
    const propAddress = str(property_address, 500);
    let   propStreet  = str(property_street, 255);
    let   propCity    = str(property_city, 120);
    let   propState   = str(property_state, 50);
    let   propZip     = str(property_zip, 20);
    const propPlaceId = str(property_place_id, 255);
    // Waterfront flag + shoreline estimate (used for founder/waterfront routing).
    const isWaterfront = (is_waterfront === true || is_waterfront === false) ? is_waterfront : null;
    let   wfFeetNum    = parseInt(waterfront_feet, 10);
    if (!Number.isFinite(wfFeetNum) || wfFeetNum < 0 || wfFeetNum > 100000) wfFeetNum = null;

    try {
        // Coerce agent string if dummy provided
        let finalAgentId = (agent_id && agent_id !== 'uuid-string-dummy') ? agent_id : null;

        // Listing-tied lead (e.g. "request a showing"). Resolve the property
        // server-side so the submitter can't spoof the agent: the lead goes to
        // whoever actually posted the home; its address seeds routing fallback.
        const listingId = (listing_id && String(listing_id).trim()) || null;
        let listing = null;
        if (listingId) {
            try {
                const lr = await pool.query(
                    `SELECT id, agent_id, lake_id, title, address, city, state, zip
                       FROM listings WHERE id = $1 LIMIT 1`, [listingId]);
                listing = lr.rows[0] || null;
            } catch (_) { /* leave null */ }
        }
        if (listing) {
            if (!finalAgentId && listing.agent_id) finalAgentId = listing.agent_id;  // → the posting agent
            // Seed property fields from the listing when the form didn't supply them.
            if (!propStreet && listing.address) propStreet = str(listing.address, 255);
            if (!propCity   && listing.city)    propCity   = str(listing.city, 120);
            if (!propState  && listing.state)   propState  = str(listing.state, 50);
            if (!propZip    && listing.zip)     propZip    = str(listing.zip, 20);
        }

        // Resolve an explicit lake (lead came from a lake page) → its id, so the
        // router can hand it to that lake's founding agent.
        const lakeSlug = str(lake_slug, 120);
        let leadLakeId = null;
        if (lakeSlug) {
            try {
                const lr = await pool.query(`SELECT id FROM lakes WHERE slug = $1 LIMIT 1`, [lakeSlug]);
                leadLakeId = lr.rows[0]?.id || null;
            } catch (_) { /* leave null */ }
        }

        // Link the lead to a user account by email. Forms no longer require
        // an account — anyone can submit. If the caller is signed in we trust
        // their session; otherwise we look up an existing account by the
        // submitted email. No match → user_id stays null ("unassigned"), and
        // it gets backfilled later if someone signs up with that same email.
        let submittedUserId = req.user?.userId || null;
        if (!submittedUserId && email) {
            const u = await pool.query(
                'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
                [email]
            );
            if (u.rows.length) submittedUserId = u.rows[0].id;
        }

        const query = `
            INSERT INTO leads (
                full_name, first_name, email, phone, message,
                lead_type, lead_source, agent_id, lead_status,
                property_address, property_street, property_city,
                property_state, property_zip, property_place_id,
                user_id, listing_id, is_waterfront, waterfront_feet,
                lead_score, lead_tier, lead_session_id, is_partial
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, FALSE)
            RETURNING id
        `;
        // We extrapolate first name logically
        const firstName = name.split(' ')[0] || 'Unknown';

        // Map source to lead_type enum using exact matching
        const enumMap = {
            'agent_inquiry': 'agent_inquiry',
            'buyer': 'buyer',
            'seller': 'seller',
            'join_request': 'join_request',
            'market_report': 'market_report',
            'property_question': 'property_question',
        };
        const enumType = enumMap[source] || 'general_contact';

        // Quality-score the lead once; stored on the row and reused for the
        // 🔥 hot flag in agent SMS/email alerts.
        const leadScore = scoreLead({ enumType, email, phone, notes, isWaterfront, wfFeetNum,
            address: propAddress || [propStreet, propCity].filter(Boolean).join(', ') });

        const { rows: leadRows } = await pool.query(query, [
            name, firstName, email, phone, notes,
            enumType, source, finalAgentId,
            propAddress, propStreet, propCity, propState, propZip, propPlaceId,
            submittedUserId, listingId, isWaterfront, wfFeetNum,
            leadScore.score, leadScore.tier, sessionId,
        ]);
        const newLeadId = leadRows[0]?.id;

        // Persist the explicit lake tie (best-effort; column added via migration).
        if (newLeadId && leadLakeId) {
            pool.query(`UPDATE leads SET lake_id = $1 WHERE id = $2`, [leadLakeId, newLeadId])
                .catch(e => console.error('[lead.lake_id] save failed:', e.message));
        }

        logActivity({
            event_type: 'lead.create',
            event_scope: 'lead',
            actor: { type: 'public', label: email || phone || name },
            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
            details: { lead_type: enumType, source, agent_id: finalAgentId, email, phone },
            req,
        });

        // Resolve the right lead magnet (PDF) for this lead type before we
        // fire the confirmation email — the email is tuned to include the
        // download button when a magnet exists. Falls back gracefully to the
        // generic confirmation when no magnet is configured / resource is
        // missing.
        let magnet = null;
        if (email) {
            magnet = await getLeadMagnetForType(enumType).catch(() => null);
        }

        // Fire-and-forget lead confirmation email (only if they provided one)
        if (email) {
            emailService.sendLeadConfirmation({
                email,
                first_name: firstName,
                full_name:  name,
                lead_type:  enumType,
                magnet,
            });
        }

        // Fire-and-forget admin notification with full lead details
        emailService.sendAdminLeadNotification({
            name,
            first_name: firstName,
            email,
            phone,
            type: enumType,
            source,
            notes
        });

        // Fire-and-forget HubSpot mirror — leads with no email are skipped
        // inside hubspot.syncContact (email is the canonical key).
        // Field mapping: standard HubSpot contact properties only —
        // firstname/lastname/phone/email + full address fields (address/city/
        // state/zip) for sellers + lifecyclestage='lead' so HubSpot
        // workflows can target form-fill leads. Buyer-specific budget /
        // timeline + seller-specific timeline currently live in the
        // `notes` blob; mapping them to dedicated HubSpot custom properties
        // is documented in docs/launch-tracking-setup.md as a follow-up
        // step (requires the property to be created in HubSpot first).
        if (newLeadId && email) {
            (async () => {
                const lastName = name.split(' ').slice(1).join(' ');
                const r = await hubspot.syncContact({
                    email,
                    firstname:      firstName,
                    lastname:       lastName,
                    phone:          phone || undefined,
                    address:        propAddress || propStreet || undefined,
                    city:           propCity  || undefined,
                    state:          propState || undefined,
                    zip:            propZip   || undefined,
                    lifecyclestage: 'lead',
                    user_type:      'lead',
                    signup_source:  source || enumType,
                });
                if (r?.id) {
                    pool.query(`UPDATE leads SET hs_contact_id = $1 WHERE id = $2`, [r.id, newLeadId])
                        .catch(e => console.error('[hubspot] save id failed:', e.message));
                }
            })();
        }

        // Direct assignment (a listing "request a showing", or any lead that
        // arrives with an explicit agent_id): assign to that agent and email
        // them right away — independent of address/lake geo routing, which the
        // block below intentionally skips when finalAgentId is set.
        if (newLeadId && finalAgentId) {
            (async () => {
                try {
                    const ar = await pool.query(
                        `SELECT a.id AS agent_id, a.user_id, a.display_name, u.email
                           FROM agents a LEFT JOIN users u ON u.id = a.user_id
                          WHERE a.id = $1 LIMIT 1`, [finalAgentId]);
                    const ag = ar.rows[0];
                    await pool.query(
                        `UPDATE leads SET assigned_user_id = $1, lead_status = 'contacted',
                                assigned_at = NOW(), updated_at = NOW()
                          WHERE id = $2`, [ag?.user_id || null, newLeadId]);
                    if (ag?.email) {
                        emailService.sendMatchedAgentNotification({
                            to: ag.email,
                            agentFirstName: (ag.display_name || '').split(' ')[0] || 'there',
                            lead: {
                                id: newLeadId, name, email, phone, notes,
                                type: enumType, source,
                                address: listing?.title
                                    || propAddress
                                    || [propStreet, propCity].filter(Boolean).join(', ')
                                    || null,
                            },
                            distanceMiles: null,
                            matchedAreas: [listing?.title].filter(Boolean),
                        });
                    }
                    // Instant SMS to the posting agent (no-op until Twilio set).
                    sms.notifyAgentNewLead({
                        userId: ag?.user_id, agentId: finalAgentId,
                        lead: { name, email, phone, type: enumType, hot: leadScore.tier === 'hot',
                                address: listing?.title || propAddress || [propStreet, propCity].filter(Boolean).join(', ') || null },
                    });
                    logActivity({
                        event_type: 'lead.route_assigned', event_scope: 'lead',
                        actor: { type: 'system', label: 'lead-router' },
                        target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                        details: { direct: true, listing_id: listingId, assigned_agent_id: finalAgentId, assigned_user_id: ag?.user_id || null },
                    });
                } catch (e) { console.warn('[lead direct-assign] failed:', e.message); }
            })();
        }

        // Fire-and-forget geo routing: if we captured a property address,
        // geocode it, find agents whose service-area tags fall within the
        // configured radius, email each matched agent, and record the
        // match set in lead_tags for audit/routing history.
        const addressForRouting = propAddress
            || [propStreet, propCity, propState, propZip].filter(Boolean).join(', ')
            || null;
        // Route when we have a property address to geocode OR the lead is tied
        // to a lake (lake-page leads have no address but still route to the
        // lake's founder).
        if (newLeadId && (addressForRouting || leadLakeId)) {
            (async () => {
                try {
                    const geo = addressForRouting ? await geocodeAddress(addressForRouting) : null;

                    // Record which town tags matched (+ distance) for audit — only
                    // when we geocoded an address.
                    if (geo) {
                        const { tags } = await matchTagsAndUsers({ lat: geo.lat, lng: geo.lng });
                        if (tags.length) {
                            const valuesSql = tags.map((_, i) =>
                                `($1, $${i + 2}, $${i + 2 + tags.length})`
                            ).join(', ');
                            const params = [
                                newLeadId,
                                ...tags.map(t => t.id),
                                ...tags.map(t => t.distance_miles),
                            ];
                            await pool.query(
                                `INSERT INTO lead_tags (lead_id, tag_id, distance_miles) VALUES ${valuesSql}`,
                                params
                            );
                        }
                    }

                    // ── Auto-assign via router ──
                    // Skip routing if a direct agent_id was supplied (e.g., lead
                    // came from an agent-profile-specific form). That agent stays.
                    if (finalAgentId) {
                        logActivity({
                            event_type: 'lead.route_skipped_direct_assign',
                            event_scope: 'lead',
                            actor: { type: 'system', label: 'lead-router' },
                            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                            details: { reason: 'direct_agent_id_provided', agent_id: finalAgentId },
                        });
                        return;
                    }

                    const pick = await routeLead({ lat: geo?.lat, lng: geo?.lng, lakeId: leadLakeId });
                    if (!pick) {
                        // No eligible agent in any nearby tag — lead stays
                        // unassigned. Log it AND email admin so it doesn't
                        // sit in the queue silently (matched-area tags
                        // existed but no active agent claimed them).
                        logActivity({
                            event_type: 'lead.route_unassigned',
                            event_scope: 'lead',
                            severity: 'warning',
                            actor: { type: 'system', label: 'lead-router' },
                            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                            details: { lat: geo?.lat, lng: geo?.lng, lake_id: leadLakeId, reason: 'no_eligible_agent' },
                        });
                        emailService.sendAdminLeadNotification({
                            name,
                            first_name: firstName,
                            email,
                            phone,
                            type: enumType,
                            source: source ? `${source} · UNROUTED` : 'UNROUTED',
                            notes: `Routing failed — no eligible agent in the matched service areas near "${geo?.formattedAddress || addressForRouting || 'the selected lake'}". Lead needs manual assignment from the admin Leads queue.\n\n${notes || ''}`.trim(),
                        });
                        return;
                    }

                    // Assign the lead. assigned_user_id is the agent's user record;
                    // agent_id is the agents table row.
                    await pool.query(
                        `UPDATE leads
                            SET agent_id         = $1,
                                assigned_user_id = $2,
                                lead_status      = 'contacted',
                                assigned_at      = NOW(),
                                updated_at       = NOW()
                          WHERE id = $3`,
                        [pick.agentId, pick.userId, newLeadId]
                    );

                    // Email just the assigned agent.
                    emailService.sendMatchedAgentNotification({
                        to: pick.email,
                        agentFirstName: (pick.fullName || '').split(' ')[0] || 'there',
                        lead: {
                            id: newLeadId,
                            name,
                            email,
                            phone,
                            notes,
                            type: enumType,
                            source,
                            address: geo?.formattedAddress || addressForRouting || pick.lakeName || null,
                        },
                        distanceMiles: pick.distanceMiles,
                        matchedAreas: [pick.lakeName || pick.tagName].filter(Boolean),
                    });

                    // Instant SMS to the assigned agent (speed-to-lead). No-op
                    // until Twilio is configured; flags 🔥 hot leads.
                    sms.notifyAgentNewLead({
                        userId: pick.userId, agentId: pick.agentId,
                        lead: { name, email, phone, type: enumType, hot: leadScore.tier === 'hot',
                                address: geo?.formattedAddress || addressForRouting || pick.lakeName || null },
                    });

                    logActivity({
                        event_type: 'lead.route_assigned',
                        event_scope: 'lead',
                        actor: { type: 'system', label: 'lead-router' },
                        target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                        details: {
                            lat: geo?.lat, lng: geo?.lng,
                            lake_id: pick.lakeId || null, lake_name: pick.lakeName || null,
                            tag_id: pick.tagId || null, tag_name: pick.tagName || null,
                            tier: pick.tierCode,
                            assigned_user_id: pick.userId,
                            assigned_agent_id: pick.agentId,
                        },
                    });
                } catch (err) {
                    console.warn('[lead routing] failed:', err.message);
                }
            })();
        }

        res.status(201).json({ success: true, message: 'Lead logged' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to insert lead' });
    }
};

// PROTECTED (Admin Only)
const getAdminLeads = async (req, res) => {
    try {
        const query = `
            SELECT l.id, l.full_name as name, l.email, l.phone, l.lead_type as type,
                   l.lead_source as source, l.lead_status as status, l.created_at,
                   a.display_name as assigned_agent_name, u.full_name as assigned_user_name,
                   l.agent_id, l.is_partial, l.lead_score, l.lead_tier
            FROM leads l
            LEFT JOIN agents a ON l.agent_id = a.id
            LEFT JOIN users u ON l.assigned_user_id = u.id
            ORDER BY l.created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// GET /api/leads/mine — every lead linked to the signed-in user's account.
// Powers the "Your submissions" section on the user dashboard. Requires auth.
//
// Email is the universal identity key, so we match on user_id OR the
// account's own email — this guarantees the dashboard shows EVERY lead
// submitted with that email even if the signup-time backfill missed one
// (e.g. a lead created through a path that didn't link, or a timing gap).
// We also opportunistically backfill: any matching-email lead whose
// user_id is still NULL gets claimed for this account on read, so the
// data self-heals and admin views show the linkage too.
const getMyLeads = async (req, res) => {
    try {
        // Resolve the account's canonical (lowercased) email once.
        const ures = await pool.query(`SELECT LOWER(email) AS email FROM users WHERE id = $1`, [req.user.userId]);
        const myEmail = ures.rows[0]?.email || null;

        // Self-heal: claim any unlinked leads that share this email.
        if (myEmail) {
            pool.query(
                `UPDATE leads SET user_id = $1, updated_at = NOW()
                  WHERE LOWER(email) = $2 AND user_id IS NULL AND deleted_at IS NULL`,
                [req.user.userId, myEmail]
            ).catch(e => console.error('[leads.getMyLeads] backfill failed:', e.message));
        }

        const { rows } = await pool.query(
            `SELECT id, full_name, email, phone, lead_type, lead_source, lead_status,
                    property_address, message, submitted_at, created_at
               FROM leads
              WHERE deleted_at IS NULL
                AND (user_id = $1 OR ($2::text IS NOT NULL AND LOWER(email) = $2))
              ORDER BY created_at DESC`,
            [req.user.userId, myEmail]
        );
        res.json(rows);
    } catch (err) {
        console.error('[leads.getMyLeads]', err.message);
        res.status(500).json({ error: 'Failed to load your submissions.' });
    }
};

// POST /api/leads/partial — progressive capture. Fired the moment a visitor
// gives contact info (email/phone) in the lead form, and again on abandon. Saves
// an INCOMPLETE lead keyed by the client's lead_session_id so we recover people
// who don't finish the form. Partial leads are NEVER routed to an agent and
// never trigger notifications — they sit in the admin queue (flagged partial)
// and feed the nurture drip. When the visitor finishes, createLead deletes this
// row and inserts the complete, routed lead.
const createPartialLead = async (req, res) => {
    try {
        const b = req.body || {};
        const sessionId = (b.lead_session_id || '').toString().trim().slice(0, 64);
        if (!sessionId) return res.status(400).json({ error: 'lead_session_id required.' });

        const name  = (b.name || '').toString().trim().slice(0, 200) || 'Incomplete lead';
        const email = (b.email || '').toString().trim().toLowerCase().slice(0, 255) || null;
        const phone = (b.phone || '').toString().trim().slice(0, 50) || null;
        // Nothing to reach them by → nothing worth saving.
        if (!email && !(phone && phone.replace(/[^0-9]/g, '').length >= 7)) {
            return res.json({ success: true, saved: false });
        }

        const firstName = name.split(' ')[0] || 'Lead';
        const notes = (b.notes || '').toString().slice(0, 4000) || null;
        const source = (b.source || 'partial').toString().slice(0, 80);
        const propAddress = (b.property_address || '').toString().trim().slice(0, 500) || null;
        const isWaterfront = (b.is_waterfront === true || b.is_waterfront === false) ? b.is_waterfront : null;
        let wf = parseInt(b.waterfront_feet, 10); if (!Number.isFinite(wf) || wf < 0 || wf > 100000) wf = null;

        const enumMap = { buyer: 'buyer', seller: 'seller' };
        const enumType = enumMap[source] || 'general_contact';
        const score = scoreLead({ enumType, email, phone, notes, isWaterfront, wfFeetNum: wf, address: propAddress });

        // Resolve lake by slug if the form was opened on a lake page.
        let leadLakeId = null;
        const lakeSlug = (b.lake_slug || '').toString().trim().slice(0, 120);
        if (lakeSlug) {
            try { leadLakeId = (await pool.query(`SELECT id FROM lakes WHERE slug = $1 LIMIT 1`, [lakeSlug])).rows[0]?.id || null; }
            catch (_) {}
        }

        // Link to an existing user account by email (backfill happens on signup too).
        let userId = null;
        if (email) {
            try { userId = (await pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [email])).rows[0]?.id || null; }
            catch (_) {}
        }

        await pool.query(
            `INSERT INTO leads (
                full_name, first_name, email, phone, message,
                lead_type, lead_source, lead_status, property_address,
                is_waterfront, waterfront_feet, lead_score, lead_tier,
                lead_session_id, is_partial, user_id, lake_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10,$11,$12,$13,TRUE,$14,$15)
             ON CONFLICT (lead_session_id) WHERE lead_session_id IS NOT NULL
             DO UPDATE SET
                full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name,
                email = EXCLUDED.email, phone = EXCLUDED.phone, message = EXCLUDED.message,
                lead_type = EXCLUDED.lead_type, lead_source = EXCLUDED.lead_source,
                property_address = EXCLUDED.property_address, is_waterfront = EXCLUDED.is_waterfront,
                waterfront_feet = EXCLUDED.waterfront_feet, lead_score = EXCLUDED.lead_score,
                lead_tier = EXCLUDED.lead_tier, user_id = COALESCE(EXCLUDED.user_id, leads.user_id),
                lake_id = COALESCE(EXCLUDED.lake_id, leads.lake_id), updated_at = NOW()
             WHERE leads.is_partial = TRUE`,
            [name, firstName, email, phone, notes, enumType, source, propAddress,
             isWaterfront, wf, score.score, score.tier, sessionId, userId, leadLakeId]);

        res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[createPartialLead]', err.message);
        // Never surface an error to the form — partial capture is best-effort.
        res.json({ success: true, saved: false });
    }
};

module.exports = { createLead, createPartialLead, getAdminLeads, getMyLeads };
