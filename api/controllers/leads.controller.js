/**
 * PHASE 7: LEADS CENTRAL INBOX CONTROLLER (SCAFFOLD)
 * 
 * Maps generic forms dynamically across the site into the singular `leads` table,
 * managing the JSONB storage format implicitly, and assigning Operational Triage boundaries.
 */

// const db = require('../db'); 

// -------------------------------------------------------------
// PUBLIC: Ingestion Engine (No Auth Required)
// POST /api/leads
// -------------------------------------------------------------
exports.createLead = async (req, res) => {
    try {
        const { lead_source, full_name, email, phone, message, ...extraFields } = req.body;

        if (!full_name || (!email && !phone)) {
            return res.status(400).json({ error: "Name and at least one contact method (email or phone) is required." });
        }

        // 1. Dynamic Definition Mapping
        let leadType = 'general_contact';
        let assignedUser = null; 

        // Safely determine origin intent
        switch(lead_source) {
            case 'buy_page':
                leadType = 'buyer';
                break;
            case 'sell_page':
                leadType = 'seller';
                break;
            case 'join_page':
                leadType = 'join_request';
                break;
            case 'agent_profile':
                leadType = 'agent_inquiry';
                // Note: The UI payload must explicitly pass `agent_id` tracking back to the profile viewed
                assignedUser = req.body.agent_id || null; 
                break;
        }

        // 2. Transact safely bundling raw extra variables natively into Postgres JSONB
        /*
        const query = `
            INSERT INTO leads (lead_type, lead_source, full_name, email, phone, message, form_payload_json, lead_status, assigned_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id;
        `;
        
        // Strip out the defined `agent_id` if present so it doesn't double-store
        if (extraFields.agent_id) delete extraFields.agent_id;

        const result = await db.query(query, [
            leadType, 
            lead_source, 
            full_name.trim(), 
            email?.trim() || null, 
            phone?.trim() || null, 
            message?.trim() || null, 
            JSON.stringify(extraFields), // Safe JSONB dumping
            'new',
            assignedUser
        ]);

        // Optional Log
        await db.query(
            "INSERT INTO activity_log (entity_type, entity_id, action, action_label) VALUES ('lead', $1, 'lead_created', 'New generic site lead captured')",
            [result.rows[0].id]
        );
        */

        return res.status(201).json({ message: "Thank you. Your request has been securely submitted." });

    } catch (err) {
        console.error('Lead formatting error:', err);
        return res.status(500).json({ error: "System failure attempting to map payload." });
    }
};

// -------------------------------------------------------------
// ADMIN: Unified Triage Access (Auth Required)
// -------------------------------------------------------------

// PATCH /api/admin/leads/:id/assign
exports.assignLead = async (req, res) => {
    try {
        const leadId = req.params.id;
        const targetAgentId = req.body.agent_id; 
        const adminId = req.user.userId;

        // --- BEGIN TRANSACTION ---
        
        /*
        // 1. Invalidate previous assignments logically inside `lead_assignments`
        await db.query(`UPDATE lead_assignments SET is_current = false WHERE lead_id = $1`, [leadId]);

        // 2. Log formal routing schema in sub-table
        await db.query(
            `INSERT INTO lead_assignments (lead_id, assigned_to_user_id, assigned_by_user_id, is_current)
             VALUES ($1, $2, $3, true)`,
            [leadId, targetAgentId, adminId]
        );

        // 3. Mutate the main `leads` relational map explicitly and optionally upgrade status
        await db.query(
            `UPDATE leads 
             SET assigned_user_id = $1, lead_status = 'assigned', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 AND lead_status IN ('new', 'unassigned')`,
            [targetAgentId, leadId]
        );

        await db.query(
            "INSERT INTO activity_log (actor_user_id, entity_type, entity_id, action) VALUES ($1, 'lead', $2, 'lead_assigned')",
            [adminId, leadId]
        );
        */
        
        // --- COMMIT TRANSACTION ---
        return res.status(200).json({ message: "Lead assigned securely." });
    } catch(err) {
        return res.status(500).json({ error: "Assignment routing failure." });
    }
};

// POST /api/admin/leads/:id/notes
exports.addLeadNote = async (req, res) => {
    try {
        const leadId = req.params.id;
        const authorId = req.user.userId;
        const { note_content } = req.body;

        if (!note_content || note_content.trim() === '') {
            return res.status(400).json({ error: 'Text block cannot be empty.' });
        }

        /*
        await db.query(
            `INSERT INTO lead_notes (lead_id, author_user_id, note_content) VALUES ($1, $2, $3)`,
            [leadId, authorId, note_content.trim()]
        );
        */
        
        return res.status(201).json({ message: "Internal note explicitly logged." });
    } catch(err) {
        return res.status(500).json({ error: "Failed to process internal logging variable." });
    }
};

// PATCH /api/admin/leads/:id/status
exports.updateLeadStatus = async (req, res) => {
    try {
        const { status } = req.body; // e.g. 'contacted', 'in_progress', 'closed', 'archived'
        const leadId = req.params.id;

        const validStatuses = ['new', 'unassigned', 'assigned', 'contacted', 'in_progress', 'closed', 'archived'];
        if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status definition" });

        /*
        await db.query("UPDATE leads SET lead_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [status, leadId]);
        */

        return res.status(200).json({ message: `Lead mutated to ${status} state.` });
    } catch (err) {
        return res.status(500).json({ error: "Failed to persist Lead Status update." });
    }
};
