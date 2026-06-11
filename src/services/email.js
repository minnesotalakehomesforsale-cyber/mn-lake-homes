/**
 * email.js — Transactional email service
 *
 * Transports, tried in order:
 *   1. Gmail SMTP (Nodemailer) if GMAIL_USER + GMAIL_APP_PASSWORD are set
 *   2. Resend                   if RESEND_API_KEY is set
 *   3. No-op                    if neither is set — logs only
 *
 * Gmail path is preferred because it requires zero DNS work (no SPF/DKIM
 * verification dance — Gmail's own infra signs outbound). ~500 emails/day
 * limit on a free Gmail account is plenty for current volume. Resend stays
 * as a fallback so we can flip transports by swapping env vars alone.
 *
 * Env:
 *   GMAIL_USER          — e.g. minnesotalakehomesforsale@gmail.com
 *   GMAIL_APP_PASSWORD  — 16-char App Password from the Google account;
 *                         spaces optional (Nodemailer tolerates either)
 *   RESEND_API_KEY      — from resend.com dashboard (fallback transport)
 *   EMAIL_FROM          — display-name + address, e.g.
 *                         'MN Lake Homes <minnesotalakehomesforsale@gmail.com>'
 *                         When using Gmail SMTP, the address MUST match
 *                         GMAIL_USER or Gmail will rewrite it silently.
 *   EMAIL_REPLY_TO      — default 'minnesotalakehomesforsale@gmail.com'
 *   SITE_URL            — used inside templates for CTAs
 *
 * Usage (unchanged):
 *   const email = require('./services/email');
 *   await email.sendWelcome(user);
 *
 * Fire-and-forget: failures are logged but never throw.
 */

const { Resend }    = require('resend');
const nodemailer    = require('nodemailer');

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const RESEND_KEY     = process.env.RESEND_API_KEY;

const FROM     = process.env.EMAIL_FROM     || (GMAIL_USER
                    ? `MN Lake Homes <${GMAIL_USER}>`
                    : 'MN Lake Homes <onboarding@resend.dev>');
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'minnesotalakehomesforsale@gmail.com';
const SITE_URL = process.env.SITE_URL       || 'https://minnesotalakehomesforsale.com';

// Initialize transports lazily. Build them once and reuse.
let _gmailTransport = null;
if (GMAIL_USER && GMAIL_PASSWORD) {
    _gmailTransport = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
    });
    console.log('[email] transport = gmail-smtp (', GMAIL_USER, ')');
}

const _resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;
if (_resend && !_gmailTransport) {
    console.log('[email] transport = resend');
}
if (!_gmailTransport && !_resend) {
    console.warn('[email] transport = NONE (set GMAIL_USER+GMAIL_APP_PASSWORD or RESEND_API_KEY)');
}

function logSkip(reason) {
    console.log(`[email] skipped — ${reason}`);
}

