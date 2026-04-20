/**
 * cash-offer.controller.js — Public endpoints for the AI Cash Offer funnel.
 *
 * Flow:
 *   1. POST /api/cash-offer/lookup     → RentCast enrichment
 *   2. POST /api/cash-offer/generate   → server-side offer math
 *   3. POST /api/cash-offer/submit     → persist lead + notify admin
 *   4. POST /api/cash-offer/:id/selection → record cash vs. agent choice
 *   5. GET  /api/cash-offer/:id/pdf    → branded PDF download
 *
 * Every endpoint returns JSON (except the PDF stream). No endpoint ever
 * throws an HTML error page — the funnel must keep the user moving even
 * when upstream APIs (RentCast, Resend) fail.
 */

const pool = require('../database/pool');
const { lookupProperty } = require('../services/rentcast');
const { calculateOffer } = require('../services/cash-offer-calc');
const { streamOfferPdf } = require('../services/cash-offer-pdf');
const cashOfferEmail = require('../services/cash-offer-email');
const { logActivity } = require('../services/activity-log');

// ─── helpers ────────────────────────────────────────────────────────────────
function sanitizeStr(v, max = 500) {
    if (v === null || v === undefined) return null;
    return String(v).trim().slice(0, max) || null;
}

function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

async function loadConfig() {
    try {
        const { rows } = await pool.query(`SELECT * FROM cash_offer_config WHERE id = 1`);
        return rows[0] || null;
    } catch (err) {
        console.error('[cash-offer] config load failed:', err.message);
        return null;
    }
}

// ─── 1. POST /api/cash-offer/lookup ─────────────────────────────────────────
exports.lookup = async (req, res) => {
    try {
        const formattedAddress = sanitizeStr(req.body?.formattedAddress);
        const placeId          = sanitizeStr(req.body?.placeId);

        if (!formattedAddress) {
            return res.status(400).json({ error: 'formattedAddress is required.' });
        }

        const { propertyData, confidence } = await lookupProperty(formattedAddress);

        // Log the lookup attempt so we can audit RentCast usage later.
        logActivity({
            event_type: 'cash_offer.lookup',
            event_scope: 'cash_offer',
            actor: { type: 'public', label: 'visitor' },
            details: { formattedAddress, placeId, confidence, hasData: !!propertyData },
            req,
        });

        return res.json({ propertyData, confidence });
    } catch (err) {
        console.error('[cash-offer] lookup failed:', err.message);
        // Never break the funnel — degrade gracefully to manual entry.
        return res.json({ propertyData: null, confidence: 'low' });
    }
};

// ─── 2. POST /api/cash-offer/generate ───────────────────────────────────────
exports.generate = async (req, res) => {
    try {
        const avm       = numOrNull(req.body?.avm);
        const condition = sanitizeStr(req.body?.condition, 40);

        if (!avm || avm <= 0) {
            return res.status(400).json({ error: 'A valid AVM is required to generate an offer.' });
        }

        const config = await loadConfig();
        const { offerAmount, offerFactors } = calculateOffer({ avm, condition, config });
        const offerGeneratedAt = new Date().toISOString();

        return res.json({ offerAmount, offerFactors, offerGeneratedAt });
    } catch (err) {
        console.error('[cash-offer] generate failed:', err.message);
        return res.status(500).json({ error: 'Failed to generate offer.' });
    }
};

