/**
 * PHASE 3: AUTHENTICATION CONTROLLER (SCAFFOLD)
 * 
 * This controller handles login verification, JWT cookie issuance, and logging out.
 * 
 * Dependencies assumed:
 * - bcrypt (for validating password_hash)
 * - jsonwebtoken (for issuing JWTs)
 * - db (your PostgreSQL client connection e.g. pg / Prisma)
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const db = require('../db'); // Replace with actual DB connection

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-development-only';


// POST /api/auth/register
exports.register = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, brokerage, password } = req.body;

        // 1. Core Validation Strip
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: "Required fields missing" });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters" });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 2. Check explicitly for duplicate emails across users table
        /*
        const { rows: existingUsers } = await db.query(
            "SELECT id FROM users WHERE email = $1", [normalizedEmail]
        );
        if (existingUsers.length > 0) {
            return res.status(409).json({ error: "An account with this email already exists" });
        }
        */

        // 3. Cryptographic Hashing
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // --- BEGIN TRANSACTION BLOCK (Pseudo-code for exact queries required by dev) ---
        // await db.query("BEGIN");

        // 4. Inject base User Identity (Role: "agent", Account Status: "active")
        /*
        const userRes = await db.query(
            `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, account_status) 
             VALUES ($1, $2, $3, $4, $5, 'agent', 'active') RETURNING id`,
            [firstName, lastName, normalizedEmail, phone, passwordHash]
        );
        const newUserId = userRes.rows[0].id;
        */
        const newUserId = "uuid-stub"; // Mocked

        // 5. Slug Generation Engine (Ensuring uniqueness)
        let baseSlug = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, "-");
        // Loop check: SELECT id FROM agents WHERE slug = baseSlug -> If exists, append e.g. -2

        // 6. Inject linked Agent Record (Status: "draft", Published: false, Tier: "Basic")
        /*
        // Subquery required to grab "Basic" membership tier UUID natively:
        const tierRes = await db.query("SELECT id FROM memberships WHERE code = 'basic'");
        const basicTierId = tierRes.rows[0].id;

        await db.query(
            `INSERT INTO agents (user_id, membership_id, slug, display_name, brokerage_name, profile_status, is_published)
             VALUES ($1, $2, $3, $4, $5, 'draft', false)`,
            [newUserId, basicTierId, baseSlug, `${firstName} ${lastName}`, brokerage]
        );
        */

        // 7. Inject Audit Loop
        /*
        await db.query(
            `INSERT INTO activity_log (actor_user_id, entity_type, entity_id, action, action_label)
             VALUES ($1, 'agent', $2, 'created', 'Agent registration created draft shell')`,
            [newUserId, newUserId]
        );
        */

        // await db.query("COMMIT");
        // --- END TRANSACTION BLOCK ---

        // 8. Session Generation
        const tokenPayload = { userId: newUserId, role: "agent" };
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "8h" });
        
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 8 * 60 * 60 * 1000
        });

        return res.status(201).json({
            message: "Account provisioned successfully. Profile requires completeness and admin approval before going public.",
            user: { role: "agent", status: "active" }
        });

    } catch (error) {
        // await db.query("ROLLBACK");
        console.error("Registration Error:", error);
        return res.status(500).json({ error: "Internal server error during registration." });
    }
};

// POST /api/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // 1. Fetch user by email via raw SQL or ORM
        /*
        const { rows } = await db.query(
            'SELECT id, password_hash, role, account_status FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        const user = rows[0];
        */
        const user = null; // Mock value until DB wired

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 2. Validate Account Status
        if (user.account_status !== 'active') {
            return res.status(403).json({ error: `Account is ${user.account_status}. Please contact support.` });
        }

        // 3. Verify bcrypt hash
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 4. Generate JWT Payload locking them into their RBAC Role Matrix.
        const tokenPayload = {
            userId: user.id,
            role: user.role
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

        // 5. Issue HTTP-Only Secure Cookie (Prevents XSS attacks in frontend)
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000 // 8 hours
        });

        // Update last_login_at in background...
        // await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        return res.status(200).json({
            message: 'Authentication successful',
            user: {
                id: user.id,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
    // This route uses auth.middleware to populate req.user first
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Fetch full user profile from DB to ensure they still exist and status is still active
    /*
    const { rows } = await db.query(
        'SELECT id, email, first_name, last_name, role, account_status FROM users WHERE id = $1',
        [req.user.userId]
    );
    const userProfile = rows[0];
    */
    const userProfile = null; // Mock

    if (!userProfile || userProfile.account_status !== 'active') {
        res.clearCookie('token');
        return res.status(401).json({ error: 'Session invalidated' });
    }

    return res.status(200).json({ user: userProfile });
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    return res.status(200).json({ message: 'Logged out successfully' });
};
