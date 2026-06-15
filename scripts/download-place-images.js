#!/usr/bin/env node
/**
 * download-place-images.js — fetch every Wikimedia photo listed in
 * src/data/place-images.json and self-host under
 * /assets/images/lakes/<slug>.jpg and /assets/images/towns/<slug>.jpg.
 *
 *     node scripts/download-place-images.js
 *
 * Wikimedia returns 403 without an HTTP User-Agent, so we set one. Re-
 * running is safe — files that already exist are skipped (force-redownload
 * with --force). No DB writes here; pair with apply-place-images.js.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const DATA = require('../src/data/place-images.json');
const FORCE = process.argv.includes('--force');

// Wikimedia's bot policy expects a User-Agent that identifies the tool
// and a contact URL. Generic libcurl/Node UAs get 403'd.
const USER_AGENT = 'MNLakeHomesImageFetcher/1.0 (https://minnesotalakehomesforsale.com; admin@minnesotalakehomesforsale.com)';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function downloadOnce(url, destPath) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'image/*,*/*;q=0.8',
            },
        }, (res) => {
            // Follow redirects (Wikimedia sometimes 30x's to a thumb host).
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return downloadOnce(res.headers.location, destPath).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                const err = new Error(`HTTP ${res.statusCode} on ${url}`);
                err.status = res.statusCode;
                return reject(err);
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve(destPath)));
            file.on('error', (err) => { fs.unlink(destPath, () => reject(err)); });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    });
}

// Wikimedia 429s aggressively. Throttle + exponential backoff per request.
async function downloadWithRetry(url, destPath, attempt = 1) {
    try {
        return await downloadOnce(url, destPath);
    } catch (err) {
        if (err.status === 429 && attempt <= 5) {
            const wait = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s, 16s, 32s
            console.log(`    rate-limited (429), waiting ${wait/1000}s before retry ${attempt}/5…`);
            await sleep(wait);
            return downloadWithRetry(url, destPath, attempt + 1);
        }
        throw err;
    }
}

async function downloadAll(kind, items) {
    const outDir = path.join(ROOT, 'assets', 'images', kind);
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`\n── ${kind} (${items.length}) ──`);
    let ok = 0, skip = 0, fail = 0;
    for (const it of items) {
        const dest = path.join(outDir, `${it.slug}.jpg`);
        const rel  = path.relative(ROOT, dest);
        if (!FORCE && fs.existsSync(dest)) {
            console.log(`  - skip   ${rel}  (already exists)`);
            skip++;
            continue;
        }
        try {
            await downloadWithRetry(it.source_url, dest);
            const sizeKB = Math.round(fs.statSync(dest).size / 1024);
            console.log(`  ✓ saved  ${rel}  (${sizeKB} KB)`);
            ok++;
            // Throttle to stay under Wikimedia's per-IP rate limit.
            await sleep(1500);
        } catch (err) {
            console.log(`  ✗ FAIL   ${rel}  — ${err.message}`);
            fail++;
        }
    }
    return { ok, skip, fail };
}

async function main() {
    console.log(`=== download-place-images${FORCE ? ' (force)' : ''} ===`);
    const lakes = await downloadAll('lakes', DATA.lakes);
    const towns = await downloadAll('towns', DATA.towns);
    console.log(`\n── summary ──`);
    console.log(`  lakes : ${lakes.ok} saved, ${lakes.skip} skipped, ${lakes.fail} failed`);
    console.log(`  towns : ${towns.ok} saved, ${towns.skip} skipped, ${towns.fail} failed`);
    if (lakes.fail + towns.fail > 0) {
        console.error(`\nSome downloads failed. Re-run after diagnosing.`);
        process.exit(1);
    }
    console.log(`\nDone. Files are in assets/images/lakes/ and assets/images/towns/.`);
}

main().catch((err) => {
    console.error('download-place-images FAILED:', err);
    process.exit(1);
});
