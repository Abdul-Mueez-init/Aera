# Phase F1 — Database Access Boundary Decision

## Decision: Backend-Only Database Access

### Choice
**Backend-only database access model selected**

### Rationale

1. **Existing Architecture Alignment**: The Aera project already implements a comprehensive backend API with:
   - JWT-based authentication and refresh token rotation
   - Role-based authorization middleware
   - Company-level tenancy enforcement
   - Validated request/response schemas

2. **Security Consistency**: Backend-only access provides:
   - Single, well-defined authorization boundary
   - Centralized policy enforcement
   - Easier security auditing and compliance
   - No risk of client-side policy bypass

3. **Operational Benefits**:
   - Simplified deployment and monitoring
   - Consistent error handling and logging
   - Easier to implement rate limiting and request validation
   - Better control over API versioning

4. **Complexity Management**:
   - Avoids maintaining dual authorization layers (API + RLS)
   - Reduces testing surface area
   - Eliminates policy synchronization complexity

### Implementation

#### Database Configuration
- **Public Tables**: 24 tables remain public but will be accessed exclusively via backend service key
- **RLS Policies**: Current policies (if any) will be reviewed and simplified to enforce backend-only access
- **Service Key**: Backend uses Supabase service role key for elevated database operations
- **Client Access**: No direct Supabase client access from Flutter app

#### Security Model
```
Flutter App
    ↓ (HTTPS + JWT)
Backend API (Express/TypeScript)
    ↓ (Service Role Key)
Supabase PostgreSQL
```

#### Authorization Layers
1. **Flutter → Backend**: JWT access tokens with role claims
2. **Backend → Database**: Service role key with company-level filtering
3. **Tenancy Enforcement**: Backend middleware injects `company_id` filters on all queries

### Current RLS Status

The following tables have RLS enabled but no policies (confirmed from migration files):
- `company_counters` (migration 20260925000000)
- `device_tokens` (migration 20260914050000)  
- `ai_conversations` (migration 20260921090000)
- `ai_messages` (migration 20260921090000)
- `notifications` (migration 20260913090000)

This is acceptable for backend-only access because:
- Backend uses Supabase service role key which bypasses RLS
- No direct client access to database is permitted
- RLS being enabled without policies does not create security vulnerabilities in backend-only model
- Future migration to client access would require adding policies

### Acceptance Criteria

✅ **Database access boundary documented**: This document defines backend-only model

✅ **No client bypass of authorization**: 
- Flutter app has no Supabase client credentials
- All database operations flow through backend API
- Service role key is server-side only
- Flutter only uses backend API endpoints, never direct database access

✅ **RLS policies appropriate for backend-only**:
- RLS enabled but no policies is acceptable for backend-only access
- Service role key bypasses RLS for backend operations
- No direct client access policies needed
- Simpler architecture reduces attack surface

✅ **Supabase client usage verified**:
- Flutter app uses backend API exclusively for all data operations
- Photo uploads use signed URLs from backend (supabase-storage.adapter.ts)
- No Supabase client SDK initialization in Flutter code
- Storage access is mediated through backend-generated signed URLs

### Next Steps

1. Document storage and provider configuration requirements (F3)
2. Review unindexed foreign keys (F2) - separate task
3. Ensure service role key is properly secured in backend environment variables

### Risk Mitigation

- **Single Point of Failure**: Backend API is critical - implement proper monitoring and failover
- **Service Key Compromise**: Rotate service key regularly, limit permissions, monitor usage
- **Performance**: Backend adds latency - implement caching where appropriate
- **Complexity**: Backend code quality is critical - maintain test coverage and code review

## Conclusion

The backend-only database access model aligns with the existing Aera architecture, provides stronger security guarantees, and reduces operational complexity. This decision will be implemented in subsequent phase F tasks.
