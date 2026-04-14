# Authentication & Role-Based Access Control Architecture
**Status**: Phase 3 Locked
**Framework Context**: Express.js (Node) + PostgreSQL

## Central Authentication Flow
We are intentionally utilizing **Stateless JWT via HTTP-Only Secure Cookies**.
The `users.password_hash` column must be verified using `bcrypt` algorithms inside `auth.controller.js`. Upon successful validation, the system issues a short-lived JSON Web Token (JWT) encapsulating the user's `id` and `role`. 
By assigning this JWT into an `httpOnly` cookie, we absolutely immunize our frontend interface (React/Vanilla) from Cross-Site Scripting (XSS) attacks stealing credentials.

## Route Protection (The Middleware Matrix)
All protected API endpoints must utilize a dual-middleware architecture imported from `api/middleware/auth.middleware.js`:

1. `verifySession()`: Unlocks the cookie, verifies the cryptographic signature against the `JWT_SECRET`, and embeds the payload payload into the `req.user` object.
2. `requireRole(allowedRolesArray)`: Reads `req.user.role` strictly against the developer-defined array.

### Policy Enforcement Map

#### `super_admin` Operations
*Usage*: `requireRole(['super_admin'])`
- Only super_admins may `POST /api/agents` to formally assign standard `users` into operational agent profiles.
- Required to manipulate any rows in `memberships` or `system_settings`.
- Required to access raw `activity_log` tracking endpoints.

#### `admin` Operations
*Usage*: `requireRole(['super_admin', 'admin'])`
- Required for `PATCH /api/leads/assign` to move lead relationships freely.
- Required for `PATCH /api/agents/:id/status` to flip `profile_status` from `pending_review` to `published`.
- Can globally `GET` all leads and internal notes.

#### `agent` Operations
*Usage*: `requireRole(['super_admin', 'admin', 'agent'])`
- An agent may only execute `GET /api/leads` if a backend query filter is applied: `WHERE assigned_user_id = req.user.userId`.
- An agent may only `PATCH /api/agents/me` provided the data structurally connects to their embedded authentication token ID.

> **Security Note**: Never trust the frontend UI state to enforce row-level security. The middleware (`requireRole`) restricts structural table access, but your database queries must explicitly implement the `WHERE id = req.user.userId` bindings logically within the controllers to guarantee self-isolation for `agent` accounts.