// ─── 3. POST /api/cash-offer/submit ─────────────────────────────────────────
exports.submit = async (req, res) => {
    try {
        const b = req.body || {};

        const full_name = sanitizeStr(b.full_name, 200);
        const email     = sanitizeStr((b.email || '').toLowerCase(), 200);
        const phone     = sanitizeStr(b.phone, 60);
        const address   = sanitizeStr(b.formattedAddress, 500);

        if (!full_name || !email || !phone) {
            return res.status(400).json({ error: 'Name, email, and phone are required.' });
        }
        if (!address) {
            return res.status(400).json({ error: 'Property address is required.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email address.' });
        }

        const placeId         = sanitizeStr(b.placeId, 200);
        const beds            = numOrNull(b.beds);
        const baths           = numOrNull(b.baths);
        const sqft            = numOrNull(b.sqft);
        const yearBuilt       = numOrNull(b.yearBuilt);
        const lotSize         = numOrNull(b.lotSize);
        const condition       = sanitizeStr(b.condition, 40);
        const avm             = numOrNull(b.avm);
        const lastSalePrice   = numOrNull(b.lastSalePrice);
        const lastSaleDate    = sanitizeStr(b.lastSaleDate, 40);
        const offerAmount     = numOrNull(b.offerAmount);

        // Re-compute if the client didn't send an offer (defensive).
        let finalOffer  = offerAmount;
        let finalFactors = b.offerFactors && typeof b.offerFactors === 'object' ? b.offerFactors : null;
        if (!finalOffer || !finalFactors) {
            const config = await loadConfig();
            const calc = calculateOffer({ avm, condition, config });
            finalOffer   = calc.offerAmount;
            finalFactors = calc.offerFactors;
        }

        const propertyDataJson = (b.propertyDataJson && typeof b.propertyDataJson === 'object')
            ? b.propertyDataJson
            : null;

        // Track which site the lead came from ('mn_lake' or 'commonrealtor').
        // Bound to 40 chars to match the column; unknowns collapse to null.
        const ALLOWED_SITES = new Set(['mn_lake', 'commonrealtor']);
        const rawSource = sanitizeStr(b.source_site, 40);
        const sourceSite = rawSource && ALLOWED_SITES.has(rawSource) ? rawSource : null;

        const insertSql = `
            INSERT INTO cash_offer_leads
              (status, full_name, email, phone,
               address_raw, place_id,
               property_data_json,
               beds, baths, sqft, year_built, lot_size, condition,
               last_sale_date, last_sale_price, avm,
               offer_amount, offer_factors_json, offer_generated_at,
               source_site)
            VALUES
              ('new', $1, $2, $3,
               $4, $5,
               $6,
               $7, $8, $9, $10, $11, $12,
               $13, $14, $15,
               $16, $17, NOW(),
               $18)
            RETURNING id, created_at
        `;
        const vals = [
            full_name, email, phone,
            address, placeId,
            propertyDataJson ? JSON.stringify(propertyDataJson) : null,
            beds, baths, sqft, yearBuilt, lotSize, condition,
            lastSaleDate || null, lastSalePrice, avm,
            finalOffer, finalFactors ? JSON.stringify(finalFactors) : null,
            sourceSite,
        ];

        const { rows } = await pool.query(insertSql, vals);
        const leadId = rows[0].id;

        // Compose the lead object once, reuse for email + activity log.
        const leadForEmail = {
            id: leadId,
            full_name, email, phone,
            address_raw: address,
            beds, baths, sqft, year_built: yearBuilt, lot_size: lotSize, condition,
            offer_amount: finalOffer,
        };

        // Fire-and-forget admin notification.
        cashOfferEmail.sendNewLeadNotification(leadForEmail);

        logActivity({
            event_type: 'cash_offer.submit',
            event_scope: 'cash_offer',
            actor: { type: 'public', label: email },
            target: { type: 'cash_offer_lead', id: leadId, label: `${full_name} · ${address}` },
            details: {
                offer_amount: finalOffer,
                avm, condition,
                address,
                email, phone,
            },
            req,
        });

        return res.status(201).json({
            success: true,
            leadId,
            offerAmount: finalOffer,
        });
    } catch (err) {
        console.error('[cash-offer] submit failed:', err.message);
        return res.status(500).json({ error: 'Failed to submit cash offer request.' });
    }
};

// ─── 4. POST /api/cash-offer/:leadId/selection ──────────────────────────────
exports.selection = async (req, res) => {
    const leadId = sanitizeStr(req.params.leadId, 80);
    const selection = sanitizeStr(req.body?.selection, 20);

    if (!leadId) {
        return res.status(400).json({ error: 'Lead ID is required.' });
    }
    if (selection !== 'cash' && selection !== 'agent') {
        return res.status(400).json({ error: "selection must be 'cash' or 'agent'." });
    }

    // Per spec §8, the user's selection also flips the lead status:
    //   'cash'  → proceeding_cash
    //   'agent' → chose_agent
    const nextStatus = selection === 'cash' ? 'proceeding_cash' : 'chose_agent';

    try {
        const { rows } = await pool.query(
            `UPDATE cash_offer_leads
                SET user_selection = $1,
                    selection_made_at = NOW(),
                    status = $2,
                    updated_at = NOW()
              WHERE id = $3
              RETURNING *`,
            [selection, nextStatus, leadId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Lead not found.' });
        }

        const lead = rows[0];

        // Send the appropriate notification based on the path the user chose.
        if (selection === 'cash') {
            cashOfferEmail.sendHotLeadNotification(lead);
        }

        logActivity({
            event_type: selection === 'cash' ? 'cash_offer.selected_cash' : 'cash_offer.selected_agent',
            event_scope: 'cash_offer',
            actor: { type: 'public', label: lead.email || 'visitor' },
            target: { type: 'cash_offer_lead', id: lead.id, label: `${lead.full_name || ''} · ${lead.address_raw || ''}`.trim() },
            details: { selection, offer_amount: lead.offer_amount },
            req,
            severity: selection === 'cash' ? 'warning' : 'info',
        });

        return res.json({ success: true });
    } catch (err) {
        console.error('[cash-offer] selection failed:', err.message);
        return res.status(500).json({ error: 'Failed to record selection.' });
    }
};

// ─── 5. GET /api/cash-offer/:leadId/pdf ─────────────────────────────────────
exports.pdf = async (req, res) => {
    const leadId = sanitizeStr(req.params.leadId, 80);
    if (!leadId) {
        return res.status(400).json({ error: 'Lead ID is required.' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT * FROM cash_offer_leads WHERE id = $1`,
            [leadId]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Lead not found.' });
        }

        const lead = rows[0];

        logActivity({
            event_type: 'cash_offer.pdf_download',
            event_scope: 'cash_offer',
            actor: { type: 'public', label: lead.email || 'visitor' },
            target: { type: 'cash_offer_lead', id: lead.id, label: lead.address_raw },
            req,
        });

        // Delegate to the PDF service — it sets headers and pipes the stream.
        streamOfferPdf(res, lead);
    } catch (err) {
        console.error('[cash-offer] pdf failed:', err.message);
        // If headers are already sent the stream may be partway through — bail.
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Failed to generate PDF.' });
        }
    }
};
