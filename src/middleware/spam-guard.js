// ─── Lead-form spam guard ───────────────────────────────────────────────────
// Three cheap, layered bot filters that need no third-party service:
//   1) Honeypot — a hidden field ("company_website") real users never see or
//      fill; bots that auto-fill every input trip it.
//   2) Timing — the client reports elapsed ms since the form opened; a genuine
//      multi-step lead form takes many seconds, so sub-2s submits are bots.
//   3) Cloudflare Turnstile (OPTIONAL) — verified only when TURNSTILE_SECRET is
//      set AND the client sends a token; otherwise skipped, so this is a no-op
//      until you choose to enable it.
//
// On a bot hit we return a generic 200 "success" (a silent drop): the bot thinks
// it worked and moves on, while nothing is written and no agent is bothered.

const MIN_ELAPSED_MS = 2000;

async function verifyTurnstile(token, ip) {
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret) return true;               // not configured → skip
    if (!token) return false;               // configured but no token → fail
    try {
        const body = new URLSearchParams({ secret, response: token });
        if (ip) body.set('remoteip', ip);
        const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        const d = await r.json();
        return !!d.success;
    } catch (_) {
        return true;   // don't block real users if Cloudflare is unreachable
    }
}

// Express middleware for public lead submission. Silently drops obvious bots.
async function leadSpamGuard(req, res, next) {
    const b = req.body || {};

    // 1) Honeypot — must be empty.
    if (b.company_website && String(b.company_website).trim() !== '') {
        console.warn('[spam-guard] honeypot tripped');
        return res.status(200).json({ success: true, id: null });   // silent drop
    }

    // 2) Timing — implausibly fast submissions are bots. Only enforced when the
    //    client actually reports elapsed time (older clients omit it).
    const elapsed = Number(b._elapsed_ms);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_ELAPSED_MS) {
        console.warn('[spam-guard] too-fast submit:', elapsed + 'ms');
        return res.status(200).json({ success: true, id: null });   // silent drop
    }

    // 3) Turnstile (optional) — real block (not silent) so a legit user can retry.
    const { clientIp } = require('./rate-limit');
    const ok = await verifyTurnstile(b.turnstile_token, clientIp(req));
    if (!ok) {
        return res.status(400).json({ error: 'Please complete the verification and try again.' });
    }

    // Strip guard-only fields so they never reach the DB / notes dump.
    delete b.company_website; delete b._elapsed_ms; delete b.turnstile_token;
    next();
}

module.exports = { leadSpamGuard, verifyTurnstile };
