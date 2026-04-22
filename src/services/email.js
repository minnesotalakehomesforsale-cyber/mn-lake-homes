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

module.exports = {
    sendEmail,
    sendWelcome,
    sendAgentWelcome,
    sendPasswordReset,
    sendLeadConfirmation,
    sendContactConfirmation,
    sendAdminLeadNotification,
    sendInquiryNotification,
    sendInquiryConfirmation,
    sendMatchedAgentNotification,
    sendBusinessWelcome,
    sendBusinessAdminNotification,
    sendBusinessPaymentReceived,
    sendBusinessApproved,
    sendBusinessPaymentFailed,
    sendBusinessSubscriptionCancelled,
    sendCustom,
    layout,
};
