// Regression test for the boot-order guard (src/services/schema-guard.js).
//
// Context: notable_features/real_estate_context/faq were once ALTERed onto the
// `tags` table instead of `lakes`, so the lake-detail SSR SELECT threw "column
// does not exist" and every one of the 69 /lakes/* pages 500'd — while the
// process kept serving. assertCriticalSchema() now runs after migrations and
// before the port opens; if a required column is missing it exits(1) so the
// deploy fails and the last healthy version stays live.
//
// This test runs the REAL guard against an in-memory Postgres (pg-mem) so the
// actual information_schema query executes on a real SQL engine, and spawns a
// faithful copy of server.js's boot sequence to prove the port never opens on a
// broken schema. Framework-free: `node test/schema-guard.test.js` (or
// `npm run test:guard`). Exits non-zero if any assertion fails.
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { newDb } = require('pg-mem');
const { REQUIRED_COLUMNS, findMissingColumns, assertCriticalSchema } =
    require(path.join(__dirname, '..', 'src/services/schema-guard.js'));

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}`); if (!cond) failures++; };

function poolWith(columns) {
    const db = newDb();
    db.public.none(`CREATE TABLE lakes (id int, ${columns.map(c => c + ' text').join(', ')})`);
    return new (db.adapters.createPg().Pool)();
}

function probePort(port, timeout = 500) {
    return new Promise(resolve => {
        const sock = net.connect(port, '127.0.0.1');
        let done = false;
        const finish = r => { if (!done) { done = true; sock.destroy(); resolve(r); } };
        sock.on('connect', () => finish('OPEN'));
        sock.on('error', e => finish(e.code === 'ECONNREFUSED' ? 'REFUSED' : e.code));
        sock.setTimeout(timeout, () => finish('TIMEOUT'));
    });
}

function bootHarness(mode, port) {
    return new Promise(resolve => {
        const child = spawn('node', [path.join(__dirname, '_schema-guard-boot-harness.js')],
            { env: { ...process.env, MODE: mode, HARNESS_PORT: String(port) } });
        let out = '', err = '', exitCode = null;
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('exit', c => { exitCode = c; });
        setTimeout(async () => {
            const port_state = await probePort(port);
            child.kill('SIGKILL');
            resolve({ exitCode, listened: /LISTENING:/.test(out), port_state, fatal: (err.match(/FATAL:[^\n]*/) || [''])[0] });
        }, 900);
    });
}

(async () => {
    const ALL = REQUIRED_COLUMNS.lakes;

    // ---- Unit: the guard's decision, run on a real SQL engine ----
    console.log('Unit — findMissingColumns / assertCriticalSchema:');
    {
        const missing = await findMissingColumns(poolWith(ALL));
        check('healthy schema → no missing columns', missing.length === 0);

        let exited = null; const logs = [];
        await assertCriticalSchema(poolWith(ALL), { exit: c => exited = c, log: m => logs.push(m) });
        check('healthy schema → no exit, no log', exited === null && logs.length === 0);
    }
    {
        const missing = await findMissingColumns(poolWith(ALL.filter(c => c !== 'notable_features')));
        check('missing notable_features → flagged on lakes',
            missing.length === 1 && missing[0].table === 'lakes' && missing[0].missing.join() === 'notable_features');

        let exited = null; const logs = [];
        await assertCriticalSchema(poolWith(ALL.filter(c => c !== 'notable_features')), { exit: c => exited = c, log: m => logs.push(m) });
        check('missing column → exit(1) + FATAL naming the column',
            exited === 1 && logs.some(l => /FATAL/.test(l) && /notable_features/.test(l) && /Refusing to serve/.test(l)));
    }

    // ---- Integration: boot order — the port must not open on a broken schema ----
    console.log('\nIntegration — boot sequence (migrate → guard → listen):');
    const broken = await bootHarness('broken', 59711);
    const healthy = await bootHarness('healthy', 59712);
    check('broken schema → process exits 1', broken.exitCode === 1);
    check('broken schema → port never opened (TCP refused)', broken.listened === false && broken.port_state === 'REFUSED');
    check('broken schema → FATAL logged naming the column', /notable_features/.test(broken.fatal));
    check('healthy schema → boots and opens the port', healthy.listened === true && healthy.port_state === 'OPEN');

    console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('test error:', e); process.exit(2); });
