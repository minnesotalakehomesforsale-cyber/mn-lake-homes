// SEO audit — READ-ONLY. Lists which lakes & towns are lacking SEO.
// Buckets: INVISIBLE (404s Google — no hero / not published / no linked lake),
// and THIN (renders but weak content). Run: node seo-audit.js
const fs = require('fs'); const path = require('path'); const { Pool } = require('pg');
function envUrl(f){ try { const m = fs.readFileSync(path.join(process.cwd(),f),'utf8').match(/^DATABASE_URL\s*=\s*(.+)$/m); if(m) return m[1].trim().replace(/^["']|["']$/g,''); } catch(_){} return null; }
const url = envUrl(process.env.ENVFILE || '.env.production') || envUrl('.env.local');
if(!url){ console.error('No DATABASE_URL'); process.exit(1); }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const MIN_DESC = 300;   // chars of description considered "enough"

(async () => {
  try {
    // ── LAKES ──
    const lakes = (await pool.query(`
      SELECT slug, name, status,
        (COALESCE(hero_image_url,'') <> '')                                  AS has_hero,
        COALESCE(LENGTH(description),0)                                      AS desc_len,
        (COALESCE(seo_description,'') <> '')                                 AS has_seo_desc,
        (COALESCE(seo_title,'') <> '')                                       AS has_seo_title,
        (max_depth_ft IS NOT NULL OR surface_acres IS NOT NULL
           OR water_clarity_ft IS NOT NULL OR shoreline_miles IS NOT NULL)   AS has_data
      FROM lakes ORDER BY name`)).rows;

    const lakeInvisible = lakes.filter(l => l.status !== 'published' || !l.has_hero);
    const lakeThin = lakes.filter(l => l.status === 'published' && l.has_hero &&
        (l.desc_len < MIN_DESC || !l.has_seo_desc || !l.has_data));

    console.log(`\n================  LAKES  (${lakes.length} total)  ================`);
    console.log(`\n❌ INVISIBLE — 404 to Google (no hero image or not published): ${lakeInvisible.length}`);
    lakeInvisible.forEach(l => console.log(`   • ${l.name}  [${l.slug}]  ${l.status !== 'published' ? 'status=' + l.status : 'NO HERO IMAGE'}`));
    console.log(`\n⚠️  THIN — renders but weak content: ${lakeThin.length}`);
    lakeThin.forEach(l => console.log(`   • ${l.name}  [${l.slug}]  ${[l.desc_len < MIN_DESC ? `desc ${l.desc_len}c` : '', !l.has_seo_desc ? 'no seo_desc' : '', !l.has_data ? 'no lake data' : ''].filter(Boolean).join(' · ')}`));
    const lakeGood = lakes.length - lakeInvisible.length - lakeThin.length;
    console.log(`\n✅ Solid lakes: ${lakeGood}`);

    // ── TOWNS (tags) ──
    const towns = (await pool.query(`
      SELECT t.slug, t.name, t.active,
        (COALESCE(t.hero_image_url,'') <> '')          AS has_hero,
        COALESCE(LENGTH(t.description),0)              AS desc_len,
        (COALESCE(t.seo_description,'') <> '')          AS has_seo_desc,
        (COALESCE(t.seo_title,'') <> '')                AS has_seo_title,
        EXISTS (SELECT 1 FROM lake_tags lt JOIN lakes l ON l.id = lt.lake_id
                 WHERE lt.tag_id = t.id AND l.status = 'published') AS has_linked_lake
      FROM tags t ORDER BY t.name`)).rows;

    const townInvisible = towns.filter(t => !t.active || !t.has_hero || !t.has_linked_lake);
    const townThin = towns.filter(t => t.active && t.has_hero && t.has_linked_lake &&
        (t.desc_len < MIN_DESC || !t.has_seo_desc));

    console.log(`\n================  TOWNS / GEO TAGS  (${towns.length} total)  ================`);
    console.log(`\n❌ INVISIBLE — 404 to Google (no hero, inactive, or no published lake linked): ${townInvisible.length}`);
    townInvisible.forEach(t => console.log(`   • ${t.name}  [${t.slug}]  ${!t.active ? 'inactive' : !t.has_hero ? 'NO HERO IMAGE' : 'no published lake linked'}`));
    console.log(`\n⚠️  THIN — renders but weak content: ${townThin.length}`);
    townThin.forEach(t => console.log(`   • ${t.name}  [${t.slug}]  ${[t.desc_len < MIN_DESC ? `desc ${t.desc_len}c` : '', !t.has_seo_desc ? 'no seo_desc' : ''].filter(Boolean).join(' · ')}`));
    console.log(`\n✅ Solid towns: ${towns.length - townInvisible.length - townThin.length}`);

    console.log(`\n────────────────────────────────────────────────────`);
    console.log(`FIX ORDER: 1) hero images for INVISIBLE pages (instant indexability),`);
    console.log(`           2) seo_description + description for THIN pages,`);
    console.log(`           3) lake data (depth/acres/clarity) to enrich lake pages.`);
    await pool.end();
  } catch (e) { console.error('Error:', e.message); try { await pool.end(); } catch(_){} process.exit(1); }
})();
