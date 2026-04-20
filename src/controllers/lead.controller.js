const pool = require('../database/pool');
const emailService = require('../services/email');
const { logActivity } = require('../services/activity-log');
const { geocodeAddress } = require('../services/geocoder');
const { matchTagsAndUsers } = require('../services/tag-matcher');

const createLead = async (req, res) => {
    let {
        name, email, phone, notes, source, agent_id,
        property_address, property_street, property_city,
        property_state, property_zip, property_place_id,
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

        const query = `
            INSERT INTO leads (
                full_name, first_name, email, phone, message,
                lead_type, lead_source, agent_id, lead_status,
                property_address, property_street, property_city,
                property_state, property_zip, property_place_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12, $13, $14)
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
        ]);
        const newLeadId = leadRows[0]?.id;

        logActivity({
            event_type: 'lead.create',
            event_scope: 'lead',
            actor: { type: 'public', label: email || phone || name },
            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
            details: { lead_type: enumType, source, agent_id: finalAgentId, email, phone },
            req,
        });

        // Fire-and-forget lead confirmation email (only if they provided one)
        if (email) {
            emailService.sendLeadConfirmation({ email, first_name: firstName, full_name: name });
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

        // Fire-and-forget geo routing: if we captured a property address,
        // geocode it, find agents whose service-area tags fall within the
        // configured radius, email each matched agent, and record the
        // match set in lead_tags for audit/routing history.
        const addressForRouting = propAddress
            || [propStreet, propCity, propState, propZip].filter(Boolean).join(', ')
            || null;
        if (newLeadId && addressForRouting) {
            (async () => {
                try {
                    const geo = await geocodeAddress(addressForRouting);
                    if (!geo) return;
                    const { tags, users } = await matchTagsAndUsers({ lat: geo.lat, lng: geo.lng });
                    if (!tags.length) return;

                    // Record which tags matched (+ each distance) for audit.
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

                    // Only notify active agent accounts. Admin roles see the
                    // existing "new lead" admin email and don't need dupes.
                    const tagNameById = new Map(tags.map(t => [t.id, `${t.name}, ${t.state}`]));
                    const recipients = users.filter(u => u.role === 'agent' && u.email);
                    recipients.forEach(u => {
                        const areas = (u.matched_tag_ids || []).map(id => tagNameById.get(id)).filter(Boolean);
                        emailService.sendMatchedAgentNotification({
                            to: u.email,
                            agentFirstName: (u.full_name || '').split(' ')[0] || 'there',
                            lead: {
                                id: newLeadId,
                                name,
                                email,
                                phone,
                                notes,
                                type: enumType,
                                source,
                                address: geo.formattedAddress || addressForRouting,
                            },
                            distanceMiles: u.min_distance_miles,
                            matchedAreas: areas,
                        });
                    });

                    logActivity({
                        event_type: 'lead.route_matched',
                        event_scope: 'lead',
                        actor: { type: 'system', label: 'tag-matcher' },
                        target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                        details: {
                            lat: geo.lat, lng: geo.lng,
                            tag_count: tags.length,
                            agent_count: recipients.length,
                            tag_ids: tags.map(t => t.id),
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

module.exports = { createLead, getAdminLeads };
