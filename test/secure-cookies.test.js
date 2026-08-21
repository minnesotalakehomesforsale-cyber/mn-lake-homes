// SEC-05 gate: the auth-cookie Secure flag must be ON in every deployed
// environment and OFF only in local dev.
//
// The bug this guards: `secure` was gated on NODE_ENV === 'production', but the
// production Render service runs NODE_ENV=staging, so auth-session cookies were
// set WITHOUT Secure in prod. The flag now comes from src/config/security.js,
// which is true for any non-local NODE_ENV. Run: `node test/secure-cookies.test.js`.
const path = require('path');
let failures = 0;
const check = (n, c) => { console.log(`${c ? '✓ PASS' : '✗ FAIL'}  ${n}`); if (!c) failures++; };
const MOD = require.resolve(path.join(__dirname, '..', 'src/config/security.js'));

function secureFor(env) {
    const prev = process.env.NODE_ENV;
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    delete require.cache[MOD];
    const { SECURE_COOKIES } = require(MOD);
    if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
    return SECURE_COOKIES;
}

check('production → Secure', secureFor('production') === true);
check("staging → Secure  (the SEC-05 bug: this used to be false)", secureFor('staging') === true);
check('preview → Secure', secureFor('preview') === true);
check('local → not Secure', secureFor('local') === false);
check('development → not Secure', secureFor('development') === false);
check('test → not Secure', secureFor('test') === false);
check('unset (local dev) → not Secure', secureFor(undefined) === false);

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
