/**
 * email.js — Transactional email service (Resend)
 *
 * Usage:
 *   const email = require('./services/email');
 *   await email.sendWelcome(user);
 *   await email.sendPasswordReset(user, newPassword);
 *
 * Env:
 *   RESEND_API_KEY   — required, from resend.com dashboard
 *   EMAIL_FROM       — optional, default 'onboarding@resend.dev'
 *                      (switch to 'noreply@yourdomain.com' once you
 *                       verify a domain in Resend)
 *   EMAIL_REPLY_TO   — optional, default 'minnesotalakehomesforsale@gmail.com'
 *
 * Designed to be fire-and-forget: failures are logged but never throw,
 * so a Resend outage doesn't break signups, leads, or password resets.
 */

const { Resend } = require('resend');

const API_KEY  = process.env.RESEND_API_KEY;
const FROM     = process.env.EMAIL_FROM     || 'MN Lake Homes <onboarding@resend.dev>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'minnesotalakehomesforsale@gmail.com';
const SITE_URL = process.env.SITE_URL       || 'https://minnesotalakehomesforsale.com';

const resend = API_KEY ? new Resend(API_KEY) : null;

function logSkip(reason) {
    console.log(`[email] skipped — ${reason}`);
}

// ─── Low-level sender ────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, replyTo }) {
    if (!resend) { logSkip('RESEND_API_KEY not set'); return { skipped: true }; }
    if (!to)     { logSkip('no recipient');           return { skipped: true }; }

    try {
        const res = await resend.emails.send({
            from: FROM,
            to:   Array.isArray(to) ? to : [to],
            subject,
            html,
            replyTo: replyTo || REPLY_TO,
        });
        console.log(`[email] sent → ${to} · ${subject} · id=${res.data?.id || 'n/a'}`);
        return res;
    } catch (err) {
        console.error(`[email] FAILED → ${to} · ${subject}:`, err.message);
        return { error: err.message };
    }
}

// ─── Shared layout ───────────────────────────────────────────────────────────
function layout({ title, preheader, body, ctaText, ctaUrl }) {
    return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>${title}</title></head>
    <body style="margin:0;padding:0;background:#f7f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#1a202c;">
      <span style="display:none;font-size:0;line-height:0;max-height:0;">${preheader || ''}</span>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fa;padding:32px 16px;">
        <tr><td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);max-width:100%;">
            <tr><td style="background:#0a0a0a;padding:24px 32px;text-align:left;">
              <span style="color:#fff;font-weight:800;font-size:18px;letter-spacing:-0.3px;">MN Lake Homes</span>
            </td></tr>
            <tr><td style="padding:40px 32px 16px;">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:#1a202c;">${title}</h1>
              ${body}
              ${ctaText && ctaUrl ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                <tr><td style="background:#1d6df2;border-radius:8px;">
                  <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">${ctaText}</a>
                </td></tr>
              </table>` : ''}
            </td></tr>
            <tr><td style="padding:24px 32px 32px;border-top:1px solid #edf2f7;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#718096;">
                Minnesota Lake Homes · Minnesota's premier lakeside real estate platform<br>
                <a href="${SITE_URL}" style="color:#1d6df2;text-decoration:none;">minnesotalakehomesforsale.com</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`;
}

// ─── Templates ───────────────────────────────────────────────────────────────

/**
 * Welcome — sent when someone joins the waitlist or creates an account.
 */
function sendWelcome(user) {
    const name = user.first_name || user.full_name?.split(' ')[0] || 'there';
    return sendEmail({
        to: user.email,
        subject: 'Welcome to MN Lake Homes',
        html: layout({
            title: `Welcome aboard, ${name}.`,
            preheader: "You're in. Here's what happens next.",
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Thanks for joining Minnesota Lake Homes. You're now connected to Minnesota's premier network of lakefront real estate specialists.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  We'll be in touch shortly with personalized matches, curated listings from the lakes you care about, and access to off-market inventory as it becomes available.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  In the meantime, browse our directory of vetted lake specialists — someone on our team will reach out within 24 hours.
                </p>`,
            ctaText: 'Browse Our Agents',
            ctaUrl: `${SITE_URL}/pages/public/agents.html`,
        })
    });
}

/**
 * Agent registration confirmation — sent when a new agent creates an account.
 */
function sendAgentWelcome(user) {
    const name = user.display_name?.split(' ')[0] || user.first_name || 'there';
    return sendEmail({
        to: user.email,
        subject: 'Your MN Lake Homes agent account is live',
        html: layout({
            title: `Welcome to the network, ${name}.`,
            preheader: 'Complete your profile to go live in the directory.',
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Your agent account has been created. The next step is completing your public profile — that's what appears in our directory and generates introductions from serious lake-home buyers and sellers.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Head to your dashboard to add your bio, service areas, specialties, and photo. Once your profile is complete, our team reviews it within 24 hours and publishes it to the live site.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  Questions? Just reply to this email — we read every one.
                </p>`,
            ctaText: 'Complete Your Profile',
            ctaUrl: `${SITE_URL}/pages/agent/dashboard.html`,
        })
    });
}

