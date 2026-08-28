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
const crypto        = require('crypto');
const fs            = require('fs');

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const RESEND_KEY     = process.env.RESEND_API_KEY;

// ── CAN-SPAM: unsubscribe + suppression ─────────────────────────────────────
// Marketing/automated email must carry a working unsubscribe + a physical
// postal address. Set EMAIL_PHYSICAL_ADDRESS in prod.
const PHYSICAL_ADDRESS = process.env.EMAIL_PHYSICAL_ADDRESS || 'MN Lake Homes, Minnesota, USA';
// EM-22: the default above is a PLACEHOLDER, not a valid CAN-SPAM postal address.
// Commercial email (lifecycle / content-ask / anything unclassified) is refused
// until EMAIL_PHYSICAL_ADDRESS holds a real street address.
const PLACEHOLDER_ADDRESS = 'MN Lake Homes, Minnesota, USA';
function hasRealPhysicalAddress() {
    const a = (process.env.EMAIL_PHYSICAL_ADDRESS || '').trim();
    return a.length > 0 && a !== PLACEHOLDER_ADDRESS;
}
// Dedicated secret for unsubscribe-token HMAC (SEC-04). Falls back to JWT_SECRET
// during the transition so existing links keep verifying until UNSUB_SECRET is
// set in the environment; no hardcoded literal (the source is public). Set
// UNSUB_SECRET in prod, ideally before rotating JWT_SECRET, to avoid breaking
// already-sent unsubscribe links.
const UNSUB_SECRET = process.env.UNSUB_SECRET || process.env.JWT_SECRET;

