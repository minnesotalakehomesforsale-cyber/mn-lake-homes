# A/B Testing Hooks (T067)

Marketing can run experiments — CTA copy, form length, which partner block variant — **without a developer for each test**. The mechanism is one client helper, `window.mnlhExp`, defined in `components/components.js` (loaded on every public page).

## How it works

```js
var v = window.mnlhExp('hero_cta', [
  { key: 'a', weight: 1, label: 'Get matched with a lake agent — free' },
  { key: 'b', weight: 1, label: 'Find my lake home expert' }
]);
document.querySelector('#hero-cta').textContent = v.label;
```

- **Sticky:** a visitor is assigned one variant and keeps it (stored in `localStorage` as `mnlh_exp_<key>`), so their experience is consistent across pages and visits.
- **Weighted:** `weight` controls the split (e.g. `weight: 3` vs `weight: 1` = 75/25). Omit for even splits.
- **Measurable automatically:** the chosen variant is stamped into the attribution bag as `exp_<key>` and rides along on **every lead submission** — both fetch-based forms (via `window.mnAttribution()`) and classic `<form>` POSTs (a hidden `exp_<key>` field is injected). You can then segment conversions by variant in the leads table / HubSpot.
- **Returns the variant config object**, so you branch copy, layout, or form length off `v.<anything>`.

## Running a test

1. Pick an experiment `key` (lowercase, stable — it's the storage + attribution field name).
2. Define 2–4 variants with any config fields you need (`label`, `formFields`, `showPartners`, etc.).
3. Call `mnlhExp(key, variants)` where the element renders and apply the returned config.
4. Let it run; segment leads by the `exp_<key>` value to read the result.

## Examples

**Shorter vs longer form:**
```js
var v = window.mnlhExp('lead_form_len', [
  { key: 'short', weight: 1, fields: ['name','email'] },
  { key: 'long',  weight: 1, fields: ['name','email','phone','budget','timeline'] }
]);
renderForm(v.fields);
```

**Show/hide the partner block:**
```js
if (window.mnlhExp('lake_partners', [{key:'on',weight:1,show:true},{key:'off',weight:1,show:false}]).show) {
  document.querySelector('#partner-block').style.display = 'block';
}
```

## Ending a test / picking a winner
Remove the `mnlhExp` call and hard-code the winning variant. (Visitors' `localStorage` keys are harmless leftovers.) There's no server config to clean up — the variants live in page code, versioned in git.

## Notes
- Assignment uses `Math.random()` weighted by `weight`; it is not seeded per-user across devices (localStorage is per-browser). Good enough for conversion-rate tests; not for authenticated cross-device cohorts.
- Keep `key` stable once a test is live — changing it re-randomizes everyone.
