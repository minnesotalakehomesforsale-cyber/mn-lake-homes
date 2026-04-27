/**
 * inquiry.controller.js — Contact-form inquiries
 *
 * Handles public contact-form submissions from:
 *   - /pages/public/contact.html (MN Lake Homes)
 *   - /pages/public/commonrealtor.html (CommonRealtor)
 *
 * Every submission:
 *   1. Writes a row to contact_inquiries
 *   2. Sends an admin notification email (routed by source)
 *   3. Sends a confirmation email to the submitter
 */

const pool = require('../database/pool');
const email = require('../services/email');
const hubspot = require('../services/hubspot');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { logActivity } = require('../services/activity-log');

// ─── Resume upload config ────────────────────────────────────────────────────
const RESUME_DIR = path.join(__dirname, '..', '..', 'assets', 'uploads', 'resumes');
if (!fs.existsSync(RESUME_DIR)) fs.mkdirSync(RESUME_DIR, { recursive: true });

const resumeStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, RESUME_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
        const safe = path.basename(file.originalname, ext).toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'resume';
        cb(null, `resume-${Date.now()}-${safe}${ext}`);
    }
});
const resumeUpload = multer({
    storage: resumeStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        // Accept PDFs, Word docs, and common image formats (for scanned resumes)
        const ok = /\.(pdf|docx?|rtf|txt|pages|png|jpe?g)$/i.test(file.originalname);
        if (ok) cb(null, true);
        else cb(new Error('Please upload a PDF, Word doc, or image.'));
    }
}).single('resume');

// POST /api/inquiries/upload-resume — public, accepts a file, returns URL
exports.uploadResume = (req, res) => {
    resumeUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        res.json({
            url: `/assets/uploads/resumes/${req.file.filename}`,
            filename: req.file.originalname,
            size: req.file.size,
        });
    });
};

const ADMIN_EMAIL_BY_SOURCE = {
    mnlakehomes:  'minnesotalakehomesforsale@gmail.com',
    commonrealtor:'thecommonrealtor@gmail.com',
};

// ─── Public: POST /api/inquiries ─────────────────────────────────────────────
exports.createInquiry = async (req, res) => {
    try {
        let { name, email: submitterEmail, phone, inquirer_type, message, source, page_url } = req.body;

        name = (name || '').trim();
        submitterEmail = (submitterEmail || '').trim().toLowerCase();
        message = (message || '').trim();
        source = (source === 'commonrealtor') ? 'commonrealtor' : 'mnlakehomes';

        if (!name || !submitterEmail || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) {
            return res.status(400).json({ error: 'Invalid email address.' });
        }

        const { rows } = await pool.query(`
            INSERT INTO contact_inquiries
                (source, name, email, phone, inquirer_type, message, page_url, status, is_read)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', false)
            RETURNING id, created_at
        `, [source, name, submitterEmail, phone || null, inquirer_type || null, message, page_url || null]);

        const saved = rows[0];
        const adminTo = ADMIN_EMAIL_BY_SOURCE[source];

        // Fire-and-forget notifications
        email.sendInquiryNotification({
            to: adminTo,
            source, name, email: submitterEmail, phone, inquirer_type, message,
            inquiryId: saved.id, createdAt: saved.created_at,
        });
        email.sendInquiryConfirmation({
            to: submitterEmail, name, source,
        });

        // Fire-and-forget HubSpot mirror — these are top-of-funnel leads,
        // exactly what HubSpot's marketing tooling is for.
        (async () => {
            const [first, ...rest] = String(name).split(' ');
            const r = await hubspot.syncContact({
                email: submitterEmail,
                firstname: first || '',
                lastname:  rest.join(' '),
                phone: phone || undefined,
                user_type: 'inquiry',
                signup_source: source === 'commonrealtor' ? 'commonrealtor_contact' : 'mnlakehomes_contact',
            });
            if (r?.id) {
                pool.query(`UPDATE contact_inquiries SET hs_contact_id = $1 WHERE id = $2`, [r.id, saved.id])
                    .catch(e => console.error('[hubspot] save id failed:', e.message));
            }
        })();

        logActivity({
            event_type: 'inquiry.create',
            event_scope: 'inquiry',
            actor: { type: 'public', label: submitterEmail },
            target: { type: 'inquiry', id: saved.id, label: `${name} via ${source}` },
            details: { source, inquirer_type, page_url },
            req,
        });

        res.status(201).json({ success: true, id: saved.id });
    } catch (err) {
        console.error('[inquiry.createInquiry]', err.message);
        res.status(500).json({ error: 'Failed to submit inquiry.' });
    }
};

// ─── Admin: GET /api/inquiries ───────────────────────────────────────────────
exports.getInquiries = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, source, name, email, phone, inquirer_type, message,
                   page_url, status, is_read, created_at, updated_at
            FROM contact_inquiries
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[inquiry.getInquiries]', err.message);
        res.status(500).json({ error: 'Failed to fetch inquiries.' });
    }
};

// ─── Admin: GET /api/inquiries/unread-count ──────────────────────────────────
exports.getUnreadCount = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count FROM contact_inquiries WHERE is_read = false AND deleted_at IS NULL`
        );
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error('[inquiry.getUnreadCount]', err.message);
        res.status(500).json({ error: 'Failed to fetch unread count.' });
    }
};

// ─── Admin: PATCH /api/inquiries/:id ─────────────────────────────────────────
exports.updateInquiry = async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    try {
        const fields = [];
        const vals = [];
        let i = 1;

        if ('status' in body) {
            if (!['new', 'pending', 'complete'].includes(body.status)) {
                return res.status(400).json({ error: 'Invalid status.' });
            }
            fields.push(`status = $${i++}`); vals.push(body.status);
        }
        if ('is_read' in body) {
            fields.push(`is_read = $${i++}`); vals.push(!!body.is_read);
        }

        if (!fields.length) return res.json({ success: true, noop: true });

        fields.push(`updated_at = NOW()`);
        vals.push(id);
        const { rowCount } = await pool.query(
            `UPDATE contact_inquiries SET ${fields.join(', ')} WHERE id = $${i}`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Inquiry not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[inquiry.updateInquiry]', err.message);
        res.status(500).json({ error: 'Failed to update inquiry.' });
    }
};

// ─── Admin: DELETE /api/inquiries/:id ────────────────────────────────────────
exports.deleteInquiry = async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE contact_inquiries SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Inquiry not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[inquiry.deleteInquiry]', err.message);
        res.status(500).json({ error: 'Failed to delete inquiry.' });
    }
};