// Stateless, verifiable unsubscribe token (HMAC of the lowercased email).
function unsubToken(email) {
    return crypto.createHmac('sha256', UNSUB_SECRET).update(String(email).toLowerCase()).digest('hex').slice(0, 32);
}
function verifyUnsub(email, token) {
    try {
        const a = Buffer.from(unsubToken(email));
        const b = Buffer.from(String(token || ''));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (_) { return false; }
}
function unsubUrl(email) {
    const base = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
    return `${base}/unsubscribe?e=${encodeURIComponent(String(email).toLowerCase())}&t=${unsubToken(email)}`;
}
// Footer as TWO independent axes plus a per-template flag (EM-06 refinement):
//   class    → the unsubscribe decision (lifecycle/content-ask get a working
//              unsubscribe; transactional gets a service note; internal: none)
//   audience → the disclosure block (consumer: not-a-brokerage + no commission/
//              referral + EHO · agent: placement affects visibility/routing weight,
//              not licensure/qualification · business/internal: none)
//   usageGrant → the media-rights line, only where the email asks for photos
// The postal address is appended once. This composes so Blocks D/E can add
// templates without re-deriving footers.
function footerHtml(email, emailClass, audience, usageGrant) {
    const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    if (emailClass === 'internal') return '';   // to the team — no footer
    const blocks = [];
    // 1. class → unsubscribe / receipt note. The transactional receipt note is
    //    audience-aware: a matched buyer/seller has no "account", they asked to be
    //    matched — so the account wording is only right for agents + businesses.
    if (emailClass === 'lifecycle' || emailClass === 'content_ask') {
        const lead = emailClass === 'content_ask'
            ? "You're receiving this because you're part of the MN Lake Homes network."
            : "You're receiving this update from MN Lake Homes.";
        blocks.push(`${lead} <a href="${unsubUrl(email)}" style="color:#718096;">Unsubscribe</a> from these emails.`);
    } else if (audience === 'consumer') {
        blocks.push("You're receiving this because you asked to be matched with a local lake agent.");
    } else {
        blocks.push('This is a service message about your MN Lake Homes account.');
    }
    // 2. audience → disclosure
    if (audience === 'consumer') {
        blocks.push('MinnesotaLakeHomesForSale.com is not a brokerage and is not paid a commission or referral fee on your transaction. Equal Housing Opportunity.');
    } else if (audience === 'agent') {
        blocks.push('Placement affects your visibility and routing weight — not whether an agent is licensed, local, or qualified.');
    }
    // 3. per-template usage grant (media rights)
    if (usageGrant) {
        blocks.push('By replying with photos, text, or images, you give MinnesotaLakeHomesForSale.com permission to publish them on our website and social channels with credit to you. You keep ownership of your material, and you can ask us to remove anything at any time.');
        if (usageGrant === 'headshot') {
            blocks.push("This includes your headshot and name on a Featured Agent graphic. Nothing is published until you've seen it and said yes.");
        }
    }
    blocks.push(esc(PHYSICAL_ADDRESS));
    return `<div style="margin-top:1.75rem;padding-top:1rem;border-top:1px solid #edf2f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:0.72rem;color:#a0aec0;line-height:1.5;text-align:center;">${blocks.join('<br><br>')}</div>`;
}

// EM-05 — a plain-text alternative for every HTML email. Not a full HTML parser;
// a pragmatic downgrade: drop head/style, turn links into "text (url)", turn
// block-closers into newlines, strip the rest, decode the entities we actually
// use, and tidy whitespace. Big deliverability win for near-zero cost.
function htmlToText(html) {
    if (!html) return '';
    return String(html)
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<head[\s\S]*?<\/head>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        // Content wrapped in <!--notext-->…<!--/notext--> is decorative (e.g. the
        // initials avatar) — drop it from the plain-text alternative entirely.
        .replace(/<!--notext-->[\s\S]*?<!--\/notext-->/gi, '')
        // Buttons (display:inline-block links) each get their own line so adjacent
        // ones don't concatenate into one unreadable run; prose links stay inline.
        .replace(/<a\b([^>]*)href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, _pre, href, txt) => {
            const s = `${txt.replace(/<[^>]+>/g, '').trim()} (${href})`;
            return /inline-block/.test(m) ? `\n${s}\n` : s;
        })
        .replace(/<br\s*\/?>(\s*)/gi, '\n')
        .replace(/<\/(p|div|tr|h[1-6]|li|ol|ul|table)>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
        .replace(/&rsquo;|&lsquo;|&#39;/g, "'").replace(/&ldquo;|&rdquo;|&quot;/g, '"')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s*(?:→|&rarr;|&#8594;)/g, '')   // decorative arrows read oddly before a bare URL
        .split('\n').map(l => l.replace(/[ \t]{2,}/g, ' ').trim()).join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// EM-05 — frequency cap: at most EMAIL_CAP_MAX (default 1) commercial
// (lifecycle/content-ask) emails per recipient per EMAIL_CAP_WINDOW_DAYS
// (default 7), counting only rows that actually SENT. Transactional + internal
// are never capped. Fails OPEN on a DB error — a query hiccup must not silently
// drop a legitimate send (the caller re-tries next window anyway).
const CAP_WINDOW_DAYS = parseInt(process.env.EMAIL_CAP_WINDOW_DAYS, 10) || 7;
const CAP_MAX         = parseInt(process.env.EMAIL_CAP_MAX, 10) || 1;
async function overFrequencyCap(email, emailClass) {
    if (emailClass !== 'lifecycle' && emailClass !== 'content_ask') return false;
    try {
        const pool = require('../database/pool');
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM email_log
              WHERE to_email = $1
                AND email_class IN ('lifecycle','content_ask')
                AND status = 'sent'
                AND sent_at >= NOW() - make_interval(days => $2)`,
            [String(email).toLowerCase(), CAP_WINDOW_DAYS]);
        return rows[0].n >= CAP_MAX;
    } catch (_) { return false; }
}

// Suppression check (marketing only). Lazy pool require avoids load-order issues.
async function isSuppressed(email) {
    if (!email) return false;
    try {
        const pool = require('../database/pool');
        const { rows } = await pool.query('SELECT 1 FROM email_unsubscribes WHERE email = $1 LIMIT 1', [String(email).toLowerCase()]);
        return rows.length > 0;
    } catch (_) { return false; }
}

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
// Loud guard: onboarding@resend.dev is Resend's SANDBOX sender — it can only
// deliver to your own Resend account email, so in production every message to a
// real recipient is REJECTED (not just spam-filed). If we're on Resend and
// EMAIL_FROM was never set, say so at boot so it can't silently swallow the whole
// lifecycle. Fix: verify the domain in Resend (SPF+DKIM+DMARC), then set EMAIL_FROM
// to an address on minnesotalakehomesforsale.com.
if (_resend && /onboarding@resend\.dev/i.test(FROM)) {
    console.warn('[email] ⚠️  EMAIL_FROM is UNSET — sending from the Resend sandbox '
        + '(onboarding@resend.dev). Production emails to real recipients will be REJECTED. '
        + 'Verify the domain in Resend and set EMAIL_FROM to e.g. "MN Lake Homes '
        + '<hello@minnesotalakehomesforsale.com>".');
}
// EM-22: commercial (lifecycle / content-ask / unclassified) email is REFUSED
// until a real postal address is set — warn loudly at boot, not at send time.
if (!hasRealPhysicalAddress()) {
    console.error('[email] ⚠️  EMAIL_PHYSICAL_ADDRESS is unset or still the placeholder — '
        + 'commercial (lifecycle/content-ask) email will be BLOCKED for CAN-SPAM compliance. '
        + 'Set EMAIL_PHYSICAL_ADDRESS to a real street address.');
}

// Surfaced on /api/_diagnostic so the live sender can be confirmed from a browser
// (the From address is public — it rides in every email header). sandbox=true
// while on Resend means real recipients are being rejected.
function mailerHealth() {
    return {
        transport: _gmailTransport ? 'gmail' : (_resend ? 'resend' : 'none'),
        from: FROM,
        email_from_set: !!process.env.EMAIL_FROM,
        reply_to: REPLY_TO,
        sandbox: /onboarding@resend\.dev/i.test(FROM),
    };
}

function logSkip(reason) {
    console.log(`[email] skipped — ${reason}`);
}

// Best-effort record of every send attempt, for per-recipient email history.
// Fire-and-forget: never blocks or throws into the send path.
function writeEmailLog(to, subject, category, status, detail, emailClass, templateKey) {
    if (!to || Array.isArray(to)) return;   // history is per single recipient
    try {
        const pool = require('../database/pool');
        pool.query(
            `INSERT INTO email_log
                (to_email, subject, category, status, detail, email_class, template_key, provider_message_id, sent_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [String(to).toLowerCase(), subject || null, category || null, status,
             (detail == null ? null : String(detail).slice(0, 500)),
             emailClass || null, templateKey || null,
             status === 'sent' ? (detail || null) : null,   // provider_message_id lives in detail on success
             status === 'sent' ? new Date() : null]           // sent_at only when actually sent
        ).catch(() => {});
    } catch (_) {}
}

// ─── Low-level sender ────────────────────────────────────────────────────────
// Same signature as before — templates don't need to know the transport.
async function sendEmail({ to, subject, html, replyTo, category, emailClass, templateKey }) {
    if (!to) { logSkip('no recipient'); return { skipped: true }; }
    // EM-03: every log row carries the class + template key so the cap query and
    // the reports can read them. Single helper threads them into every write.
    const rec = (status, detail) => writeEmailLog(to, subject, category, status, detail, emailClass, templateKey);

    // EM-22 — CAN-SPAM consent integrity, keyed on the email CLASS (not category).
    // "Commercial" = anything NOT explicitly transactional or internal. An
    // UNCLASSIFIED send fails CLOSED: treated as commercial, so it honors the
    // suppression list + address requirement rather than being waved through.
    const commercial = emailClass !== 'transactional' && emailClass !== 'internal';
    let headers;
    if (!Array.isArray(to)) {
        if (commercial) {
            // Opt-out is absolute for Lifecycle + Content-ask (and anything unclassified).
            if (await isSuppressed(to)) { logSkip(`suppressed (${to})`); rec('suppressed', 'unsubscribed'); return { skipped: true, suppressed: true }; }
            // A commercial email with no valid postal address cannot be compliant — refuse it, loudly.
            if (!hasRealPhysicalAddress()) {
                console.error(`[email] BLOCKED (CAN-SPAM): commercial send with no valid EMAIL_PHYSICAL_ADDRESS — to=${to} subject="${subject || ''}"`);
                rec('skipped', 'no physical address (CAN-SPAM)');
                return { skipped: true, blocked: 'no_physical_address' };
            }
            // EM-05 frequency cap — 1 commercial email per recipient per window.
            // Logged as 'capped' (not dropped): the recurring trigger re-attempts
            // next window, and this makes over-eager automation visible.
            if (await overFrequencyCap(to, emailClass)) {
                logSkip(`frequency cap (${to})`);
                rec('capped', `frequency cap: ${CAP_MAX}/${CAP_WINDOW_DAYS}d`);
                return { skipped: true, capped: true };
            }
            headers = {
                'List-Unsubscribe': `<${unsubUrl(to)}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            };
        }
        // Footer composes class (unsubscribe) + audience (disclosure) + usage-grant,
        // the last two looked up from the registry by templateKey.
        const meta = templateKey ? EMAIL_TEMPLATES.find(t => t.key === templateKey) : null;
        html = (html || '') + footerHtml(to, emailClass, meta && meta.audience, meta && meta.usage_grant);
    }
    // EM-05 — plain-text alternative on every send (built after the footer).
    const text = htmlToText(html);

    // Prefer Gmail SMTP if configured.
    if (_gmailTransport) {
        try {
            const info = await _gmailTransport.sendMail({
                from: FROM,
                to:   Array.isArray(to) ? to.join(', ') : to,
                subject,
                html,
                text,
                replyTo: replyTo || REPLY_TO,
                ...(headers ? { headers } : {}),
            });
            console.log(`[email] sent → ${to} · ${subject} · id=${info.messageId || 'n/a'}`);
            rec('sent', info.messageId || null);
            return { data: { id: info.messageId } };
        } catch (err) {
            console.error(`[email] FAILED (gmail) → ${to} · ${subject}:`, err.message);
            rec('error', err.message);
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
                text,
                replyTo: replyTo || REPLY_TO,
                ...(headers ? { headers } : {}),
            });
            console.log(`[email] sent → ${to} · ${subject} · id=${res.data?.id || 'n/a'}`);
            rec('sent', res.data?.id || null);
            return res;
        } catch (err) {
            console.error(`[email] FAILED (resend) → ${to} · ${subject}:`, err.message);
            rec('error', err.message);
            return { error: err.message };
        }
    }

    logSkip('no transport configured');
    rec('skipped', 'no transport configured');
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
              ${title ? `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:#1a202c;">${title}</h1>` : ''}
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
                Minnesota Lake Homes · Lake-by-lake agent matching across Minnesota<br>
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
        emailClass: 'transactional',
        templateKey: 'password_reset',
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
        emailClass: 'transactional',
        templateKey: 'welcome',
        to: user.email,
        subject: 'Welcome to MN Lake Homes',
        html: layout({
            title: `Welcome aboard, ${name}.`,
            preheader: "You're in. Here's what happens next.",
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Thanks for joining Minnesota Lake Homes. You're now connected to a statewide network of local lakefront real estate specialists.
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
 * EM-10 — Agent welcome. Fires once a lake exists for the agent (their first
 * publish, resolved via geo tags), NOT at registration — the copy is lake-centric
 * and honest about what a free profile does and doesn't do (it does not receive
 * matched leads). `lake_count > 1` → "your lakes". Class transactional.
 */
function sendAgentWelcome({ email, display_name, first_name, lake_name, lake_count }) {
    const first = first_name || display_name?.split(' ')[0] || 'there';
    const several = (lake_count || 0) > 1;
    const lakeLabel = several ? 'your lakes' : (lake_name || 'your lake');
    const pageWord = several ? "your lakes' pages" : `${lakeLabel}'s page`;
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const h = 'margin:24px 0 8px;font-size:16px;font-weight:700;color:#1a202c;';
    const finishBtn = `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;">
          <tr><td style="background:#1d6df2;border-radius:8px;">
            <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">Finish your profile →</a>
          </td></tr>
        </table>`;
    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'agent_welcome',
        to: email,
        subject: several ? "You're on your lakes — here's exactly what that means" : `You're on ${lake_name} — here's exactly what that means`,
        html: layout({
            title: '',
            preheader: 'One thing to do today, and an honest note about leads.',
            body: `
                <p style="${p}">Hi ${first},</p>
                <p style="${p}">Your profile is set up on MinnesotaLakeHomesForSale.com. Here's exactly what it does, and what it doesn't — I'd rather you know now than find out in three months.</p>
                <h3 style="${h}">What your free profile does</h3>
                <p style="${p}">You appear on ${pageWord}, which is where people who are already searching for that specific lake land. They can see who you are, read your bio, and contact you directly. That's real visibility on a page built to rank for the lake you work.</p>
                <h3 style="${h}">What it doesn't do</h3>
                <p style="${p}">Free profiles don't receive matched leads. When someone fills out our match form, we route them to paid profiles only. That's a switch you turn on when you're ready — it's not something we'll quietly upgrade you into, and we won't route you a lead and then ask for money.</p>
                <h3 style="${h}">The one thing worth doing today</h3>
                ${finishBtn}
                <p style="${p}">A photo, two or three sentences about the lake you know, and your lakes selected. It takes about five minutes and it's the difference between a page a buyer contacts and one they scroll past.</p>
                <h3 style="${h}">And one thing that's always true</h3>
                <p style="${p}">We never take a referral fee. If a match turns into a closing, the commission is entirely yours. That's the whole model — agents pay a flat monthly amount for placement, and we stay out of your deals.</p>
                <p style="${p}">If anything here doesn't make sense, just reply. This address goes to me.</p>
                <p style="${p}">— Hunter Burnside<br>MinnesotaLakeHomesForSale.com</p>`,
        })
    });
}

/**
 * EM-11 — Agent profile published. One template, two variants off `tier`:
 *   paid  → fired by the Stripe webhook on first payment
 *   free  → fired by POST /api/agents/me/publish on the draft→published flip
 * Shows the agent their live lake page and hands them straight into the first
 * content ask (photos). Lake-centric copy; `lake_name`/`lake_slug` name the page,
 * with a graceful fallback to the agent's own profile when they have no lake seat.
 */
function sendAgentProfileLive({ email, first_name, display_name, slug, lake_name, lake_slug, tier }) {
    const first = first_name || display_name?.split(' ')[0] || 'there';
    const paid = tier === 'paid';
    const hasLake = !!(lake_name && lake_slug);
    // Anchor at the lake's agents section; per-agent card anchors don't exist on
    // the lake page yet (see EM-11 follow-up). No lake seat → point at the
    // agent's own public profile so the "See it" button still lands somewhere real.
    const pageUrl = hasLake
        ? `${SITE_URL}/lakes/${lake_slug}#lake-agents-grid`
        : (slug ? `${SITE_URL}/pages/public/agent-profile.html?slug=${slug}` : `${SITE_URL}/dashboard`);
    const lakeLabel = lake_name || 'the site';

    // Verbatim EM-11 copy (letter style — no h1). The "See it →" button sits
    // inline right after the intro line, then the paid/free "What happens now"
    // variant, then the photo ask.
    const seeItButton = `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">
          <tr><td style="background:#1d6df2;border-radius:8px;">
            <a href="${pageUrl}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">See it →</a>
          </td></tr>
        </table>`;

    const whatHappens = paid
        ? `You're in the routing pool for ${lakeLabel}. When someone submits a match request for that lake, you're one of the agents it can go to. Response time matters — the agents who reply fastest get weighted more heavily over time.`
        : `People searching for ${lakeLabel} will find you on that page and can contact you directly. Matched leads go to paid profiles, so if you want to be in the routing pool, that's the switch — but there's no rush and no pressure.`;

    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const h = 'margin:24px 0 8px;font-size:16px;font-weight:700;color:#1a202c;';

    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'agent_profile_live',
        to: email,
        subject: hasLake ? `Your profile is live on ${lake_name}` : 'Your profile is live',
        html: layout({
            title: '',
            preheader: "Here's the page — and one small thing that would make it better.",
            body: `
                <p style="${p}">Hi ${first},</p>
                <p style="${p}">You're live. Here's your profile on ${lakeLabel}'s page:</p>
                ${seeItButton}
                <h3 style="${h}">What happens now</h3>
                <p style="${p}">${whatHappens}</p>
                <h3 style="${h}">One small thing</h3>
                <p style="${p}">That page could use photos. If you've got three or four on your phone — the shoreline, a dock, the town, a sunset — reply to this email with them and we'll put them on the page with your name under them. Phone photos are fine, no editing needed.</p>
                <p style="${p}">— Hunter</p>`,
        })
    });
}

/**
 * Admin-initiated password reset — sent when an admin manually resets a
 * user's password from the admin dashboard. Includes the new temporary
 * password so the user can log in immediately. Renamed from
 * sendPasswordReset to sendAdminPasswordReset because the original name
 * collided with the forgot-password reset-link version above and silently
 * shadowed it, breaking the forgot-password flow.
 */
function sendAdminPasswordReset(user, newPassword) {
    const name = user.first_name || user.full_name?.split(' ')[0] || 'there';
    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'admin_password_reset',
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

    // B3: never promise agent contact when the lead isn't actually assigned
    // (held / unqualified). Soften the firm "within 24 hours / one business day"
    // language to a match-in-progress promise the platform can always keep.
    if (lead.matched === false) {
        copy.preheader = magnet
            ? `Your guide is attached — we're matching you with a local lake specialist.`
            : `We've got your request and are matching you with a local lake specialist.`;
        copy.body = copy.body
            .replace(/expect a call or email within one business day[^<]*/i, "we'll follow up as soon as we've matched you with the right local specialist.")
            .replace(/they'll reach out within one business day[^<]*/i, "they'll be in touch as soon as we've matched you with a local listing specialist.")
            .replace(/A local Minnesota lake home specialist will reach out within 24 hours to discuss your goals and next steps\./i, "We're matching you with a local Minnesota lake home specialist and will follow up as soon as we have the right person for your lake.");
    }

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
        emailClass: 'transactional',
        templateKey: 'lead_confirmation',
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
        emailClass: 'internal',
        templateKey: 'admin_lead_notification',
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
        emailClass: 'internal',
        templateKey: 'inquiry_notification',
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
        emailClass: 'transactional',
        templateKey: 'inquiry_confirmation',
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
        emailClass: 'transactional',
        templateKey: 'matched_agent_notification',
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
            ctaUrl: `${SITE_URL}/dashboard`,
        })
    });
}

/**
 * Simple custom send — lets us use the base `sendEmail` from elsewhere for
 * ad-hoc sends like newsletter campaigns later.
 */
function sendCustom({ to, subject, html, replyTo, emailClass, templateKey }) {
    // Generic passthrough. The CLASS must come from the caller — with none, the
    // send fails closed (treated commercial: suppressible + address-gated), which
    // is the safe default for an ad-hoc send.
    return sendEmail({ to, subject, html, replyTo, emailClass, templateKey });
}

/**
 * EM-04 — the P1 send-health alert to the owner. Internal class (exempt from
 * suppression + cap, always attempted). Fired by the send-health monitor when a
 * condition trips. NOTE: if the transport itself is down this email can't land —
 * the monitor also console.errors every sweep, which the platform logs capture.
 */
const OWNER_EMAIL = () => process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || process.env.LEAD_NOTIFY_EMAIL || 'hburnside99@gmail.com';

// EM-06 — the P1 incident email. States, in order: what broke · the user-visible
// effect · what to check first · the admin link. Fired by the incident router,
// never directly. Internal class. `repeated` flags a recurring/ongoing P1.
function sendIncidentAlert({ title, effect, checkFirst, adminLink, occurrences, repeated }) {
    const p = 'margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;';
    const label = 'margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:#718096;';
    const url = adminLink ? (String(adminLink).startsWith('http') ? adminLink : `${SITE_URL}${adminLink}`) : null;
    return sendEmail({
        emailClass: 'internal',
        templateKey: 'incident_p1_alert',
        to: OWNER_EMAIL(),
        subject: `⛔ P1${repeated ? ' [still broken]' : ''}: ${title}${occurrences > 1 ? ` (×${occurrences})` : ''}`,
        html: layout({
            title: 'P1 — action needed now',
            preheader: `${title}${effect ? ` — ${effect}` : ''}`,
            body: `
                <p style="${label}">What broke</p>
                <p style="${p}"><strong>${title}</strong></p>
                ${effect ? `<p style="${label}">Effect</p><p style="${p}">${effect}</p>` : ''}
                ${checkFirst ? `<p style="${label}">Check first</p><p style="${p}">${checkFirst}</p>` : ''}`,
            ctaText: url ? 'Open admin' : undefined,
            ctaUrl: url || undefined,
        })
    });
}

// EM-06 — the hourly P2 digest. One email listing every open P2 incident, each
// with its occurrence count. Fired by the router's batch, never directly.
function sendIncidentDigest({ incidents }) {
    const rows = (incidents || []).map(i =>
        `<li style="margin-bottom:8px;"><strong>${i.title}</strong>${i.occurrences > 1 ? ` <span style="color:#718096;">(×${i.occurrences})</span>` : ''}${i.detail ? `<br><span style="color:#718096;font-size:13px;">${i.detail}</span>` : ''}</li>`).join('');
    const n = (incidents || []).length;
    return sendEmail({
        emailClass: 'internal',
        templateKey: 'incident_p2_digest',
        to: OWNER_EMAIL(),
        subject: `${n} thing${n === 1 ? '' : 's'} to look at today`,
        html: layout({
            title: 'Needs attention today',
            preheader: `${n} open item${n === 1 ? '' : 's'} — not urgent, but worth a look.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  These are open and need attention today (not this minute). Each clears itself in the weekly report once resolved.
                </p>
                <ul style="margin:0 0 16px;padding-left:1.2rem;font-size:15px;line-height:1.6;color:#2d3748;">${rows}</ul>`,
            ctaText: 'Open admin',
            ctaUrl: `${SITE_URL}/pages/admin/system.html`,
        })
    });
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
        emailClass: 'transactional',
        templateKey: 'business_welcome',
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
 * Sent to the admin inbox the moment a new agent signs up — so Hunter
 * knows someone joined and can reach out if it's worth a personal note.
 * (Agents don't need admin approval — Stripe auto-publishes — so this is
 * informational, not a queue notification.)
 */
function sendAgentAdminNotification({ display_name, email, phone, brokerage_name, license_number }) {
    const row = (k, v) => v ? `<tr><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:8px 12px;font-size:15px;color:#1a202c;">${v}</td></tr>` : '';
    return sendEmail({
        emailClass: 'internal',
        templateKey: 'agent_admin_notification',
        to: REPLY_TO,
        replyTo: email,
        subject: `🆕 New agent signup — ${display_name}`,
        html: layout({
            title: 'A new agent just joined',
            preheader: `${display_name}${brokerage_name ? ' · ' + brokerage_name : ''}`,
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  <strong>${display_name}</strong> just created an agent account. They'll go live in the directory once they complete their profile and pick a plan.
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
                  ${row('Name', display_name)}
                  ${row('Email', `<a href="mailto:${email}" style="color:#1d6df2;text-decoration:none;">${email}</a>`)}
                  ${row('Phone', phone || '—')}
                  ${row('Brokerage', brokerage_name || '—')}
                  ${row('License', license_number || '—')}
                </table>
                <p style="margin:18px 0 0;font-size:13px;color:#718096;line-height:1.5;">
                  Open the admin agents ledger to see their profile progress, or reply to this email — it goes straight to them.
                </p>`,
            ctaText: 'Open admin agents',
            ctaUrl: `${SITE_URL}/pages/admin/agents.html`,
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
        emailClass: 'internal',
        templateKey: 'business_admin_notification',
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
        emailClass: 'transactional',
        templateKey: 'business_payment_received',
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
        emailClass: 'transactional',
        templateKey: 'business_approved',
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
        emailClass: 'transactional',
        templateKey: 'business_payment_failed',
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
        emailClass: 'transactional',
        templateKey: 'business_subscription_cancelled',
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

/**
 * Admin alert — an agent or business just canceled their subscription.
 * Goes to REPLY_TO (the owner inbox) so churn is noticed immediately.
 * `kind` is a label like 'Agent', 'Business', or 'Founder seat'.
 */
function sendAdminSubscriptionCancelled({ kind, who, contact, tier, subscriptionId, note }) {
    const label = kind || 'Subscription';
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const rows = [
        { label: 'Type',      value: label },
        { label: kind === 'Business' ? 'Business' : 'Name', value: who || '—' },
        { label: 'Contact',   value: contact || 'Unknown' },
        { label: 'Plan',      value: tier || '—' },
        { label: 'Canceled',  value: timestamp },
        { label: 'Sub ID',    value: subscriptionId || '—' },
    ].map(r => `
        <tr>
            <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${r.label}</td>
            <td style="padding:8px 12px;font-size:15px;color:#1a202c;">${r.value}</td>
        </tr>`).join('');

    return sendEmail({
        emailClass: 'internal',
        templateKey: 'admin_subscription_cancelled',
        to: REPLY_TO,
        subject: `⚠️ ${label} canceled — ${who || 'subscription ended'}`,
        html: layout({
            title: `A ${label.toLowerCase()} just canceled`,
            preheader: `${who || 'A subscriber'} canceled their ${label.toLowerCase()} subscription.`,
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Stripe reported a cancellation. Details:
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">${rows}</table>
                ${note ? `<p style="margin:16px 0 0;font-size:14px;color:#4a5568;line-height:1.6;">${note}</p>` : ''}`,
            ctaText: 'Open Admin Dashboard',
            ctaUrl: `${SITE_URL}/pages/admin/dashboard.html`,
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

function sendAgentInvite({ to, first_name, tier_label, tempPassword, comped = false }) {
    const name = first_name || 'there';
    const loginUrl = `${SITE_URL}/pages/public/agent-login.html`;
    const subject = comped
        ? `You're invited to MN Lake Homes — your ${tier_label} profile is ready`
        : `You're invited to MN Lake Homes — finish your agent profile`;
    const preheader = comped
        ? `Your ${tier_label} agent profile is comped and ready to set up.`
        : `Your free agent profile is ready — log in and finish it.`;
    const intro = comped
        ? `Our team set up a complimentary <strong>${tier_label}</strong> agent profile for you on Minnesota Lake Homes. Your account is live and the membership is fully paid for — you just need to log in and fill in your details so buyers and sellers can find you.`
        : `Our team started an agent profile for you on Minnesota Lake Homes — the site where buyers search for their lake. Just log in and fill in your details so buyers and sellers can find you. Getting listed is free; you can turn on matched leads and featured placement whenever you're ready.`;
    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'agent_invite',
        to,
        subject,
        html: layout({
            title: `Welcome to the network, ${name}.`,
            preheader,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  ${intro}
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
        emailClass: 'transactional',
        templateKey: 'business_invite',
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
        emailClass: 'transactional',
        templateKey: 'agent_lead_assigned',
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
            ctaUrl: `${SITE_URL}/dashboard`,
        })
    });
}

// T141 — a held lead has been hand-placed with this (free-tier) agent. The
// signed accept link is the ONLY acceptance surface (nothing about this appears
// in the portal). Direct contact details are WITHHELD here on purpose — the
// agent gets them the moment they accept, which is what makes acceptance mean
// something. Framed as an ordinary lead offer, never as a "free placement".
function sendManualLeadOffer({ to, agentFirstName, lead = {}, acceptUrl, expiresHours = 24 }) {
    if (!to || !acceptUrl) return { skipped: true };
    const typeLabel = (lead.type || 'lead').replace(/_/g, ' ');
    const rows = [
        { label: 'Lake',       value: _esc(lead.lakeName) || 'A lake you cover' },
        { label: 'Looking to', value: _esc(lead.intent) || _esc(typeLabel) || '—' },
        { label: 'Price band', value: _esc(lead.priceBand) || '—' },
    ].filter(r => r.value && r.value !== '—').map(r => `
        <tr>
            <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;white-space:nowrap;">${r.label}</td>
            <td style="padding:8px 12px;font-size:15px;color:#1a202c;">${r.value}</td>
        </tr>`).join('');
    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'manual_lead_offer',
        to,
        subject: `A lead on ${lead.lakeName || 'your lake'} is waiting for you`,
        html: layout({
            title: 'A lead is waiting for you',
            preheader: `${lead.lakeName || 'A lake you cover'} · accept within ${expiresHours} hours`,
            body: `
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Hi ${_esc(agentFirstName) || 'there'} — someone searching ${_esc(lead.lakeName) || 'a lake you cover'} is looking for an agent, and we'd like to hand them to you.
                </p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
                    ${rows}
                </table>
                <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#2d3748;">
                  Accept within <strong>${expiresHours} hours</strong> to claim it — you'll get their full contact details in your dashboard the moment you do. If it isn't accepted in time it goes back in the queue.
                </p>`,
            ctaText: 'Accept this lead',
            ctaUrl: acceptUrl,
        })
    });
}

// EM-12 — "You've been matched": the concierge handoff to the buyer/seller. This
// email is the product — everything (lake pages, SEO, vetting, routing) exists to
// produce this moment, so it reads like an introduction, not a system notice.
// Fires when an agent accepts the lead. Transactional — no unsubscribe.
// next_season is computed here; the three questions are static for v1.
function nextLakeSeason() {
    const m = new Date().getMonth();               // 0 = Jan
    // Phrased to fit "If I want to be ___". Tied to the MN lake season, not a
    // generic calendar — shopping in late August targets before ice-in, not a
    // summer ten months out.
    if (m >= 7 && m <= 9) return 'in before ice-in';   // Aug–Oct
    if (m >= 10 || m <= 1) return 'in by spring';       // Nov–Feb
    return 'in by this summer';                          // Mar–Jul
}
function sendLeadAgentMatched({
    to, lead_first_name, agent_full_name, agent_first_name, brokerage,
    lake_name, town, agent_bio, years_experience, nearby_lakes, agent_phone, agent_email, photo_url, specialty,
}) {
    if (!to) return { skipped: true };
    const aFull = _esc(agent_full_name) || 'your agent';
    const aFirst = _esc(agent_first_name) || (agent_full_name ? _esc(agent_full_name.split(' ')[0]) : 'They');
    const lake = _esc(lake_name) || 'your lake';
    const season = nextLakeSeason();
    const photo = photo_url ? (String(photo_url).startsWith('http') ? photo_url : `${SITE_URL}${photo_url}`) : null;
    const initials = (agent_full_name || 'A').split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    const headshot = photo
        ? `<img src="${photo}" width="120" height="120" alt="${aFull}" style="border-radius:60px;object-fit:cover;display:block;">`
        : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:120px;height:120px;border-radius:60px;background:#1d6df2;color:#fff;font-size:40px;font-weight:800;text-align:center;vertical-align:middle;font-family:-apple-system,Segoe UI,Arial,sans-serif;">${_esc(initials) || 'A'}</td></tr></table>`;

    // "Why [Agent]" — only the bullets we actually have. Experience is stated as
    // the self-reported number it is ("X years in the business"), NOT derived into
    // a licensure-year claim we can't stand behind.
    const yrs = Number(years_experience) > 0 ? Math.round(Number(years_experience)) : null;
    // Proper list: "Gull Lake, North Long Lake and Round Lake" (not "Gull Lake and
    // North Long Lake, Round Lake").
    const joinAnd = (a) => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
    const lakeList = [lake_name, ...(nearby_lakes ? String(nearby_lakes).split(/,\s*/) : [])].filter(Boolean).map(_esc);
    const whyBits = [
        `works ${joinAnd(lakeList) || lake}`,
        yrs ? `${yrs} year${yrs === 1 ? '' : 's'} in the business` : null,
        _esc(specialty) || null,
    ].filter(Boolean);
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const h = 'margin:24px 0 8px;font-size:16px;font-weight:700;color:#1a202c;';
    const reach = [_esc(agent_phone), _esc(agent_email)].filter(Boolean).join(' · ');

    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'lead_agent_matched',
        to,
        subject: `Meet ${aFirst} — your ${lake} agent`,
        html: layout({
            title: '',
            preheader: 'A quick introduction, what to expect, and three questions worth asking.',
            body: `
                <p style="${p}">Hi ${_esc(lead_first_name) || 'there'},</p>
                <p style="${p}">You're matched with <strong>${aFull}</strong>${brokerage ? ` at ${_esc(brokerage)}` : ''}, who works ${lake}${town ? ` and the ${_esc(town)} area` : ''}.</p>
<!--notext--><div style="margin:0 0 16px;">${headshot}</div><!--/notext-->
                ${agent_bio ? `<p style="${p}">${_esc(agent_bio)}</p>` : ''}
                <h3 style="${h}">Why ${aFirst}</h3>
                <ul style="margin:0 0 16px;padding-left:1.2rem;font-size:15px;line-height:1.7;color:#2d3748;">
                  ${whyBits.map(b => `<li>${b}</li>`).join('')}
                </ul>
                <h3 style="${h}">What happens next</h3>
                <p style="${p}">${aFirst} will reach out within 24 hours by phone or email.${reach ? ` If you'd rather start the conversation yourself, here's how to reach them directly: ${reach}` : ''}</p>
                <h3 style="${h}">Three questions worth asking on that first call</h3>
                <ol style="margin:0 0 16px;padding-left:1.2rem;font-size:15px;line-height:1.7;color:#2d3748;">
                  <li>What's actually selling on ${lake} right now, and what's the price per foot of shoreline?</li>
                  <li>What should I know about this lake specifically — water clarity, access, septic and well, shoreline rules?</li>
                  <li>If I want to be ${season}, what does the timeline actually look like?</li>
                </ol>
                <h3 style="${h}">How this works, briefly</h3>
                <p style="${p}">We're not a brokerage, and we're not paid a commission or a referral fee on your purchase. ${aFirst} is a licensed Minnesota agent we've vetted and matched to your lake and your situation. If they're not the right fit, reply to this email and I'll match you with someone else. No cost either way.</p>
                <p style="${p}">— Hunter Burnside<br>MinnesotaLakeHomesForSale.com</p>`,
        })
    });
}

// EM-13 — "No agent on your lake yet". The highest-intent traffic we have (they
// searched a specific lake and filled out a form) would otherwise get a
// confirmation and then silence forever. Tell them the truth, keep the
// relationship, and offer a nearby-lake intro. `variant: 'followup'` is the short
// 7-day check-in. Consumer/transactional.
function sendNoAgentYet({ to, first_name, lake_name, lake_slug, nearby_lakes, variant }) {
    if (!to) return { skipped: true };
    const lake = _esc(lake_name) || 'that lake';
    const first = _esc(first_name) || 'there';
    const nearby = Array.isArray(nearby_lakes) ? nearby_lakes.filter(Boolean) : (nearby_lakes ? [nearby_lakes] : []);
    const nearbyPhrase = nearby.length
        ? `Agents who work ${nearby.map(_esc).join(' and ')} often cover ${lake} too, and I can make an introduction now.`
        : `Agents who work the surrounding lakes often cover ${lake} too, and I can make an introduction now.`;
    const guideUrl = lake_slug ? `${SITE_URL}/lakes/${lake_slug}` : `${SITE_URL}/find-your-lake`;
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const guideBtn = `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;">
          <tr><td style="background:#1d6df2;border-radius:8px;">
            <a href="${guideUrl}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">${lake} guide →</a>
          </td></tr>
        </table>`;

    if (variant === 'followup') {
        return sendEmail({
            emailClass: 'transactional', templateKey: 'lead_no_agent_yet', to,
            subject: `Still on it — your ${lake_name || 'lake'} request`,
            html: layout({ title: '', preheader: 'A quick update — no need to do anything.', body: `
                <p style="${p}">Hi ${first},</p>
                <p style="${p}">Quick update on your ${lake} request: still working on finding you an agent I'd send my own family to. I haven't forgotten you.</p>
                <p style="${p}">${nearbyPhrase} If you'd like that, just reply.</p>
                <p style="${p}">— Hunter Burnside</p>` }),
        });
    }
    return sendEmail({
        emailClass: 'transactional', templateKey: 'lead_no_agent_yet', to,
        subject: `About your ${lake_name || 'lake'} request`,
        html: layout({ title: '', preheader: 'Where things stand, honestly.', body: `
            <p style="${p}">Hi ${first},</p>
            <p style="${p}">Thanks for your request about ${lake}. I want to be straight with you rather than leave you waiting: we don't yet have an agent on our platform who covers ${lake}.</p>
            <p style="${p}">Here's what I'm doing about it. I'm reaching out to agents who actually work that lake, and I'll email you as soon as I have someone I'd send my own family to. That's usually a few days.</p>
            <p style="${p}">In the meantime, here's what we know about the lake:</p>
            ${guideBtn}
            <p style="${p}">And if you'd rather not wait — reply and tell me. ${nearbyPhrase}</p>
            <p style="${p}">— Hunter Burnside</p>` }),
    });
}

// EM-14 (buyer) — the reroute note. Short, no blame, no mention that an agent
// ignored them. Used on offer-expiry AND when the buyer/agent triggers a reroute
// (EM-15 pass-back, EM-16 "not yet"). Consumer/transactional.
function sendRerouteBuyer({ to, first_name, lake_name }) {
    if (!to) return { skipped: true };
    const lake = _esc(lake_name) || 'your lake';
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    return sendEmail({
        emailClass: 'transactional', templateKey: 'lead_reroute_buyer', to,
        subject: `Quick update on your ${lake_name || 'lake'} request`,
        html: layout({ title: '', preheader: "A quick update — you'll hear back shortly.", body: `
            <p style="${p}">Hi ${_esc(first_name) || 'there'} — quick update: I'm matching you with a different ${lake} agent to make sure you hear back quickly. You'll have an introduction within 24 hours.</p>
            <p style="${p}">— Hunter</p>` }),
    });
}

// EM-14 (agent) — factual, states the consequence, no scolding. Sent to the agent
// who let a manual offer's window lapse. Agent/transactional.
function sendRerouteAgent({ to, agentFirstName, buyer_first, lake_name, timeline, windowHours }) {
    if (!to) return { skipped: true };
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const lake = _esc(lake_name) || 'the';
    return sendEmail({
        emailClass: 'transactional', templateKey: 'lead_reroute_agent', to,
        subject: `The ${lake_name || 'lake'} lead went to another agent`,
        html: layout({ title: '', preheader: 'Response time factors into routing weight.', body: `
            <p style="${p}">${_esc(agentFirstName) || 'Hi'} — the ${lake} lead (${_esc(buyer_first) || 'a buyer'}${timeline ? `, ${_esc(timeline)}` : ''}) went to another agent after the ${windowHours || 'response'}-hour window passed. No hard feelings, but response time factors into routing weight, so faster replies mean more leads. If the window's too short for how you work, reply and tell me.</p>` }),
    });
}

// EM-15 — agent response nudge, +1h then +24h after routing if no contact is
// logged. Speed to first contact is the whole difference between a lead and a
// wasted one. Buttons are tokenised (no login). Agent/transactional.
function sendAgentNudge({ variant, to, agentFirstName, buyer_first, lake_name, timeline, budget, intent, phone, markContactedUrl, passBackUrl }) {
    if (!to) return { skipped: true };
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const btn = (url, label, primary) => `<a href="${url}" style="display:inline-block;padding:12px 22px;margin:0 8px 8px 0;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;${primary ? 'background:#1d6df2;color:#fff;' : 'background:#edf2f7;color:#2d3748;'}">${label}</a>`;
    const facts = [_esc(lake_name), _esc(timeline), _esc(budget), _esc(intent)].filter(Boolean).join(' · ');

    if (variant === '24h') {
        return sendEmail({
            emailClass: 'transactional', templateKey: 'agent_response_nudge', to,
            subject: `Still no contact logged on the ${lake_name || 'lake'} lead`,
            html: layout({ title: '', preheader: 'Mark it contacted, or pass it back to reroute.', body: `
                <p style="${p}">${_esc(buyer_first) || 'A buyer'} submitted a request 24 hours ago and we haven't seen contact logged.</p>
                <p style="${p}">If you can't take this one, hit <strong>Pass this one back</strong> and I'll reroute it immediately — that's a completely fine answer. If you have reached out, just mark it contacted so the system knows.</p>
                <p style="margin:8px 0 0;">${btn(markContactedUrl, 'Mark as contacted', true)}${btn(passBackUrl, 'Pass this one back', false)}</p>` }),
        });
    }
    return sendEmail({
        emailClass: 'transactional', templateKey: 'agent_response_nudge', to,
        subject: `${buyer_first || 'A buyer'} is waiting — ${lake_name || 'your lake'}`,
        html: layout({ title: '', preheader: 'First agent to reach them usually wins the client.', body: `
            <p style="${p}"><strong>${_esc(buyer_first) || 'A buyer'} is waiting</strong> — ${facts}</p>
            <p style="margin:8px 0 0;">${phone ? btn(`tel:${String(phone).replace(/[^0-9+]/g, '')}`, `Call ${_esc(phone)}`, true) : ''}${btn(markContactedUrl, 'Mark as contacted', !phone)}</p>
            <p style="${p}margin-top:16px;">— Hunter</p>` }),
    });
}

// EM-16 — "Did they reach out?" 72h after routing, to the buyer/seller. Quality
// control on the whole product: the answers feed routing weight, "yes" becomes a
// testimonial, "not yet" fixes a bad match before the person writes us off. One
// question, one click. Consumer/transactional.
function sendDidTheyReachOut({ to, first_name, agent_full_name, yesUrl, notYetUrl, pausedUrl }) {
    if (!to) return { skipped: true };
    const first = _esc(first_name) || 'there';
    const agentFirst = agent_full_name ? _esc(String(agent_full_name).split(' ')[0]) : 'your agent';
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const btn = (url, label, primary) => `<a href="${url}" style="display:inline-block;padding:12px 20px;margin:0 8px 8px 0;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;${primary ? 'background:#1d6df2;color:#fff;' : 'background:#edf2f7;color:#2d3748;'}">${label}</a>`;
    return sendEmail({
        emailClass: 'transactional', templateKey: 'buyer_feedback_72h', to,
        subject: `Did ${agentFirst} get in touch?`,
        html: layout({ title: '', preheader: 'One click, and it genuinely helps.', body: `
            <p style="${p}">Hi ${first},</p>
            <p style="${p}">I matched you with ${_esc(agent_full_name) || 'an agent'} a few days ago. One question, one click:</p>
            <p style="margin:8px 0 0;">${btn(yesUrl, "Yes, we've connected", true)}${btn(notYetUrl, 'Not yet', false)}${btn(pausedUrl, "I've paused my search", false)}</p>
            <p style="${p}margin-top:20px;">That's the whole email. If the answer is "not yet," I'll find you someone else today — you shouldn't have to chase an agent.</p>
            <p style="${p}">— Hunter</p>` }),
    });
}

// EM-18 — ladder rung 1: photos of your lake. Lowest-friction ask (photos already
// on their phone) and it fixes the thin-lake-page problem. Reply-to is a monitored
// inbox that accepts attachments. Content-ask/agent + usage grant (required).
function sendLadderPhotos({ to, first_name, lake_name, replyTo }) {
    if (!to) return { skipped: true };
    const lake = _esc(lake_name) || 'your lake';
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    return sendEmail({
        emailClass: 'content_ask', templateKey: 'ladder_photos', to, replyTo,
        subject: `Do you have any photos of ${lake_name || 'your lake'}?`,
        html: layout({ title: '', preheader: "Three or four from your phone. We'll put your name on them.", body: `
            <p style="${p}">Hi ${_esc(first_name) || 'there'},</p>
            <p style="${p}">${lake}'s page gets found by people searching for that exact lake. Right now it's mostly text.</p>
            <p style="${p}">If you've got three or four photos on your phone — the shoreline, a dock, the town, a sunset off someone's deck — just reply to this email with them attached. We'll put them on the page with your name and a link to your profile underneath.</p>
            <p style="${p}">No editing needed, phone photos are exactly right. We'll skip anything with recognisable faces or house numbers.</p>
            <p style="${p}">That's the whole ask.</p>
            <p style="${p}">— Hunter</p>
            <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#718096;">P.S. If you'd rather the credit go to your brokerage than to you, just say so in the reply.</p>` }),
    });
}

// EM-19 — ladder rung 2: one question about your lake. 90 seconds → unique,
// attributed, locally-specific FAQ text. Only after rung 1 got a response.
function sendLadderQuestion({ to, first_name, lake_name, replyTo }) {
    if (!to) return { skipped: true };
    const lake = _esc(lake_name) || 'your lake';
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const question = `What's the one thing you'd tell a buyer about ${lake} that they'd never get from a listing?`;
    return sendEmail({
        emailClass: 'content_ask', templateKey: 'ladder_question', to, replyTo,
        subject: `One question about ${lake_name || 'your lake'}`,
        html: layout({ title: '', preheader: "Two sentences is plenty. We'll publish it with your name on it.", body: `
            <p style="${p}">Hi ${_esc(first_name) || 'there'},</p>
            <p style="${p}">One question, and two sentences is plenty:</p>
            <p style="${p}font-weight:700;color:#1a202c;">${question}</p>
            <p style="${p}">Write it the way you'd say it to a client standing on the dock — no need to make it sound like marketing. We'll publish it on ${lake}'s page under your name with a link to your profile, in the FAQ section, which is the part that tends to show up when someone Googles a question about the lake.</p>
            <p style="${p}">Just reply.</p>
            <p style="${p}">— Hunter</p>` }),
    });
}

// EM-20 — ladder rung 4: Featured Agent invite. Sample spotlight graphic embedded
// (copy still reads with images blocked). Usage grant extended to headshot/likeness;
// nothing publishes without Hunter's send. Only for agents who cleared rung 1 or 2.
function sendLadderFeatured({ to, first_name, lake_name, contributed, lake_url, replyTo }) {
    if (!to) return { skipped: true };
    const lake = _esc(lake_name) || 'your lake';
    const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;';
    const thing = contributed === 'answer' ? 'answer' : 'photos';
    const pageUrl = lake_url || `${SITE_URL}/find-your-lake`;
    const sampleImg = `${SITE_URL}/assets/images/featured-agent-sample.png`;
    return sendEmail({
        emailClass: 'content_ask', templateKey: 'ladder_featured', to, replyTo,
        subject: 'Want to be our next Featured Agent?',
        html: layout({ title: '', preheader: 'Four fields from you. We make the graphic and post it.', body: `
            <p style="${p}">Hi ${_esc(first_name) || 'there'},</p>
            <p style="${p}">Thanks for the ${thing} — it's on ${lake}'s page now: <a href="${pageUrl}" style="color:#1d6df2;">see it here</a>.</p>
            <p style="${p}">Next thing, if you're up for it. We run a Featured Agent spotlight on our social channels and on your profile. It looks like this:</p>
            <p style="${p}"><img src="${sampleImg}" alt="Sample MN Lake Homes Featured Agent spotlight graphic — a headshot, name, brokerage, and a line about the agent's lake." width="480" style="max-width:100%;border-radius:10px;"></p>
            <p style="${p}">To make yours I need four things:</p>
            <ul style="margin:0 0 16px;padding-left:1.2rem;font-size:15px;line-height:1.8;color:#2d3748;">
              <li>A headshot you like</li>
              <li>Your brokerage as you want it written</li>
              <li>One line about what you're known for on ${lake}</li>
              <li>The phone or email you want on it</li>
            </ul>
            <p style="${p}">Reply with those and I'll send you the finished graphic before it goes anywhere — you get final say, and the file is yours to post on your own channels too.</p>
            <p style="${p}">— Hunter</p>` }),
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
        emailClass: 'transactional',
        templateKey: 'agent_message_notification',
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
            ctaUrl: `${SITE_URL}/dashboard`,
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
        emailClass: 'transactional',
        templateKey: 'cash_offer_to_partner',
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

/**
 * Agent dunning email (T073) — sent on each Stripe `invoice.payment_failed`.
 * Copy escalates with the retry: attempt 1 is a gentle heads-up, later attempts
 * warn more firmly, and the FINAL notice (Stripe has given up retrying) tells
 * them the profile is about to drop out of the lead rotation. Transactional.
 *
 * @param {object} p
 * @param {string} p.to            account email
 * @param {string} [p.name]        agent display name
 * @param {number} [p.attempt]     Stripe invoice.attempt_count (1-based)
 * @param {boolean} [p.final]      true when there's no next retry (giving up)
 * @param {Date|null} [p.nextAttempt] next retry date, if any
 */
// Nudge an agent whose profile is still unpublished ("draft") to finish it and
// go live. Fired by the onboarding-nudge sweep — spaced out, capped, so it never
// spams. The whole ask: add the few missing pieces, then publish.
function sendAgentProfileNudge({ to, first_name, missing = [], nudgeNumber = 1 }) {
    if (!to) return { skipped: true };
    const name = first_name || 'there';
    const dash = `${SITE_URL}/dashboard`;
    const missingHtml = missing.length
        ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1a202c;">To go live, add:</p>
           <ul style="margin:0 0 18px;padding-left:1.15rem;font-size:15px;line-height:1.7;color:#2d3748;">${missing.map(m => `<li>${_esc(m)}</li>`).join('')}</ul>`
        : '';
    return sendEmail({
        emailClass: 'lifecycle',
        templateKey: 'agent_profile_nudge',
        to,
        subject: nudgeNumber >= 2
            ? `${name}, your lake profile is still hidden — a few minutes to go live`
            : `${name}, finish your profile to start getting matched`,
        html: layout({
            title: `You're almost live, ${name}`,
            preheader: 'A few quick pieces and your profile goes on the lake pages.',
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Your MinnesotaLakeHomesForSale.com profile is created but <strong>not published yet</strong> — so buyers searching your lakes can't find you, and you're not in the lead rotation. Finishing it takes just a few minutes.
                </p>
                ${missingHtml}
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Add the missing pieces, hit Publish, and your profile is live on the lake pages you serve — usually within minutes.
                </p>`,
            ctaText: 'Finish my profile',
            ctaUrl: dash,
        })
    });
}

// Enrichment nudge — for agents who ARE published but haven't filled the rich
// profile sections (FAQ answers, by-the-numbers, services, how-I-work,
// credentials/awards). Buyers comparing agents on a lake page reach out to the
// most complete profile, so this drives updates, not first-time completion.
function sendAgentProfileEnrichmentNudge({ to, first_name, missing = [], nudgeNumber = 1 }) {
    if (!to) return { skipped: true };
    const name = first_name || 'there';
    const dash = `${SITE_URL}/dashboard`;
    const missingHtml = missing.length
        ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1a202c;">A few sections still to add:</p>
           <ul style="margin:0 0 18px;padding-left:1.15rem;font-size:15px;line-height:1.7;color:#2d3748;">${missing.map(m => `<li>${_esc(m)}</li>`).join('')}</ul>`
        : '';
    return sendEmail({
        emailClass: 'lifecycle',
        templateKey: 'agent_profile_enrichment_nudge',
        to,
        subject: nudgeNumber >= 2
            ? `${name}, buyers pick the most complete profile — yours is missing a few pieces`
            : `${name}, make your lake profile stand out (a few quick additions)`,
        html: layout({
            title: `Make your profile work harder, ${name}`,
            preheader: 'FAQs, your stats, and how you work help buyers choose you.',
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Your profile is live on MinnesotaLakeHomesForSale.com — nice work. Buyers comparing agents on a lake page tend to reach out to the most complete, credible profile, and yours is missing a few sections that do exactly that.
                </p>
                ${missingHtml}
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Each takes a couple of minutes in your dashboard, and they appear right on your public profile.
                </p>`,
            ctaText: 'Update my profile',
            ctaUrl: dash,
        })
    });
}

// Referral reward — sent to BOTH sides when a referred agent goes paid. `kind`
// = 'referrer' | 'referred'; `auto` flips the wording between "applied" and
// "we'll apply it".
function sendReferralRewardEmail({ to, first_name, kind = 'referrer', auto = false }) {
    if (!to) return { skipped: true };
    const name = first_name || 'there';
    const dash = `${SITE_URL}/dashboard`;
    const isReferrer = kind === 'referrer';
    const monthLine = auto
        ? `A one-month credit has been applied to your account — it comes off your next invoice automatically.`
        : `Your one-month credit will be applied to your next invoice.`;
    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'referral_reward',
        to,
        subject: isReferrer ? `You earned a free month 🎉` : `Welcome — a free month is on us 🎉`,
        html: layout({
            title: isReferrer ? `Nice work, ${name} — you earned a free month` : `Thanks for joining, ${name}`,
            preheader: isReferrer ? 'An agent you referred just went paid.' : 'You were referred — a free month is on us.',
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  ${isReferrer
                    ? `An agent you referred to MinnesotaLakeHomesForSale.com just upgraded to a paid plan. As a thank-you, you've earned <strong>one month free</strong>.`
                    : `You joined MinnesotaLakeHomesForSale.com through a referral and upgraded to a paid plan — so <strong>a month is on us</strong>, and the agent who referred you gets one too.`}
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">${monthLine}</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#718096;">
                  ${isReferrer ? 'Know another great agent? Your referral link is in the Referrals tab of your dashboard.' : 'Questions? Just reply to this email.'}
                </p>`,
            ctaText: 'Open my dashboard',
            ctaUrl: dash,
        })
    });
}

// AL-14 — lead-landed win-back. When a real buyer lands on a lake where a
// churned agent used to pay to be listed, nudge them: the demand is real, their
// profile is still up, and reactivating puts them back in the rotation.
// Behaviour-triggered beats calendar win-back. Rate-limited upstream (30d).
function sendLeadLandedWinBack({ to, name, lakeName }) {
    if (!to) return { skipped: true };
    const first = name || 'there';
    const lake = lakeName || 'your lake';
    return sendEmail({
        emailClass: 'lifecycle',
        templateKey: 'lead_landed_win_back',
        to,
        category: 'marketing',
        subject: `A buyer just came through on ${lake}`,
        html: layout({
            title: `A buyer came through on ${lake}`,
            preheader: 'Your profile is still up — want it switched back on?',
            body: `
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  ${_esc(first)} — a new buyer just came through on <strong>${_esc(lake)}</strong> this week. Your profile is still live on the free tier, but paid members are the ones in the lead rotation for that water.
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2d3748;">
                  Want yours switched back on?
                </p>`,
            ctaText: 'Reactivate my plan',
            ctaUrl: `${SITE_URL}/join`,
        }),
    });
}

// AL-13 — exit survey. One free-text question on cancellation, written to look
// typed and personal (no template chrome, no CTA button), and set to reply
// straight back to the owner's inbox. The first fifty answers are the roadmap.
function sendAgentExitSurvey({ to, first_name }) {
    if (!to) return { skipped: true };
    const name = first_name || 'there';
    const owner = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || process.env.LEAD_NOTIFY_EMAIL || 'hburnside99@gmail.com';
    return sendEmail({
        emailClass: 'lifecycle',
        templateKey: 'agent_exit_survey',
        to,
        replyTo: owner,
        category: 'transactional',
        subject: 'one question',
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a202c;font-size:15px;line-height:1.65;">
            <p style="margin:0 0 14px;">Hi ${_esc(name)},</p>
            <p style="margin:0 0 14px;">I saw your MN Lake Homes subscription ended. No hard feelings at all — your profile stays live on the free tier.</p>
            <p style="margin:0 0 14px;">One question, and it genuinely helps me: <b>what would we have had to do for you to stay?</b></p>
            <p style="margin:0 0 14px;">Just hit reply — one line is plenty.</p>
            <p style="margin:0;">Thanks,<br>Hunter</p>
        </div>`,
    });
}

function sendAgentPaymentFailed({ to, name, attempt = 1, final = false, nextAttempt = null }) {
    if (!to) return { skipped: true };
    const first = (name || '').split(' ')[0] || 'there';
    const retryLine = nextAttempt
        ? `We'll automatically try your card again on <strong>${new Date(nextAttempt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</strong>.`
        : '';
    let subject, title, lead, closing;
    if (final) {
        subject = `Final notice — your MN Lake Homes profile is about to pause`;
        title = `${first}, we couldn't renew your membership.`;
        lead = `Stripe tried several times to renew your MN Lake Homes membership and the charge kept getting declined. This was the last automatic attempt. <strong>Unless you update your card, your profile will drop out of the lead rotation and lose featured placement.</strong>`;
        closing = `Everything on your profile is saved — updating your payment method restores your placement instantly.`;
    } else if (attempt <= 1) {
        subject = `Payment issue — please update your card`;
        title = `${first}, your last payment didn't go through.`;
        lead = `Stripe tried to renew your MN Lake Homes membership and the charge was declined. <strong>You're still live and receiving leads</strong> — this is just a heads-up so nothing gets interrupted. ${retryLine}`;
        closing = `It takes under a minute to fix from your dashboard.`;
    } else {
        subject = `⚠ Second attempt failed — update your card to keep your leads`;
        title = `${first}, we still can't renew your membership.`;
        lead = `Your renewal payment has now failed more than once. Your profile is still active for now, but if the next retries don't clear, you'll lose your spot in the lead rotation. ${retryLine}`;
        closing = `Update your payment method now to stay ahead of it.`;
    }
    return sendEmail({
        emailClass: 'transactional',
        templateKey: 'agent_payment_failed',
        to,
        subject,
        html: layout({
            title,
            preheader: `Update your billing info so your MN Lake Homes profile stays live.`,
            body: `
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">${lead}</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">
                  <strong>Fix it in under a minute</strong> — open your dashboard, go to Account &rarr; billing, and update your payment method in Stripe.
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#2d3748;">${closing} Replying to this email reaches us directly if you're stuck.</p>`,
            ctaText: 'Update payment method',
            ctaUrl: `${SITE_URL}/dashboard`,
        })
    });
}

// ─── Template registry (EM-23a) ──────────────────────────────────────────────
// The canonical list of every email this service can send, with its CAN-SPAM
// class. Mirrors the emailClass/templateKey pairs the send calls carry inline;
// the oversight slice joins this against email_log so a template with zero rows
// still shows up (a template that has never fired is exactly what you want to
// see). classGuard.test asserts this stays in sync with the call sites.
//   transactional — service email, exempt from suppression + cap
//   lifecycle     — commercial nudge, suppressible + capped
//   content_ask   — commercial ask, suppressible + capped
//   internal      — to the owner/admins, exempt
const EMAIL_TEMPLATES = [
    // class → the unsubscribe decision; audience → the disclosure block;
    // usage_grant → the media-rights line (only where the email asks for photos).
    { key: 'welcome',                         class: 'transactional', audience: 'consumer', label: 'Consumer welcome' },
    { key: 'agent_welcome',                   class: 'transactional', audience: 'agent',    label: 'Agent welcome' },
    { key: 'agent_profile_live',              class: 'transactional', audience: 'agent',    usage_grant: true, label: 'Agent profile live' },
    { key: 'agent_admin_notification',        class: 'internal',      audience: 'internal', label: 'Agent signup → admin' },
    { key: 'password_reset',                  class: 'transactional', audience: 'consumer', label: 'Password reset' },
    { key: 'admin_password_reset',            class: 'transactional', audience: 'internal', label: 'Admin password reset' },
    { key: 'lead_confirmation',               class: 'transactional', audience: 'consumer', label: 'Lead confirmation' },
    { key: 'admin_lead_notification',         class: 'internal',      audience: 'internal', label: 'Lead → admin' },
    { key: 'inquiry_notification',            class: 'internal',      audience: 'internal', label: 'Inquiry → admin' },
    { key: 'inquiry_confirmation',            class: 'transactional', audience: 'consumer', label: 'Inquiry confirmation' },
    { key: 'matched_agent_notification',      class: 'transactional', audience: 'agent',    label: 'Matched agent notification' },
    { key: 'agent_lead_assigned',             class: 'transactional', audience: 'agent',    label: 'Agent lead assigned' },
    { key: 'manual_lead_offer',               class: 'transactional', audience: 'agent',    label: 'Manual lead offer' },
    { key: 'lead_agent_matched',              class: 'transactional', audience: 'consumer', label: 'Lead → agent matched' },
    { key: 'lead_no_agent_yet',               class: 'transactional', audience: 'consumer', label: 'No agent on your lake yet' },
    { key: 'lead_reroute_buyer',              class: 'transactional', audience: 'consumer', label: 'Rerouting (buyer)' },
    { key: 'lead_reroute_agent',              class: 'transactional', audience: 'agent',    label: 'Rerouted (agent)' },
    { key: 'agent_response_nudge',            class: 'transactional', audience: 'agent',    label: 'Agent response nudge' },
    { key: 'buyer_feedback_72h',              class: 'transactional', audience: 'consumer', label: 'Did they reach out? (72h)' },
    { key: 'ladder_photos',                   class: 'content_ask',   audience: 'agent',    usage_grant: true,        label: 'Ladder 1 — photos' },
    { key: 'ladder_question',                 class: 'content_ask',   audience: 'agent',    usage_grant: true,        label: 'Ladder 2 — one question' },
    { key: 'ladder_featured',                 class: 'content_ask',   audience: 'agent',    usage_grant: 'headshot',  label: 'Ladder 4 — Featured Agent' },
    { key: 'agent_profile_nudge',             class: 'lifecycle',     audience: 'agent',    label: 'Agent profile nudge' },
    { key: 'agent_profile_enrichment_nudge',  class: 'lifecycle',     audience: 'agent',    label: 'Agent profile enrichment nudge' },
    { key: 'referral_reward',                 class: 'transactional', audience: 'agent',    label: 'Referral reward' },
    { key: 'agent_exit_survey',               class: 'lifecycle',     audience: 'agent',    label: 'Agent exit survey' },
    { key: 'lead_landed_win_back',            class: 'lifecycle',     audience: 'agent',    label: 'Lead win-back' },
    { key: 'agent_message_notification',      class: 'transactional', audience: 'agent',    label: 'Agent message notification' },
    { key: 'cash_offer_to_partner',           class: 'transactional', audience: 'business', label: 'Cash offer → partner' },
    { key: 'business_welcome',                class: 'transactional', audience: 'business', label: 'Business welcome' },
    { key: 'business_admin_notification',     class: 'internal',      audience: 'internal', label: 'Business signup → admin' },
    { key: 'business_payment_received',       class: 'transactional', audience: 'business', label: 'Business payment received' },
    { key: 'business_approved',               class: 'transactional', audience: 'business', label: 'Business approved' },
    { key: 'business_payment_failed',         class: 'transactional', audience: 'business', label: 'Business payment failed' },
    { key: 'agent_payment_failed',            class: 'transactional', audience: 'agent',    label: 'Agent payment failed' },
    { key: 'business_subscription_cancelled', class: 'transactional', audience: 'business', label: 'Business subscription cancelled' },
    { key: 'admin_subscription_cancelled',    class: 'internal',      audience: 'internal', label: 'Subscription cancelled → admin' },
    { key: 'agent_invite',                    class: 'transactional', audience: 'agent',    label: 'Agent invite' },
    { key: 'business_invite',                 class: 'transactional', audience: 'business', label: 'Business invite' },
    { key: 'incident_p1_alert',               class: 'internal',      audience: 'internal', label: 'P1 incident alert' },
    { key: 'incident_p2_digest',              class: 'internal',      audience: 'internal', label: 'P2 hourly digest' },
];

// Registry integrity audit — the load-bearing check behind both the CI test and
// the boot guard. Scans THIS file's source for every (templateKey, emailClass)
// pair the send calls carry, and confirms: (1) every call site is in the
// registry with a matching class, (2) every registry key has a call site, and
// (3) no `sendEmail({...})` branch is unclassified. #3 is the one that caught
// the fail-closed defect: a once-per-function classifier left a transactional
// tier-branch with no class, so a real send was silently suppressed. Fail-closed
// is correct, but a fail-closed TRANSACTIONAL email is worse than a sent one —
// this makes that pair honest. Pure function; returns { ok, problems: [] }.
function auditTemplateClassification() {
    const problems = [];
    let src = '';
    try { src = fs.readFileSync(__filename, 'utf8'); }
    catch (e) { return { ok: false, problems: [`could not read email.js source: ${e.message}`] }; }

    // (templateKey → emailClass) from the call sites, either object-key order.
    const call = new Map();
    const reA = /emailClass:\s*['"]([a-z_]+)['"][\s\S]{0,200}?templateKey:\s*['"]([a-z0-9_]+)['"]/g;
    const reB = /templateKey:\s*['"]([a-z0-9_]+)['"][\s\S]{0,200}?emailClass:\s*['"]([a-z_]+)['"]/g;
    let m;
    while ((m = reA.exec(src))) call.set(m[2], m[1]);
    while ((m = reB.exec(src))) if (!call.has(m[1])) call.set(m[1], m[2]);

    const reg = new Map(EMAIL_TEMPLATES.map(t => [t.key, t.class]));
    for (const [key, cls] of call) {
        if (!reg.has(key)) problems.push(`call site '${key}' (${cls}) missing from EMAIL_TEMPLATES`);
        else if (reg.get(key) !== cls) problems.push(`'${key}': call site class ${cls} != registry ${reg.get(key)}`);
    }
    for (const [key, cls] of reg) if (!call.has(key)) problems.push(`registry key '${key}' (${cls}) matches no send call site`);

    // (3) every sendEmail({...}) call classifies — literal or forwarded param.
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;                 // skip comments (this file talks about sendEmail)
        if (!/\bsendEmail\(\{/.test(lines[i]) || /async function sendEmail/.test(lines[i])) continue;
        const win = lines.slice(i, i + 8).join('\n');
        if (!/emailClass:\s*['"]/.test(win) && !/emailClass\s*[,}]/.test(win)) {
            problems.push(`sendEmail call at email.js:${i + 1} has NO emailClass — it will fail closed`);
        }
    }
    return { ok: problems.length === 0, problems };
}

// Boot guard for the classifier defect — CI catches it before merge, this
// catches it when someone adds a template branch on an 11pm hotfix. Loud ERROR
// naming each unclassified/mismatched branch; with EMAIL_STRICT_BOOT=1 it
// refuses to start. Runs here, after EMAIL_TEMPLATES is initialized.
{
    const _audit = auditTemplateClassification();
    if (!_audit.ok) {
        console.error(`[email] ✖ TEMPLATE CLASSIFICATION DEFECT (${_audit.problems.length}) — a fail-closed transactional email is worse than a sent one:`);
        _audit.problems.forEach(p => console.error(`[email]    · ${p}`));
        if (process.env.EMAIL_STRICT_BOOT === '1') {
            throw new Error(`email template classification failed: ${_audit.problems.join(' | ')}`);
        }
    }
}

module.exports = {
    sendEmail,
    EMAIL_TEMPLATES,
    auditTemplateClassification,
    htmlToText,
    footerHtml,
    verifyUnsub,
    sendWelcome,
    sendAgentWelcome,
    sendAgentProfileLive,
    sendAgentAdminNotification,
    sendPasswordReset,
    sendAdminPasswordReset,
    sendLeadConfirmation,
    sendAdminLeadNotification,
    sendInquiryNotification,
    sendInquiryConfirmation,
    sendMatchedAgentNotification,
    sendAgentLeadAssigned,
    sendManualLeadOffer,
    sendLeadAgentMatched,
    sendNoAgentYet,
    sendRerouteBuyer,
    sendRerouteAgent,
    sendAgentNudge,
    sendDidTheyReachOut,
    sendLadderPhotos,
    sendLadderQuestion,
    sendLadderFeatured,
    sendAgentProfileNudge,
    sendAgentProfileEnrichmentNudge,
    sendReferralRewardEmail,
    sendAgentExitSurvey,
    sendLeadLandedWinBack,
    mailerHealth,
    sendAgentMessageNotification,
    sendCashOfferToPartner,
    sendBusinessWelcome,
    sendBusinessAdminNotification,
    sendBusinessPaymentReceived,
    sendBusinessApproved,
    sendBusinessPaymentFailed,
    sendAgentPaymentFailed,
    sendBusinessSubscriptionCancelled,
    sendAdminSubscriptionCancelled,
    sendAgentInvite,
    sendBusinessInvite,
    sendIncidentAlert,
    sendIncidentDigest,
    sendCustom,
    layout,
};