/**
 * Password reset — sent when an admin resets a user's password.
 * Includes the new password so the user can log in immediately.
 */
function sendPasswordReset(user, newPassword) {
    const name = user.first_name || user.full_name?.split(' ')[0] || 'there';
    return sendEmail({
        to: user.email,
        subject: 'Your MN Lake Homes password has been reset',
        html: layout({
            title: 'Your password was just reset',
            preheader: 'New temporary password inside — please change it after signing in.',
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Hi ${name}, an administrator on MN Lake Homes has reset your account password.
                </p>
                <p style="margin:0 0 8px;font-size:14px;color:#4a5568;font-weight:600;">Your new temporary password:</p>
                <p style="margin:0 0 20px;padding:14px 18px;background:#f7f9fa;border:1px solid #e2e8f0;border-radius:8px;font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:#1a202c;letter-spacing:0.5px;">${newPassword}</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Please sign in with this password and then update it from your account settings. If you didn't expect this email, please contact us immediately.
                </p>`,
            ctaText: 'Sign In',
            ctaUrl: `${SITE_URL}/pages/public/login.html`,
        })
    });
}

/**
 * Lead confirmation — sent after someone submits a contact/buy/sell form,
 * so they know their inquiry was received.
 */
function sendLeadConfirmation(lead) {
    if (!lead.email) return { skipped: true };
    const name = lead.first_name || lead.full_name?.split(' ')[0] || 'there';
    return sendEmail({
        to: lead.email,
        subject: "We got your message — here's what's next",
        html: layout({
            title: `Thanks for reaching out, ${name}.`,
            preheader: "A local lake specialist will be in touch within 24 hours.",
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  We received your inquiry and it's now in the hands of our matching team. A local Minnesota lake home specialist will reach out within 24 hours to discuss your goals and next steps.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  In the meantime, feel free to explore our buyer resources, browse available lake properties, or check out agent profiles in your area.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  If anything is time-sensitive, reply directly to this email and we'll flag it for priority handling.
                </p>`,
            ctaText: 'Browse Lake Homes',
            ctaUrl: `${SITE_URL}/pages/public/buy.html`,
        })
    });
}

/**
 * Contact form confirmation — same as lead confirmation, tuned for the contact page.
 */
function sendContactConfirmation(lead) {
    return sendLeadConfirmation(lead);
}

/**
 * Admin lead notification — sent to the team when a new lead comes in.
 * Includes full lead details and a direct link to the admin leads page.
 */
function sendAdminLeadNotification({ name, first_name, email, phone, type, source, notes }) {
    const adminTo = REPLY_TO;
    const typeLabel = (type || source || 'General').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

    const detailRows = [
        { label: 'Name', value: name || '—' },
        { label: 'Email', value: email || 'Not provided' },
        { label: 'Phone', value: phone || 'Not provided' },
        { label: 'Lead Type', value: typeLabel },
        { label: 'Source', value: source || '—' },
        { label: 'Received', value: timestamp },
    ].map(r => `
        <tr>
            <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${r.label}</td>
            <td style="padding:8px 12px;font-size:15px;color:#1a202c;">${r.value}</td>
        </tr>
    `).join('');

    const notesHtml = notes
        ? `<div style="margin:20px 0 0;padding:16px;background:#f7f9fa;border-left:3px solid #1d6df2;border-radius:0 8px 8px 0;">
               <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.5px;">Details</p>
               <p style="margin:0;font-size:14px;color:#2d3748;line-height:1.65;white-space:pre-line;">${notes}</p>
           </div>`
        : '';

    return sendEmail({
        to: adminTo,
        subject: `🔔 New ${typeLabel} Lead — ${name || 'Unknown'}`,
        html: layout({
            title: `New lead from ${first_name || name || 'the website'}`,
            preheader: `${typeLabel} lead: ${name} — ${email || phone || 'no contact yet'}`,
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  A new lead just came in through the website. Here are the details:
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
                    ${detailRows}
                </table>
                ${notesHtml}`,
            ctaText: 'View in Admin Dashboard',
            ctaUrl: `${SITE_URL}/pages/admin/leads.html`,
        })
    });
}

/**
 * Simple custom send — lets us use the base `sendEmail` from elsewhere for
 * ad-hoc sends like newsletter campaigns later.
 */
function sendCustom({ to, subject, html, replyTo }) {
    return sendEmail({ to, subject, html, replyTo });
}

module.exports = {
    sendEmail,
    sendWelcome,
    sendAgentWelcome,
    sendPasswordReset,
    sendLeadConfirmation,
    sendContactConfirmation,
    sendAdminLeadNotification,
    sendCustom,
    layout,
};
