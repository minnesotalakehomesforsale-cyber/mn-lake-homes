const pool = require('../database/pool');

const getLedger = async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.email, m.name as membership_name
            FROM agents a
            JOIN users u ON a.user_id = u.id
            JOIN memberships m ON a.membership_id = m.id
            ORDER BY a.created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to access agent ledger' });
    }
};

const getAgentDetail = async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.email, m.name as membership_name
            FROM agents a
            JOIN users u ON a.user_id = u.id
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.id = $1
        `;
        const { rows } = await pool.query(query, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed payload fetch' });
    }
};

const updateStatus = async (req, res) => {
    const { status, membership_name } = req.body;
    const { id } = req.params;
    
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // 1. Resolve potential membership change
            let memIdUpdate = null;
            if (membership_name && membership_name !== 'Select Tier') {
                const memRes = await client.query('SELECT id FROM memberships WHERE name = $1', [membership_name]);
                if (memRes.rows.length > 0) memIdUpdate = memRes.rows[0].id;
            }

            // 2. Determine bool maps
            let isPublished = false;
            let pubStamp = null;
            if (status === 'published') {
                isPublished = true;
                pubStamp = new Date().toISOString();
            }

            // 3. Execute
            const updateTokens = [];
            const updateVals = [];
            let c = 1;
            
            if (status) { updateTokens.push(`profile_status = $${c++}`); updateVals.push(status); }
            if (status) { updateTokens.push(`is_published = $${c++}`); updateVals.push(isPublished); }
            if (pubStamp) { updateTokens.push(`published_at = $${c++}`); updateVals.push(pubStamp); }
            if (memIdUpdate) { updateTokens.push(`membership_id = $${c++}`); updateVals.push(memIdUpdate); }

            updateVals.push(id); // Where arg

            await client.query(`UPDATE agents SET ${updateTokens.join(', ')} WHERE id = $${c}`, updateVals);
            await client.query('COMMIT');
            
            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// LEADS ADMIN OPERATIONS

const getLeadDetail = async (req, res) => {
    try {
        const query = `
            SELECT l.*, a.display_name as assigned_agent_name, u.full_name as assigned_user_name
            FROM leads l
            LEFT JOIN agents a ON l.agent_id = a.id
            LEFT JOIN users u ON l.assigned_user_id = u.id
            WHERE l.id = $1
        `;
        const { rows } = await pool.query(query, [req.params.id]);
        if(rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
        
        // Fix 3: Schema uses user_id and note_body (not author_id / content)
        const notesRes = await pool.query(`
            SELECT n.id, n.note_body as content, n.created_at, u.full_name as author_name 
            FROM lead_notes n 
            JOIN users u ON n.user_id = u.id 
            WHERE n.lead_id = $1 ORDER BY n.created_at DESC
        `, [req.params.id]);

        const lead = rows[0];
        lead.notes = notesRes.rows;
        
        res.json(lead);
    } catch (err) {
        console.error('getLeadDetail error:', err);
        res.status(500).json({ error: 'Server error pulling lead' });
    }
};

const updateLeadStatus = async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query('UPDATE leads SET lead_status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update lead status' });
    }
};

const assignLead = async (req, res) => {
    try {
        // Can assign to an agent OR a sys user natively
        const { agentId, userId } = req.body;
        const agIdMap = agentId || null;
        const uIdMap = userId || null;

        await pool.query('UPDATE leads SET agent_id = $1, assigned_user_id = $2, lead_status = $3 WHERE id = $4', [agIdMap, uIdMap, 'assigned', req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to map assignment' });
    }
};

const addLeadNote = async (req, res) => {
    try {
        const { content } = req.body;
        if(!content || !content.trim()) return res.status(400).json({ error: 'Blank notes suppressed' });
        
        // Fix 3: Schema column is user_id and note_body (not author_id / content)
        await pool.query(
            'INSERT INTO lead_notes (lead_id, user_id, note_body) VALUES ($1, $2, $3)',
            [req.params.id, req.user.userId, content.trim()]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('addLeadNote error:', err);
        res.status(500).json({ error: 'Failed to register note to log' });
    }
};

module.exports = { getLedger, getAgentDetail, updateStatus, getLeadDetail, updateLeadStatus, assignLead, addLeadNote };
