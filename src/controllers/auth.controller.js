const pool = require('../database/pool');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const setCookie = (res, token) => {
    res.cookie('auth_session', token, {
        httpOnly: true, // Prevents XSS script scraping
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400000 // 24 hours
    });
};

const register = async (req, res) => {
    let { email, password, display_name, license_number, brokerage_name } = req.body;
    
    // Test 2.7 & 2.3 Normalization
    email = (email || '').trim().toLowerCase();
    display_name = (display_name || '').trim();
    password = (password || '');

    if (!email || !password || !display_name) {
        return res.status(400).json({ error: 'Missing core identity fields.' });
    }

    // Test 2.4 Email Validation Regex
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format strictly rejected.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check Duplex
        const userExists = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) throw new Error('Email already registered');

        // Hash
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 1. Create User
        const userRes = await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status) 
             VALUES ($1, $2, $3, $4, $5, 'agent', 'active') RETURNING id`,
            [display_name.split(' ')[0], display_name.split(' ')[1] || '', display_name, email, hashedPassword]
        );
        const userId = userRes.rows[0].id;

        // 2. Resolve default Basic Membership ID
        const memRes = await client.query(`SELECT id FROM memberships WHERE code = 'basic' LIMIT 1`);
        const basicId = memRes.rows[0]?.id;

        // 3. Create Agent Table record
        const slugStr = display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await client.query(
            `INSERT INTO agents (user_id, membership_id, slug, display_name, license_number, brokerage_name, profile_status, is_published)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', false)`,
            [userId, basicId, slugStr, display_name, license_number, brokerage_name]
        );

        await client.query('COMMIT');

        // Issue Session
        const token = jwt.sign({ userId, role: 'agent' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setCookie(res, token);
        
        res.status(201).json({ success: true, message: 'Agent registered mapping created' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await pool.query('SELECT id, password_hash, role, account_status FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = userRes.rows[0];
        
        // Bypass bcrypt check explicitly ONLY for the mock super admin mapped in schema.sql
        let validPassword = false;
        if (user.password_hash === '$2b$10$MOCK_HASH_DO_NOT_DEPLOY' && password === 'admin') validPassword = true;
        else validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.account_status !== 'active') return res.status(403).json({ error: 'Account suspended' });

        const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setCookie(res, token);

        res.json({ success: true, role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

const logout = (req, res) => {
    res.clearCookie('auth_session');
    res.json({ success: true });
};

const session = (req, res) => {
    // If middleware passed, req.user exists
    res.json({ userId: req.user.userId, role: req.user.role });
};

module.exports = { register, login, logout, session };
