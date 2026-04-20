/**
 * cash-offer-email.js — Admin notifications for cash-offer leads.
 *
 * Two variants:
 *   1. sendNewLeadNotification(lead)  — generic "new cash-offer lead" email
 *   2. sendHotLeadNotification(lead)  — escalated "HOT LEAD — cash selected"
 *      sent when the user clicks the Accept-Cash path and becomes a serious
 *      acquisition target.
 *
 * Reuses the shared `sendEmail` + `layout` helpers from services/email.js so
 * the styling stays consistent with the rest of the platform's transactional
 * mail.
 */

const { sendEmail, layout } = require('./email');

const SITE_URL = process.env.SITE_URL || 'https://minnesotalakehomesforsale.com';
const ADMIN_EMAIL = process.env.EMAIL_REPLY_TO || 'minnesotalakehomesforsale@gmail.com';

// ─── helpers ────────────────────────────────────────────────────────────────
function fmtCurrency(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    });
}

function fmtTimestamp() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function detailRow(label, value) {
    return `
        <tr>
            <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${label}</td>
            <td style="padding:8px 12px;font-size:15px;color:#1a202c;">${value || '—'}</td>
        </tr>
    `;
}

function leadDetailTable(lead) {
    return `
        <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
            ${detailRow('Name',       lead.full_name)}
            ${detailRow('Email',      lead.email ? `<a href="mailto:${lead.email}" style="color:#1d6df2;text-decoration:none;">${lead.email}</a>` : null)}
            ${detailRow('Phone',      lead.phone)}
            ${detailRow('Address',    lead.address_raw)}
            ${detailRow('Offer',      `<strong style="color:#1d6df2;">${fmtCurrency(lead.offer_amount)}</strong>`)}
            ${detailRow('Beds/Baths', `${lead.beds ?? '—'} / ${lead.baths ?? '—'}`)}
            ${detailRow('Sqft',       lead.sqft)}
            ${detailRow('Condition',  lead.condition)}
            ${detailRow('Received',   fmtTimestamp())}
        </table>
    `;
}

function adminLinkFor(lead) {
    // Deep-link if we have an ID, otherwise land on the list page.
    return lead?.id
        ? `${SITE_URL}/pages/admin/cash-offers.html?id=${lead.id}`
        : `${SITE_URL}/pages/admin/cash-offers.html`;
}

// ─── Templates ──────────────────────────────────────────────────────────────

/**
 * Generic new-lead notification — fired on /submit.
 */
function sendNewLeadNotification(lead) {
    const address = lead.address_raw || 'unknown address';
    return sendEmail({
        to: ADMIN_EMAIL,
        subject: `💵 New Cash Offer Lead — ${lead.full_name || 'Unknown'} · ${fmtCurrency(lead.offer_amount)}`,
        html: layout({
            title: `New cash offer generated`,
            preheader: `${lead.full_name || 'A visitor'} · ${address} · ${fmtCurrency(lead.offer_amount)}`,
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  A visitor just generated a preliminary cash offer through the website. Full details below:
                </p>
                ${leadDetailTable(lead)}
                <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#4a5568;">
                  The user has <strong>not yet</strong> decided between the cash offer and a full-service agent. Watch for the follow-up email if they pick cash.
                </p>`,
            ctaText: 'View in Admin Dashboard',
            ctaUrl: adminLinkFor(lead),
        }),
    });
}

/**
 * Escalated HOT-LEAD notification — fired when the user selects "cash".
 */
function sendHotLeadNotification(lead) {
    const address = lead.address_raw || 'unknown address';
    return sendEmail({
        to: ADMIN_EMAIL,
        subject: `🔥 HOT LEAD — Cash Offer ACCEPTED · ${lead.full_name || 'Unknown'} · ${fmtCurrency(lead.offer_amount)}`,
        html: layout({
            title: `HOT LEAD — cash offer accepted`,
            preheader: `${lead.full_name || 'A seller'} chose the cash path · ${address}`,
            body: `
                <div style="margin:0 0 18px;padding:14px 16px;background:#fff5f5;border-left:4px solid #e53e3e;border-radius:0 8px 8px 0;">
                  <p style="margin:0;font-size:15px;font-weight:700;color:#c53030;">
                    This seller selected the cash offer path. Follow up immediately.
                  </p>
                </div>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  They accepted the preliminary offer of <strong style="color:#1d6df2;">${fmtCurrency(lead.offer_amount)}</strong> on <strong>${address}</strong> and are waiting on a human to reach out.
                </p>
                ${leadDetailTable(lead)}
                <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#718096;">
                  Speed-to-lead matters — call/text within the hour for best conversion.
                </p>`,
            ctaText: 'Open Lead in Admin',
            ctaUrl: adminLinkFor(lead),
        }),
    });
}

module.exports = {
    sendNewLeadNotification,
    sendHotLeadNotification,
};
