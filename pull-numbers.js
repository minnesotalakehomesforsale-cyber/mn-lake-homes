// READ-ONLY. Pulls real business baseline for the roadmap sheet.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Prefer production; fall back to local.
function readEnv(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const m = txt.match(/^DATABASE_URL\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  return null;
}
const root = process.cwd();
const url = readEnv(path.join(root, '.env.production')) || readEnv(path.join(root, '.env.local'));
if (!url) { console.error('No DATABASE_URL found'); process.exit(1); }
console.log('DB host:', (url.match(/@([^:/]+)/) || [])[1] || '(unknown)');

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function q(label, sql) {
  try { const r = await pool.query(sql); console.log('\n=== ' + label + ' ==='); console.table(r.rows); }
  catch (e) { console.log('\n=== ' + label + ' ===\n  (skipped: ' + e.message + ')'); }
}

(async () => {
  // Founder seat economics per lake (the real, variable prices)
  await q('FOUNDER SEAT ECONOMICS (all published lakes)', `
    SELECT
      COUNT(*) AS lakes,
      COUNT(founder_seat_price) AS priced_manually,
      COUNT(founder_seat_ai_value) FILTER (WHERE founder_seat_price IS NULL) AS priced_by_ai_only,
      SUM(GREATEST(249, LEAST(5000, COALESCE(founder_seat_price, founder_seat_ai_value, 249))))::int AS total_monthly_tam,
      MIN(GREATEST(249, LEAST(5000, COALESCE(founder_seat_price, founder_seat_ai_value, 249))))::int AS min_seat,
      ROUND(AVG(GREATEST(249, LEAST(5000, COALESCE(founder_seat_price, founder_seat_ai_value, 249)))))::int AS avg_seat,
      MAX(GREATEST(249, LEAST(5000, COALESCE(founder_seat_price, founder_seat_ai_value, 249))))::int AS max_seat
    FROM lakes`);

  await q('TOP 20 LAKES BY FOUNDER SEAT VALUE', `
    SELECT name,
      founder_seat_price AS manual,
      founder_seat_ai_value AS ai_value,
      GREATEST(249, LEAST(5000, COALESCE(founder_seat_price, founder_seat_ai_value, 249)))::int AS effective_monthly
    FROM lakes
    ORDER BY GREATEST(249, LEAST(5000, COALESCE(founder_seat_price, founder_seat_ai_value, 249))) DESC
    LIMIT 20`);

  await q('SEAT PRICE DISTRIBUTION (buckets)', `
    SELECT bucket, COUNT(*) AS lakes FROM (
      SELECT CASE
        WHEN eff < 500  THEN 'a: 249-499'
        WHEN eff < 1000 THEN 'b: 500-999'
        WHEN eff < 2000 THEN 'c: 1000-1999'
        WHEN eff < 3500 THEN 'd: 2000-3499'
        ELSE 'e: 3500-5000' END AS bucket
      FROM (SELECT GREATEST(249, LEAST(5000, COALESCE(founder_seat_price, founder_seat_ai_value, 249))) AS eff FROM lakes) x
    ) y GROUP BY bucket ORDER BY bucket`);

  // Agents baseline
  await q('AGENTS TOTAL', `SELECT COUNT(*) AS agents, COUNT(*) FILTER (WHERE is_active) AS active FROM agents`);
  await q('AGENTS BY MEMBERSHIP', `
    SELECT COALESCE(membership_tier, membership, 'none') AS tier, COUNT(*) AS n
    FROM agents GROUP BY 1 ORDER BY 2 DESC`);
  await q('FOUNDER SEATS CLAIMED', `SELECT COUNT(*) AS founder_seats_taken FROM agent_lakes WHERE is_founder = true`);

  // Leads baseline
  await q('LEADS TOTAL + LAST 30 DAYS', `
    SELECT COUNT(*) AS all_time,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30d
    FROM leads`);
  await q('LEADS BY SOURCE (last 90d)', `
    SELECT source, COUNT(*) AS n FROM leads
    WHERE created_at > NOW() - INTERVAL '90 days'
    GROUP BY source ORDER BY n DESC`);

  await pool.end();
})();
