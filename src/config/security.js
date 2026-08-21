// Centralized security-flag resolution (SEC-05).
//
// Cookie `secure` used to be gated on `process.env.NODE_ENV === 'production'`.
// The production Render service runs with NODE_ENV=staging, so that check
// resolved FALSE and auth-session cookies were being set WITHOUT the Secure
// flag in production — a JWT that a network attacker could capture over any
// plaintext hop. Security must not hinge on a single env string matching
// 'production'.
//
// SECURE_COOKIES is true in every DEPLOYED environment (NODE_ENV set to any
// non-local value: staging, production, preview) and false only in local dev,
// where NODE_ENV is unset and the app is served over http://localhost. Since
// every deployed environment is HTTPS-only, Secure is always correct there.
const env = process.env.NODE_ENV;
const LOCAL_ENVS = new Set(['local', 'development', 'test']);

const SECURE_COOKIES = !!env && !LOCAL_ENVS.has(env);

module.exports = { SECURE_COOKIES };
