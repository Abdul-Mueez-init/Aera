# Supabase RLS Decision Document

**Date:** 2026-10-09
**Phase:** Phase 3 — Access Control, Tenant Boundaries, and Privacy

---

## Current Architecture

The Aera application uses a **server-mediated architecture**:

```
Flutter App → REST API (Node.js/Express) → Prisma ORM → PostgreSQL (Supabase)
```

Key characteristics:
- **No direct Supabase client access** from Flutter or any client
- **Backend uses service role credentials** (`SUPABASE_SERVICE_ROLE_KEY`) for all database operations
- **Authorization is enforced at the API layer** (JWT + RBAC + object-level checks)
- **All tenant scoping is application-level** (every query includes `companyId` filter)

---

## Current Supabase Configuration

### Database Access
- **Public tables:** 28
- **RLS enabled:** 5 tables (`ai_conversations`, `ai_messages`, `company_counters`, `device_tokens`, `notifications`)
- **RLS policies:** 0 (no policies defined even on RLS-enabled tables)
- **Direct anon/authenticated access:** None demonstrated by audit

### Storage
- **Bucket:** `job-photos`
- **Access:** Private
- **RLS:** Enabled (no policies)
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`
- **Max size:** 10 MB

---

## Decision: No RLS Policies Required at This Time

### Rationale

1. **Server-Mediated Architecture**
   - All database access goes through the backend API
   - Flutter app never connects directly to Supabase
   - Service role credentials are server-side only (never exposed to clients)

2. **Authorization Boundary is API Layer**
   - JWT authentication with role-based access control
   - Object-level authorization checks in all services
   - Every query is explicitly scoped by `companyId`
   - No direct SQL or unvalidated client queries

3. **Audit Findings**
   - No direct `anon`/`authenticated` table privileges found
   - No public-table exposure demonstrated
   - Current service role grants are appropriately scoped
   - The audit explicitly states: "the API's authorization remains the operative access boundary"

4. **Defense-in Depth Consideration**
   - While RLS would provide an additional database-level defense, it is not currently necessary
   - The current architecture provides sufficient isolation through:
     - Network boundary (API is the only entry point)
     - Authentication boundary (JWT validation)
     - Authorization boundary (RBAC + object-level checks)
     - Application-level tenant scoping (all queries filtered by `companyId`)

5. **Maintenance Overhead**
   - Adding RLS policies would require:
     - Writing and maintaining policies for all 28 tables
     - Testing policies under `anon` and `authenticated` roles
     - Ensuring policies align with application-level authorization logic
     - Additional complexity in migration and schema changes
   - This overhead is not justified given the current server-mediated architecture

---

## When to Add RLS

RLS policies should be added **if and when** the architecture changes to include:

1. **Direct Supabase Client Access**
   - Flutter app connects directly to Supabase using `@supabase/supabase-js`
   - Client-side Supabase Auth for authentication
   - Client-side data fetching bypassing the API

2. **Multiple Access Paths**
   - Backend API continues to exist (for complex operations)
   - Additional direct Supabase access for simpler read operations
   - Need to ensure both paths enforce the same authorization rules

3. **Edge Functions or Serverless Functions**
   - Supabase Edge Functions with direct database access
   - Need to enforce tenant isolation at the database level

---

## Current Security Model Remains Valid

The current security model provides strong tenant isolation:

### Network Layer
- API is the only entry point to the database
- Service role credentials never leave the server
- No direct database access from clients

### Authentication Layer
- JWT-based authentication with short-lived access tokens
- Server-controlled refresh sessions with rotation
- All requests validated at the API boundary

### Authorization Layer
- RBAC: OWNER, DISPATCHER, TECHNICIAN roles
- Object-level authorization on every tenant resource
- Every query explicitly scoped by `companyId`

### Application Layer
- All services enforce tenant scoping
- No trusted client-supplied `companyId` values
- Comprehensive authorization policies per module

---

## Documentation Update

Update `docs/architecture.md` to document this decision:

```markdown
## Supabase Access Model

The backend uses Supabase as a managed PostgreSQL provider with the following access model:

- **No direct client access:** Flutter app and all clients access data through the REST API only
- **Service role credentials:** Backend uses `SUPABASE_SERVICE_ROLE_KEY` for all database operations
- **Server-mediated authorization:** All authorization is enforced at the API layer (JWT + RBAC + object-level checks)
- **Tenant scoping:** Every query is explicitly scoped by `companyId` at the application level
- **RLS status:** Row-Level Security is not currently enabled because there is no direct client access to the database
- **Future consideration:** RLS policies should be added if the architecture changes to include direct Supabase client access
```

---

## Conclusion

**Decision:** Do not add RLS policies at this time.

**Justification:** The current server-mediated architecture with API-layer authorization provides sufficient tenant isolation without the additional complexity of database-level RLS policies.

**Trigger for Revisit:** Any architectural change that introduces direct Supabase client access from Flutter or other clients.

**Current Status:** ✅ Secure (no action required)