// ─── Low-level sender ────────────────────────────────────────────────────────
// Same signature as before — templates don't need to know the transport.
async function sendEmail({ to, subject, html, replyTo }) {
    if (!to) { logSkip('no recipient'); return { skipped: true }; }

    // Prefer Gmail SMTP if configured.
    if (_gmailTransport) {
        try {
            const info = await _gmailTransport.sendMail({
                from: FROM,
                to:   Array.isArray(to) ? to.join(', ') : to,
                subject,
                html,
                replyTo: replyTo || REPLY_TO,
            });
            console.log(`[email] sent → ${to} · ${subject} · id=${info.messageId || 'n/a'}`);
            return { data: { id: info.messageId } };
        } catch (err) {
            console.error(`[email] FAILED (gmail) → ${to} · ${subject}:`, err.message);
            return { error: err.message };
        }
    }

    if (_resend) {
        try {
            const res = await _resend.emails.send({
                from: FROM,
                to:   Array.isArray(to) ? to : [to],
                subject,
                html,
                replyTo: replyTo || REPLY_TO,
            });
            console.log(`[email] sent → ${to} · ${subject} · id=${res.data?.id || 'n/a'}`);
            return res;
        } catch (err) {
            console.error(`[email] FAILED (resend) → ${to} · ${subject}:`, err.message);
            return { error: err.message };
        }
    }

    logSkip('no transport configured');
    return { skipped: true };
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
/**
 * Password reset link — sent from /api/auth/forgot-password. The reset URL
 * carries a one-time token that expires in `expiresInMin` minutes. We
 * intentionally avoid including the user's own email in the body — a
 * single leaked screenshot otherwise reveals both the email and a live
 * reset link.
 */
function sendPasswordReset({ to, first_name, resetUrl, expiresInMin = 60 }) {
    if (!to) return { skipped: true };
    const name = first_name || 'there';
    return sendEmail({
        to,
        subject: 'Reset your MN Lake Homes password',
        html: layout({
            title: `Reset your password, ${name}.`,
            preheader: `One-click reset — link expires in ${expiresInMin} minutes.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Someone (hopefully you) requested a password reset for your MN Lake Homes account. Use the button below to set a new password. The link expires in ${expiresInMin} minutes and can only be used once.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  If you didn't request this, you can safely ignore this email — your password won't change unless you click the link and choose a new one.
                </p>
                <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#718096;">
                  For security, this link won't appear anywhere else. If the button doesn't open, copy and paste the URL from your browser bar after clicking.
                </p>`,
            ctaText: 'Reset password',
            ctaUrl: resetUrl,
        })
    });
}

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
        subject: 'Your MN Lake Homes agent account is set up',
        html: layout({
            title: `Welcome to the network, ${name}.`,
            preheader: 'Complete your profile and pick a plan — your profile publishes the moment payment clears.',
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Your agent account is ready. Two more steps and you're on the directory:
                </p>
                <ol style="margin:0 0 18px;padding-left:1.25rem;font-size:15px;line-height:1.7;color:#2d3748;">
                  <li><strong>Complete your profile</strong> — bio, photo, service areas, specialties.</li>
                  <li><strong>Pick a plan</strong> — Standard, Prime, or Founder.</li>
                </ol>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Your profile publishes automatically the moment Stripe confirms payment. No team review, no waiting room — once payment clears, you're on the lake pages.
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
 * Agent profile published — fires from the Stripe webhook
 * (checkout.session.completed) right after the agent's first payment
 * flips their profile to published. Sender already knows their profile
 * is live (Stripe redirected them back), but the email gives them a
 * shareable link to the public profile and a short "what to do this week"
 * nudge so they get something out of the network on day one.
 */
function sendAgentProfileLive({ email, display_name, slug }) {
    const name = display_name?.split(' ')[0] || 'there';
    const profileUrl = slug
        ? `${SITE_URL}/pages/public/agent-profile.html?slug=${slug}`
        : `${SITE_URL}/pages/agent/dashboard.html`;
    return sendEmail({
        to: email,
        subject: 'Your MN Lake Homes profile is live',
        html: layout({
            title: `You're live, ${name}.`,
            preheader: 'Your profile is now on the directory and lake pages.',
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Payment received, profile published. Buyers and sellers searching your area on MinnesotaLakeHomesForSale.com can now find your profile on the lake pages.
                </p>
                <p style="margin:0 0 8px;font-size:14px;color:#4a5568;font-weight:600;">A few things worth doing this week:</p>
                <ul style="margin:0 0 18px;padding-left:1.25rem;font-size:15px;line-height:1.7;color:#2d3748;">
                  <li>Open your public profile and share the link with existing clients.</li>
                  <li>Double-check your service areas in the dashboard so matched leads route to you correctly.</li>
                  <li>Watch your inbox — matched buyer and seller leads come straight to the email on file.</li>
                </ul>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  Questions or feedback? Just reply — we read every one.
                </p>`,
            ctaText: 'View Your Live Profile',
            ctaUrl: profileUrl,
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
 *
 * `lead` shape:
 *   { email, first_name|full_name, lead_type?, magnet? }
 * Where magnet (optional) is { title, url, slug } — when present, the
 * email leads with a "here's your guide" download block tuned to the
 * lead type, then explains what happens next. When absent, falls back
 * to the generic copy that's been live since launch.
 */
function sendLeadConfirmation(lead) {
    if (!lead.email) return { skipped: true };
    const name      = lead.first_name || lead.full_name?.split(' ')[0] || 'there';
    const leadType  = lead.lead_type || 'general_contact';
    const magnet    = lead.magnet || null;

    // Per-type copy. Falls back to the original generic body for types
    // we don't have tailored language for (agent_inquiry, market_report, etc).
    const copy = (() => {
        if (leadType === 'buyer') {
            return {
                subject: 'Your Minnesota lake-home buying journey starts here',
                title:   `Welcome, ${name}.`,
                preheader: magnet
                    ? `Your buyer guide is attached + a local specialist will reach out within 24 hours.`
                    : `A local specialist will be in touch within 24 hours.`,
                body: `
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                      Thanks for telling us what you're looking for. We've matched your request to our buyer-specialist team — expect a call or email within one business day to start narrowing down lakes, neighborhoods, and listings that actually fit.
                    </p>
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                      While you wait, the guide below is the same one our specialists hand to every new buyer client. It covers the realities of MN waterfront — financing nuances, what to look for on a shoreline walk-through, what each lake region is actually like to live on.
                    </p>`,
                ctaText: 'Browse Lake Homes',
                ctaUrl: `${SITE_URL}/pages/public/buy.html`,
            };
        }
        if (leadType === 'seller') {
            return {
                subject: 'Your Minnesota lake-home seller toolkit is ready',
                title:   `Thanks, ${name}.`,
                preheader: magnet
                    ? `Your seller toolkit is attached + a listing specialist will be in touch within 24 hours.`
                    : `A listing specialist will be in touch within 24 hours.`,
                body: `
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                      Thanks for considering us for your sale. We've routed your property to one of our local listing specialists — they'll reach out within one business day with comps for your lake, an honest sense of timing, and what we'd do to position the property for a top-end offer.
                    </p>
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                      In the meantime, the guide below is the playbook we walk every new seller through — pricing strategy, the prep that actually pays off for waterfront homes, and disclosure questions specific to Minnesota lakeshore.
                    </p>`,
                ctaText: 'See your home value',
                ctaUrl: `${SITE_URL}/pages/public/sell.html`,
            };
        }
        // Generic / agent inquiry / general contact — original copy.
        return {
            subject: "We got your message — here's what's next",
            title:   `Thanks for reaching out, ${name}.`,
            preheader: 'A local lake specialist will be in touch within 24 hours.',
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
        };
    })();

    // When a magnet is present, the primary CTA becomes the download
    // button and the original CTA gets demoted into a secondary text link
    // at the bottom of the email body.
    let primaryCtaText = copy.ctaText;
    let primaryCtaUrl  = copy.ctaUrl;
    let body           = copy.body;

    if (magnet?.url && magnet?.title) {
        const magnetUrl = magnet.url.startsWith('http') ? magnet.url : `${SITE_URL}${magnet.url}`;
        primaryCtaText  = `Download "${magnet.title}"`;
        primaryCtaUrl   = magnetUrl;
        // Append a secondary footer link pointing at the original CTA
        // so the buyer/seller can still get to the browse page in one click.
        body += `
            <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#718096;">
              Also handy: <a href="${copy.ctaUrl}" style="color:#1d6df2;text-decoration:underline;">${copy.ctaText}</a>.
            </p>`;
    }

    return sendEmail({
        to: lead.email,
        subject: copy.subject,
        html: layout({
            title: copy.title,
            preheader: copy.preheader,
            body,
            ctaText: primaryCtaText,
            ctaUrl: primaryCtaUrl,
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
 * Inquiry — admin notification when a contact form is submitted.
 * `source` is 'mnlakehomes' or 'commonrealtor' and routes to the right inbox.
 */
function sendInquiryNotification({ to, source, name, email: senderEmail, phone, inquirer_type, message, inquiryId, createdAt }) {
    const brand = source === 'commonrealtor' ? 'CommonRealtor' : 'MN Lake Homes';
    const row = (k, v) => v ? `<tr><td style="padding:8px 0;color:#718096;font-size:13px;width:120px;">${k}</td><td style="padding:8px 0;color:#1a202c;font-size:14px;font-weight:500;">${v}</td></tr>` : '';

    return sendEmail({
        to,
        subject: `📨 New ${brand} inquiry — ${name}`,
        replyTo: senderEmail,  // replying goes straight back to the submitter
        html: layout({
            title: `New contact-form inquiry`,
            preheader: `${name} via ${brand}: ${message.slice(0, 80)}${message.length > 80 ? '…' : ''}`,
            body: `
                <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Someone just reached out through the <strong>${brand}</strong> contact form.
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 10px;">
                    ${row('Name', name)}
                    ${row('Email', `<a href="mailto:${senderEmail}" style="color:#1d6df2;text-decoration:none;">${senderEmail}</a>`)}
                    ${row('Phone', phone)}
                    ${row('They are a', inquirer_type)}
                    ${row('Source', brand)}
                </table>
                <div style="margin-top:20px;padding:16px 18px;background:#f7f9fa;border-left:3px solid #1d6df2;border-radius:0 8px 8px 0;">
                    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.8px;">Message</p>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#2d3748;white-space:pre-wrap;">${message}</p>
                </div>`,
            ctaText: 'View in Admin',
            ctaUrl: `${SITE_URL}/pages/admin/inquiries.html`,
        })
    });
}

/**
 * Inquiry — confirmation email back to the submitter.
 */
function sendInquiryConfirmation({ to, name, source }) {
    const brand = source === 'commonrealtor' ? 'CommonRealtor' : 'MN Lake Homes';
    const first = (name || '').split(' ')[0] || 'there';
    return sendEmail({
        to,
        subject: `We got your message — ${brand}`,
        html: layout({
            title: `Thanks for reaching out, ${first}.`,
            preheader: "We'll get back to you within one business day.",
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Thanks for your message — it's in our inbox and we'll get back to you within one business day.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  If anything is time-sensitive, reply directly to this email and we'll prioritize it.
                </p>`,
        })
    });
}

/**
 * Matched-agent notification — fires once per agent whose tagged service
 * area matched the submitted property address within the configured radius.
 */
function sendMatchedAgentNotification({ to, agentFirstName, lead, distanceMiles, matchedAreas }) {
    if (!to || !lead) return { skipped: true };
    const typeLabel = (lead.type || lead.source || 'General').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const distanceStr = Number.isFinite(Number(distanceMiles))
        ? `${Number(distanceMiles).toFixed(1)} mi from your service area`
        : 'Within your service area';
    const areasStr = Array.isArray(matchedAreas) && matchedAreas.length
        ? matchedAreas.slice(0, 3).join(', ') + (matchedAreas.length > 3 ? `, +${matchedAreas.length - 3} more` : '')
        : null;

    const detailRows = [
        { label: 'Name',     value: lead.name || '—' },
        { label: 'Email',    value: lead.email ? `<a href="mailto:${lead.email}" style="color:#1d6df2;text-decoration:none;">${lead.email}</a>` : 'Not provided' },
        { label: 'Phone',    value: lead.phone ? `<a href="tel:${lead.phone.replace(/[^\d+]/g,'')}" style="color:#1d6df2;text-decoration:none;">${lead.phone}</a>` : 'Not provided' },
        { label: 'Type',     value: typeLabel },
        { label: 'Property', value: lead.address || '—' },
        { label: 'Proximity',value: distanceStr },
    ].map(r => `
        <tr>
            <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${r.label}</td>
            <td style="padding:8px 12px;font-size:15px;color:#1a202c;">${r.value}</td>
        </tr>
    `).join('');

    const notesHtml = lead.notes
        ? `<div style="margin:20px 0 0;padding:16px;background:#f7f9fa;border-left:3px solid #1d6df2;border-radius:0 8px 8px 0;">
               <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.5px;">Details</p>
               <p style="margin:0;font-size:14px;color:#2d3748;line-height:1.65;white-space:pre-line;">${lead.notes}</p>
           </div>`
        : '';

    return sendEmail({
        to,
        replyTo: lead.email || undefined,
        subject: `📍 New lead near you — ${lead.name || 'Unknown'}`,
        html: layout({
            title: `New lead in your service area`,
            preheader: `${lead.name} · ${lead.address || typeLabel} · ${distanceStr}`,
            body: `
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Hi ${agentFirstName || 'there'} — a new lead just came in for a property ${areasStr ? `near <strong>${areasStr}</strong>` : 'in your service area'}. You're receiving this because it falls within one of your tagged areas.
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
                    ${detailRows}
                </table>
                ${notesHtml}
                <p style="margin:20px 0 0;font-size:13px;color:#718096;line-height:1.5;">
                  Reach out promptly — leads often come to multiple agents in the area.
                </p>`,
            ctaText: 'View in Agent Dashboard',
            ctaUrl: `${SITE_URL}/pages/agent/dashboard.html`,
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

// ─── Business-owner lifecycle ────────────────────────────────────────────────
// Six templates covering the arc from first signup through cancellation.
// Each one mirrors the visual language of sendLeadConfirmation /
// sendAgentWelcome so owners get a consistent brand experience.

function prettyType(type) {
    return ({
        restaurant: 'Restaurant',
        marina: 'Marina',
        service: 'Service provider',
        photographer: 'Photographer',
        builder: 'Builder / contractor',
        boat_rental: 'Boat rental',
        outdoor_recreation: 'Outdoor recreation',
        other: 'Local business',
    })[type] || 'Local business';
}

/**
 * Sent the moment an owner submits /business-signup, before Stripe Checkout
 * has redirected back. Sets expectations for the three-step process.
 */
function sendBusinessWelcome({ to, name, businessName, businessType }) {
    if (!to) return { skipped: true };
    const first = (name || '').split(' ')[0] || 'there';
    return sendEmail({
        to,
        subject: `Welcome to MN Lake Homes — let's get ${businessName || 'your listing'} live`,
        html: layout({
            title: `Welcome aboard, ${first}.`,
            preheader: `Here's what happens next for ${businessName || 'your business'}.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Thanks for signing up <strong>${businessName || 'your business'}</strong>${businessType ? ` as a ${prettyType(businessType).toLowerCase()}` : ''}. You're on the shortlist to appear on Minnesota's most-visited lake-town directory.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  <strong>What's next:</strong>
                </p>
                <ol style="margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.75;color:#2d3748;">
                  <li>Finish Stripe checkout if you haven't already — that unlocks your profile.</li>
                  <li>We'll review your listing for accuracy (usually within 24 hours).</li>
                  <li>Once approved, your pin goes live on the map and you can edit your profile anytime from the dashboard.</li>
                </ol>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  Questions? Just reply to this email.
                </p>`,
            ctaText: 'Open your dashboard',
            ctaUrl: `${SITE_URL}/business/dashboard`,
        })
    });
}

/**
 * Sent to the admin inbox the moment a new owner signs up — so the
 * approval queue never goes stale.
 */
function sendBusinessAdminNotification({ businessName, businessType, ownerEmail, ownerName, slug, businessId }) {
    const typeLabel = prettyType(businessType);
    const row = (k, v) => v ? `<tr><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:8px 12px;font-size:15px;color:#1a202c;">${v}</td></tr>` : '';
    return sendEmail({
        to: REPLY_TO,
        replyTo: ownerEmail,
        subject: `🆕 New business signup — ${businessName} (${typeLabel})`,
        html: layout({
            title: `A new business just signed up`,
            preheader: `${businessName} · ${typeLabel} · pending your review`,
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  <strong>${businessName}</strong> just signed up for a listing and is now waiting for admin approval.
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
                  ${row('Business', businessName)}
                  ${row('Type', typeLabel)}
                  ${row('Owner', ownerName || '—')}
                  ${row('Email', `<a href="mailto:${ownerEmail}" style="color:#1d6df2;text-decoration:none;">${ownerEmail}</a>`)}
                  ${row('Slug', slug ? `<code style="background:#f7f9fa;padding:2px 6px;border-radius:4px;">${slug}</code>` : '—')}
                </table>
                <p style="margin:18px 0 0;font-size:13px;color:#718096;line-height:1.5;">
                  Review the listing, verify the details, then flip status → <strong>active</strong> in the admin to publish.
                </p>`,
            ctaText: 'Open admin businesses',
            ctaUrl: `${SITE_URL}/pages/admin/businesses.html${businessId ? `?focus=${businessId}` : ''}`,
        })
    });
}

/**
 * Stripe confirms payment → tell the owner we got it. Not live yet; admin
 * review still pending. This bridges the awkward "paid but not visible" gap.
 */
function sendBusinessPaymentReceived({ to, name, businessName }) {
    if (!to) return { skipped: true };
    const first = (name || '').split(' ')[0] || 'there';
    return sendEmail({
        to,
        subject: `Payment received — ${businessName || 'your listing'}`,
        html: layout({
            title: `Thanks, ${first} — payment received.`,
            preheader: `Your listing is in the review queue. We'll have you live shortly.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Stripe confirmed your subscription for <strong>${businessName || 'your listing'}</strong>. You're all set on the billing side.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Your listing is now in our admin review queue. Most approvals happen within 24 hours. You'll get another email the moment your pin goes live.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  In the meantime, head to your dashboard to polish your profile — add a photo, flesh out your description, pick the towns you serve.
                </p>`,
            ctaText: 'Polish your profile',
            ctaUrl: `${SITE_URL}/business/dashboard`,
        })
    });
}

/**
 * Admin flipped status → active. The business is LIVE on the map.
 */
function sendBusinessApproved({ to, name, businessName, slug }) {
    if (!to) return { skipped: true };
    const first = (name || '').split(' ')[0] || 'there';
    const publicUrl = slug ? `${SITE_URL}/businesses/${slug}` : `${SITE_URL}/towns`;
    return sendEmail({
        to,
        subject: `🎉 You're live — ${businessName || 'your listing'} is now on the map`,
        html: layout({
            title: `You're live, ${first}.`,
            preheader: `${businessName || 'Your listing'} is now visible on minnesotalakehomesforsale.com.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Good news — <strong>${businessName || 'your listing'}</strong> is now approved and live on the MN Lake Homes directory. Your pin appears on every town page where you serve, on the main businesses map, and at your own profile URL.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Want more visibility? Upgrade to <strong>Featured Partner</strong> from your dashboard — premium pins sort first on every map and carry a gold badge.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  You can edit your profile, photo, socials, and towns anytime. Reply to this email if you need help.
                </p>`,
            ctaText: 'View your live listing',
            ctaUrl: publicUrl,
        })
    });
}

/**
 * Sent when a subscription flips to past_due after a failed charge. Gives
 * the owner a heads-up before their listing gets auto-hidden if Stripe
 * gives up retrying (transitions past_due → unpaid/canceled).
 */
function sendBusinessPaymentFailed({ to, name, businessName }) {
    if (!to) return { skipped: true };
    const first = (name || '').split(' ')[0] || 'there';
    return sendEmail({
        to,
        subject: `⚠ Payment failed — update your card for ${businessName || 'your listing'}`,
        html: layout({
            title: `Your last payment didn't go through, ${first}.`,
            preheader: `Update your billing info so your listing stays visible.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Stripe tried to renew your MN Lake Homes subscription for <strong>${businessName || 'your listing'}</strong> and the charge was declined. Your listing is still live for now, but will auto-hide if Stripe can't complete the renewal after a few retries.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  <strong>Fix it in under a minute</strong> — open your dashboard, click "Manage billing in Stripe", and update your payment method there.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  Replying to this email also reaches us if Stripe's flow is giving you trouble.
                </p>`,
            ctaText: 'Update payment method',
            ctaUrl: `${SITE_URL}/business/dashboard`,
        })
    });
}

/**
 * Subscription canceled → the listing is hidden. We still keep all
 * profile data so a re-subscribe restores everything instantly.
 */
function sendBusinessSubscriptionCancelled({ to, name, businessName }) {
    if (!to) return { skipped: true };
    const first = (name || '').split(' ')[0] || 'there';
    return sendEmail({
        to,
        subject: `Your MN Lake Homes listing has been paused`,
        html: layout({
            title: `Your listing is paused, ${first}.`,
            preheader: `Resubscribe anytime — your profile, photos, and town tags are saved.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Your MN Lake Homes subscription for <strong>${businessName || 'your listing'}</strong> has ended, so the listing is no longer visible on the directory.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  <strong>Your profile data is preserved</strong> — photo, description, socials, town tags, all of it. Resubscribing from your dashboard brings the listing back instantly, no re-entry needed.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">
                  If this cancellation wasn't intentional — maybe a card expiration Stripe gave up on — just reply and we'll help.
                </p>`,
            ctaText: 'Reactivate your listing',
            ctaUrl: `${SITE_URL}/business/dashboard`,
        })
    });
}

// ─── Admin-initiated invites (comped accounts) ─────────────────────────────
// Both invites surface the temp password in a copyable monospace block
// rather than a CTA-button URL. The agent/business is supposed to log in,
// change it, then finish their profile — so credential visibility matters
// more than first-click optimization.

function credBlock(loginUrl, email, tempPassword) {
    return `
        <div style="background:#f7f9fa;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin:18px 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:14px;line-height:1.7;color:#1a202c;">
            <div style="color:#718096;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;font-weight:700;margin-bottom:8px;">Your Login</div>
            <div><strong>URL:&nbsp;&nbsp;&nbsp;&nbsp;</strong><a href="${loginUrl}" style="color:#1d6df2;text-decoration:none;">${loginUrl}</a></div>
            <div><strong>Email:&nbsp;&nbsp;</strong>${email}</div>
            <div><strong>Password:</strong> <span style="background:#fff;border:1px solid #cbd5e0;border-radius:6px;padding:2px 8px;font-weight:700;">${tempPassword}</span></div>
        </div>`;
}

function sendAgentInvite({ to, first_name, tier_label, tempPassword }) {
    const name = first_name || 'there';
    const loginUrl = `${SITE_URL}/pages/public/agent-login.html`;
    return sendEmail({
        to,
        subject: `You're invited to MN Lake Homes — your ${tier_label} profile is ready`,
        html: layout({
            title: `Welcome to the network, ${name}.`,
            preheader: `Your ${tier_label} agent profile is comped and ready to set up.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Our team set up a complimentary <strong>${tier_label}</strong> agent profile for you on Minnesota Lake Homes. Your account is live and the membership is fully paid for — you just need to log in and fill in your details so buyers and sellers can find you.
                </p>
                ${credBlock(loginUrl, to, tempPassword)}
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Once you're in, the dashboard walks you through adding your photo, bio, service areas, and specialties. Profiles typically take 10–15 minutes. Change your password at the bottom of the Account tab.
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#718096;">
                  Questions? Just reply to this email.
                </p>`,
            ctaText: 'Log in and finish setup',
            ctaUrl: loginUrl,
        })
    });
}

function sendBusinessInvite({ to, first_name, business_name, tier_label, tempPassword }) {
    const name = first_name || 'there';
    const loginUrl = `${SITE_URL}/pages/public/business-login.html`;
    return sendEmail({
        to,
        subject: `You're invited to MN Lake Homes — ${business_name}'s ${tier_label} profile is ready`,
        html: layout({
            title: `Welcome, ${name}.`,
            preheader: `${business_name}'s ${tier_label} listing is comped and ready to set up.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Our team set up a complimentary <strong>${tier_label}</strong> listing for <strong>${business_name}</strong> on Minnesota Lake Homes. Your subscription is fully paid for — you just need to log in and fill in the details so lake-home owners in your service area can find you.
                </p>
                ${credBlock(loginUrl, to, tempPassword)}
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Once you're in, the dashboard walks you through adding your description, photos, hours, and the lakes/towns you serve. Most listings take 10–15 minutes to complete. Change your password at the bottom of the Account tab.
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#718096;">
                  Questions? Just reply to this email.
                </p>`,
            ctaText: 'Log in and finish setup',
            ctaUrl: loginUrl,
        })
    });
}

// Local HTML-escape — admin-supplied prose (message body, lead notes)
// goes into templates here, so we have to neutralise <, >, &, ", '. The
// rest of the file already trusts its caller, but these two helpers
// surface free-form text from the admin / lead form.
function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// ─── Admin manual lead assignment ──────────────────────────────────────────
// Sibling of sendMatchedAgentNotification but for the case where the admin
// hand-picked the agent (no proximity / tag match). Slightly different
// opening prose so the agent knows why they got it.
function sendAgentLeadAssigned({ to, agentFirstName, lead, assignedBy }) {
    if (!to || !lead) return { skipped: true };
    const typeLabel = (lead.type || 'General').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const detailRows = [
        { label: 'Name',     value: _esc(lead.name) || '—' },
        { label: 'Email',    value: lead.email ? `<a href="mailto:${_esc(lead.email)}" style="color:#1d6df2;text-decoration:none;">${_esc(lead.email)}</a>` : 'Not provided' },
        { label: 'Phone',    value: lead.phone ? `<a href="tel:${_esc(String(lead.phone).replace(/[^\d+]/g,''))}" style="color:#1d6df2;text-decoration:none;">${_esc(lead.phone)}</a>` : 'Not provided' },
        { label: 'Type',     value: typeLabel },
        { label: 'Property', value: _esc(lead.address) || '—' },
    ].map(r => `
        <tr>
            <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${r.label}</td>
            <td style="padding:8px 12px;font-size:15px;color:#1a202c;">${r.value}</td>
        </tr>`).join('');
    const notesHtml = lead.notes
        ? `<div style="margin:20px 0 0;padding:16px;background:#f7f9fa;border-left:3px solid #1d6df2;border-radius:0 8px 8px 0;">
               <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.5px;">Notes</p>
               <p style="margin:0;font-size:14px;color:#2d3748;line-height:1.65;white-space:pre-line;">${_esc(lead.notes)}</p>
           </div>`
        : '';
    return sendEmail({
        to,
        replyTo: lead.email || undefined,
        subject: `📍 New lead assigned to you — ${lead.name || 'Unknown'}`,
        html: layout({
            title: 'New lead assigned to you',
            preheader: `${lead.name || ''} · ${lead.address || typeLabel}`,
            body: `
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Hi ${_esc(agentFirstName) || 'there'} — our team just assigned a new lead to you${assignedBy ? ` (assigned by ${_esc(assignedBy)})` : ''}. Details below.
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
                    ${detailRows}
                </table>
                ${notesHtml}
                <p style="margin:20px 0 0;font-size:13px;color:#718096;line-height:1.5;">
                  Reach out promptly — most leads convert fastest with a same-day response.
                </p>`,
            ctaText: 'View in Agent Dashboard',
            ctaUrl: `${SITE_URL}/pages/agent/dashboard.html`,
        })
    });
}

// ─── New in-app message arrived from MN Lake Homes ─────────────────────────
// Fires whenever the admin sends a 1:1 message OR the agent is in the
// audience of a broadcast. The email is the wake-up; the actual thread
// + reply UX lives in the agent dashboard.
function sendAgentMessageNotification({ to, agentFirstName, body, senderName }) {
    if (!to || !body) return { skipped: true };
    const preview = body.length > 280 ? body.slice(0, 280).trim() + '…' : body;
    const senderLabel = senderName || 'the MN Lake Homes team';
    return sendEmail({
        to,
        subject: `New message from ${senderLabel}`,
        html: layout({
            title: 'You have a new message',
            preheader: preview.replace(/\s+/g, ' ').slice(0, 100),
            body: `
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Hi ${_esc(agentFirstName) || 'there'}, ${_esc(senderLabel)} just sent you a new message in your MN Lake Homes portal:
                </p>
                <div style="margin:18px 0;padding:18px 20px;background:#f7f9fa;border-left:3px solid #1d6df2;border-radius:0 8px 8px 0;">
                    <p style="margin:0;font-size:14px;color:#2d3748;line-height:1.65;white-space:pre-line;">${_esc(preview)}</p>
                </div>
                <p style="margin:18px 0 0;font-size:13px;color:#718096;line-height:1.5;">
                  Open your dashboard to read the full message — replies happen there too.
                </p>`,
            ctaText: 'Open Messages',
            ctaUrl: `${SITE_URL}/pages/agent/dashboard.html`,
        })
    });
}

// ─── Forward a cash-offer lead to a partner ────────────────────────────────
// Fires when the admin clicks "Send" on a cash offer and picks a partner
// from the network. The body bundles the seller contact + offer details
// + property facts and lets the admin (us) inject a custom note up top.
// replyTo is the admin's own email so the partner can hit reply-all and
// loop us in.
function sendCashOfferToPartner({ to, partnerName, customMessage, offer, fromName, fromEmail }) {
    if (!to || !offer) return { skipped: true };
    const property = offer.property || {};
    const beds  = offer.beds  ?? property.beds;
    const baths = offer.baths ?? property.baths;
    const sqft  = offer.sqft  ?? property.sqft;
    const yearBuilt = offer.year_built ?? property.yearBuilt;
    const lotSize   = offer.lot_size   ?? property.lotSize;

    const fmtMoney = (n) => (n == null || isNaN(Number(n))) ? '—'
        : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const propFacts = [
        beds  ? `${beds} bd`  : null,
        baths ? `${baths} ba` : null,
        sqft  ? `${Number(sqft).toLocaleString()} sqft` : null,
        yearBuilt ? `built ${yearBuilt}` : null,
        lotSize ? `${lotSize} ac lot` : null,
        offer.condition ? `${offer.condition} condition` : null,
    ].filter(Boolean).join(' · ') || '—';

    const sellerRows = [
        { label: 'Name',     value: _esc(offer.full_name) || '—' },
        { label: 'Email',    value: offer.email ? `<a href="mailto:${_esc(offer.email)}" style="color:#1d6df2;text-decoration:none;">${_esc(offer.email)}</a>` : '—' },
        { label: 'Phone',    value: offer.phone ? `<a href="tel:${_esc(String(offer.phone).replace(/[^\d+]/g,''))}" style="color:#1d6df2;text-decoration:none;">${_esc(offer.phone)}</a>` : '—' },
        { label: 'Property', value: _esc(offer.address_raw) || '—' },
        { label: 'Facts',    value: _esc(propFacts) },
        { label: 'Our offer',value: `<strong>${_esc(fmtMoney(offer.offer_amount))}</strong>` },
        offer.avm ? { label: 'AVM', value: _esc(fmtMoney(offer.avm)) } : null,
        offer.last_sale_price ? { label: 'Last sale', value: _esc(fmtMoney(offer.last_sale_price)) } : null,
    ].filter(Boolean);

    const detailTable = sellerRows.map(r => `
        <tr>
            <td style="padding:7px 14px 7px 0;font-size:13px;color:#718096;font-weight:600;white-space:nowrap;vertical-align:top;">${r.label}</td>
            <td style="padding:7px 0;font-size:14px;color:#1a202c;vertical-align:top;">${r.value}</td>
        </tr>`).join('');

    const customBlock = (customMessage || '').trim()
        ? `<div style="margin:18px 0;padding:16px 18px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;">
               <p style="margin:0;font-size:14px;color:#1a202c;line-height:1.65;white-space:pre-line;">${_esc(customMessage)}</p>
           </div>`
        : '';

    const senderLabel = fromName || 'MN Lake Homes';

    return sendEmail({
        to,
        replyTo: fromEmail || undefined,
        subject: `Cash offer lead — ${offer.address_raw || offer.full_name || 'new property'}`,
        html: layout({
            title: 'Cash offer lead for your review',
            preheader: `${offer.address_raw || ''} — our offer ${fmtMoney(offer.offer_amount)}`,
            body: `
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Hi ${_esc(partnerName) || 'there'}, ${_esc(senderLabel)} is forwarding a fresh cash-offer lead for your review.
                </p>
                ${customBlock}
                <table cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 12px;border-collapse:collapse;">${detailTable}</table>
                <p style="margin:14px 0 0;font-size:13px;color:#718096;line-height:1.5;">
                  Reply to this email to coordinate with us, or reach out to the seller directly using the contact info above.
                </p>`,
            ctaText: offer.email ? 'Email the seller' : null,
            ctaUrl:  offer.email ? `mailto:${offer.email}` : null,
        })
    });
}

module.exports = {
    sendEmail,
    sendWelcome,
    sendAgentWelcome,
    sendAgentProfileLive,
    sendPasswordReset,
    sendLeadConfirmation,
    sendContactConfirmation,
    sendAdminLeadNotification,
    sendInquiryNotification,
    sendInquiryConfirmation,
    sendMatchedAgentNotification,
    sendAgentLeadAssigned,
    sendAgentMessageNotification,
    sendCashOfferToPartner,
    sendBusinessWelcome,
    sendBusinessAdminNotification,
    sendBusinessPaymentReceived,
    sendBusinessApproved,
    sendBusinessPaymentFailed,
    sendBusinessSubscriptionCancelled,
    sendAgentInvite,
    sendBusinessInvite,
    sendCustom,
    layout,
};
