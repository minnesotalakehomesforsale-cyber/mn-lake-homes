/**
 * agent-profile-completeness.js — READ-ONLY report.
 * For every agent, checks which profile fields are filled (the same set the
 * agent edits: base fields + FAQ + the profile_extra sections), and prints:
 *   • how many agents have EVERY field complete
 *   • the completeness distribution
 *   • which fields are most-often missing (drives the profile-update flow)
 *   • a per-agent table (most complete first)
 *
 * Read-only — no writes, no guard. Run: node scripts/agent-profile-completeness.js
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

const asArr = (v) => Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();
const asObj = (v) => (v && typeof v === 'object') ? v : (() => { try { return JSON.parse(v || '{}'); } catch { return {}; } })();
const nonEmpty = (s) => !!(s && String(s).trim());

// The full field set an agent can complete. Keep in sync with the profile editor.
const CHECKS = [
    ['photo',           a => nonEmpty(a.profile_photo_url)],
    ['bio',             a => nonEmpty(a.bio) && a.bio.trim().length >= 60],
    ['brokerage',       a => nonEmpty(a.brokerage_name)],
    ['license',         a => nonEmpty(a.license_number)],
    ['phone',           a => nonEmpty(a.phone_public)],
    ['years_exp',       a => a.years_experience != null && String(a.years_experience) !== ''],
    ['service_areas',   a => asArr(a.service_areas).length > 0],
    ['specialties',     a => asArr(a.specialties).length > 0],
    ['faq (all 5)',     a => Object.keys(asObj(a.faq)).length >= 5],
    ['stats',           a => Object.keys(asObj(a.profile_extra).stats || {}).length > 0],
    ['services_buyer',  a => (asObj(a.profile_extra).services_buyer  || []).length > 0],
    ['services_seller', a => (asObj(a.profile_extra).services_seller || []).length > 0],
    ['how_i_work',      a => (asObj(a.profile_extra).how_i_work || []).length > 0],
    ['credentials',     a => (asObj(a.profile_extra).credentials || []).length > 0],
    ['awards',          a => (asObj(a.profile_extra).awards || []).length > 0],
];
const N = CHECKS.length;

async function main() {
    const { rows } = await pool.query(`
        SELECT a.id, a.display_name, a.slug, a.is_published, a.profile_status,
               a.bio, a.profile_photo_url, a.brokerage_name, a.license_number,
               a.years_experience, a.phone_public, a.service_areas, a.specialties,
               a.faq, a.profile_extra
        FROM agents a JOIN users u ON u.id = a.user_id
        WHERE u.deleted_at IS NULL
        ORDER BY a.display_name`);

    const missingCount = {}; CHECKS.forEach(([k]) => missingCount[k] = 0);
    const perAgent = [];
    const complete = [];
    for (const a of rows) {
        const missing = CHECKS.filter(([, fn]) => !fn(a)).map(([k]) => k);
        missing.forEach(k => missingCount[k]++);
        const pct = Math.round((N - missing.length) / N * 100);
        perAgent.push({ name: a.display_name || a.slug, pct, done: N - missing.length, missing, published: a.is_published });
        if (missing.length === 0) complete.push(a.display_name || a.slug);
    }

    console.log(`\n════════ AGENT PROFILE COMPLETENESS — ${rows.length} agents, ${N} fields each ════════`);
    console.log(`\n✅ Completed EVERY field: ${complete.length}` + (complete.length ? `  →  ${complete.join(', ')}` : '  (none)'));

    // Distribution
    const buckets = { '100%': 0, '75-99%': 0, '50-74%': 0, '25-49%': 0, '0-24%': 0 };
    perAgent.forEach(p => {
        if (p.pct === 100) buckets['100%']++;
        else if (p.pct >= 75) buckets['75-99%']++;
        else if (p.pct >= 50) buckets['50-74%']++;
        else if (p.pct >= 25) buckets['25-49%']++;
        else buckets['0-24%']++;
    });
    console.log('\nDistribution:');
    Object.entries(buckets).forEach(([k, v]) => console.log(`  ${k.padEnd(8)} ${v} agent(s)`));

    console.log('\nMost-missing fields (what the flow should nudge on):');
    Object.entries(missingCount).sort((a, b) => b[1] - a[1])
        .forEach(([k, n]) => console.log(`  ${k.padEnd(16)} missing on ${n}/${rows.length}`));

    console.log('\nPer agent (most complete first):');
    perAgent.sort((a, b) => b.pct - a.pct).forEach(p =>
        console.log(`  ${String(p.pct + '%').padStart(4)}  ${p.name.padEnd(26)} ${p.published ? '' : '(unpublished) '}missing: ${p.missing.join(', ') || 'nothing 🎉'}`));
    console.log('');
    await pool.end();
}

main().catch(err => { console.error('[agent-profile-completeness]', err.message); process.exit(1); });
