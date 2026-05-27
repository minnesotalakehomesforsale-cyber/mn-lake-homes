/**
 * admin-tabs.js — Canonical list of admin sidebar tabs.
 *
 * Mirrors the NAV array in components/admin-sidebar.js. Used by:
 *   - GET /api/admin/admin-tabs (powers the per-admin permission picker)
 *   - PATCH /api/admin/users/:id/permissions (validates incoming keys)
 *
 * Add a new tab in TWO places when you ship one:
 *   1. components/admin-sidebar.js   → NAV array (renders the link)
 *   2. this file                     → ADMIN_TABS (lets admins be granted it)
 *
 * The picker UI auto-shows every entry from this list, so the new tab
 * appears as a checkbox the next time you open an admin's profile.
 */

const ADMIN_TABS = [
    { key: 'dashboard',   label: 'Dashboard' },
    { key: 'agents',      label: 'Agents Directory' },
    { key: 'leads',       label: 'Central Leads' },
    { key: 'inquiries',   label: 'Inquiries' },
    { key: 'messages',    label: 'Messages' },
    { key: 'marketing',   label: 'Marketing' },
    { key: 'resources',   label: 'Resources' },
    { key: 'cash-offers', label: 'Cash Offers' },
    { key: 'users',       label: 'Users Management' },
    { key: 'tasks',       label: 'Tasks' },
    { key: 'lakes-towns', label: 'Lakes, Towns & Businesses' },
    { key: 'images',      label: 'Images' },
    { key: 'system',      label: 'Metrics & Database' },
];

const ADMIN_TAB_KEYS = new Set(ADMIN_TABS.map(t => t.key));

module.exports = { ADMIN_TABS, ADMIN_TAB_KEYS };
