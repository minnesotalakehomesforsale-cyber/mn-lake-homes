const pool = require('../database/pool');
const emailService = require('../services/email');
const hubspot = require('../services/hubspot');
const { logActivity } = require('../services/activity-log');
const { geocodeAddress } = require('../services/geocoder');
const { matchTagsAndUsers } = require('../services/tag-matcher');
const { routeLead } = require('../services/lead-router');
const { getLeadMagnetForType } = require('../services/lead-magnet');

const createLead = async (req, res) => {
    let {
        name, email, phone, notes, source, agent_id,
        property_address, property_street, property_city,
        property_state, property_zip, property_place_id, lake_slug,
    } = req.body;

    name = (name || '').trim();
    email = (email || '').trim().toLowerCase();

    // Test 9.6: Block missing fields immediately
    if (!name || (!email && !(phone || '').trim())) {
        return res.status(400).json({ error: 'Name and either Email or Phone are required to dispatch lead.' });
    }

    const str = (v, max) => {
        if (v === null || v === undefined || v === '') return null;
        return String(v).trim().slice(0, max) || null;
    };
    const propAddress = str(property_address, 500);
    const propStreet  = str(property_street, 255);
    const propCity    = str(property_city, 120);
    const propState   = str(property_state, 50);
    const propZip     = str(property_zip, 20);
    const propPlaceId = str(property_place_id, 255);

    try {
        // Coerce agent string if dummy provided
        const finalAgentId = (agent_id && agent_id !== 'uuid-string-dummy') ? agent_id : null;

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
                user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12, $13, $14, $15)
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

        const { rows: leadRows } = await pool.query(query, [
            name, firstName, email, phone, notes,
            enumType, source, finalAgentId,
            propAddress, propStreet, propCity, propState, propZip, propPlaceId,
            submittedUserId,
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
                   l.agent_id
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

module.exports = { createLead, getAdminLeads, getMyLeads };
