# Phase H2 Plan — Sales-ready Pilot Features

## Overview

Phase H2 (Phase 13) adds sales-ready pilot features to prepare the application for customer deployments. This phase is optional but critical for commercial pilots.

**Status:** � Ready to Start
**Current Test Status:** 363 passing, 2 skipped, 0 failing
**Priority:** Maintain test stability while adding new features

---

## Features to Implement

### 1. Custom Company Branding
- Allow companies to customize logo, colors, and branding
- Store branding configuration per company
- Apply branding to Flutter app dynamically
- Support default branding for new companies

### 2. Plan/Feature Flags
- Define plan tiers (e.g., Basic, Pro, Enterprise)
- Implement feature flag system
- Flag specific features by plan
- Company plan assignment
- API endpoint for plan management

### 3. Persistent Onboarding Checklist
- Track onboarding progress per company
- Define onboarding steps (setup checklist)
- Persist checklist state in database
- Display checklist in dashboard
- Mark steps as complete

### 4. Export/Reporting
- Export jobs to CSV
- Export invoices to CSV
- Generate revenue reports
- Date range filtering
- Company-scoped exports

### 5. Support/Contact Flow
- Support ticket creation
- Ticket status tracking
- Ticket assignment to support team
- Customer notification on ticket updates
- Support dashboard for administrators

### 6. Customer-specific Deployment Configuration
- Environment-specific configuration per company
- Database schema customizations (if needed)
- Company-specific feature toggles
- Deployment documentation per customer

---

## Implementation Strategy

To maintain test stability and avoid breaking existing functionality, we'll implement features in **slices** with the following approach:

### Slice Approach
1. **Database schema changes only** (migrations)
2. **Backend API endpoints** (with tests)
3. **Flutter UI integration** (if applicable)
4. **Documentation updates**

### Testing Strategy
- Run full test suite after each slice
- Add new tests for each feature
- Ensure no regressions in existing tests
- Use feature flags to gate new functionality

---

## Proposed Slices

### Slice H2.1: Plan/Feature Flags System (Foundation)
**Rationale:** This is foundational infrastructure that other features depend on.

**Deliverables:**
- Database schema for plans and feature flags
- Backend API for plan management
- Feature flag middleware
- Tests for plan assignment and flag checking
- Documentation for adding new flags

**Exit Criteria:**
- Can create/assign plans to companies
- Feature flags correctly gate functionality
- All existing tests still pass

---

### Slice H2.2: Persistent Onboarding Checklist
**Rationale:** Low-risk feature that adds new tables without modifying existing logic.

**Deliverables:**
- Database schema for onboarding checklist
- Backend API for checklist CRUD
- Company-specific checklist state
- Tests for checklist operations
- Flutter UI for displaying checklist

**Exit Criteria:**
- Checklist persists correctly
- UI displays checklist state
- All existing tests still pass

---

### Slice H2.3: Custom Company Branding
**Rationale:** Adds branding storage and retrieval without modifying core business logic.

**Deliverables:**
- Database schema for company branding
- Backend API for branding CRUD
- Branding validation (image formats, color formats)
- Flutter integration to apply branding
- Default branding configuration
- Tests for branding operations

**Exit Criteria:**
- Companies can upload/modify branding
- Flutter app applies branding correctly
- All existing tests still pass

---

### Slice H2.4: Export/Reporting
**Rationale:** New read-only functionality that doesn't modify existing data flows.

**Deliverables:**
- CSV export utilities
- Backend API endpoints for exports
- Revenue report generation
- Date range filtering
- Tests for export functionality
- Flutter UI for triggering exports

**Exit Criteria:**
- Can export jobs and invoices
- Revenue reports generate correctly
- All existing tests still pass

---

### Slice H2.5: Support/Contact Flow
**Rationale:** New independent feature module.

**Deliverables:**
- Database schema for support tickets
- Backend API for ticket management
- Ticket status workflow
- Notification hooks for ticket updates
- Tests for ticket operations
- Flutter UI for creating/viewing tickets
- Support dashboard for admins

**Exit Criteria:**
- Support tickets can be created and tracked
- Notifications work correctly
- All existing tests still pass

---

### Slice H2.6: Customer-specific Deployment Configuration
**Rationale:** Infrastructure and documentation focus, minimal code changes.

**Deliverables:**
- Company configuration schema
- Environment variable overrides per company
- Deployment documentation template
- Customer onboarding guide
- Configuration validation

**Exit Criteria:**
- Can configure per-company settings
- Deployment documentation is complete
- All existing tests still pass

---

## Current Issues to Address

### Critical
- ⚠️ 1 test failure in quote-lifecycle.test.ts (transaction timeout during registration)
  - This is a database connection/transaction timeout issue
  - May need to increase transaction timeout or optimize the registration flow

### Recommendation
Before starting Phase H2, we should fix the remaining test failure to ensure a clean baseline. This will make it easier to detect if Phase H2 changes introduce regressions.

---

## Next Steps

1. **Fix remaining test failure** (quote-lifecycle transaction timeout)
2. **Create detailed implementation plan for Slice H2.1** (Plan/Feature Flags)
3. **Implement Slice H2.1** with full test coverage
4. **Verify all tests pass** before proceeding to next slice
5. **Repeat for remaining slices**

---

## Risk Mitigation

### Breaking Existing Tests
- Run full test suite after each slice
- Use feature flags to gate new functionality
- Add new tests before modifying existing code
- Keep changes isolated to new modules

### Database Schema Changes
- Use Prisma migrations for all schema changes
- Test migrations on clean database
- Document migration steps
- Provide rollback procedures

### Flutter Integration
- Test Flutter changes in isolation
- Use conditional rendering for new features
- Ensure branding changes don't break existing UI
- Test on multiple screen sizes

---

## Related Documentation

- [Phase H1 Completion Summary](phase_H1_completion_summary.md)
- [Development Plan](plan.md)
- [Phase H1 Hardening Evidence](phase_H1_final_hardening_evidence.md)
