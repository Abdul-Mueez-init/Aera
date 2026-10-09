# Aera Production Bug Fixes Implementation Plan

**Objective:** Fix all identified audit findings (P0 critical, P1 high, P3 minor) with migrations, regression tests, and thorough verification.

**Scope:** All findings from the production audit including database schema fixes, Flutter UI bugs, backend warnings, and documentation updates.

**Constraints:**
- No automatic commits by implementer
- Include Prisma migrations for schema changes
- Add regression tests for all fixes
- Thorough and careful approach (prioritize correctness over speed)
- Maximum 6-7 implementation phases

---

## Phase 1: Critical Financial Infrastructure Fixes (P0)

**Objective:** Fix the payment idempotency constraint conflict that prevents all payment operations from working.

### 1.1 Analyze Payment Idempotency Design
- **Task:** Review the relationship between Payment and PaymentOperation models
- **Details:**
  - Confirm PaymentOperation should enforce idempotency
  - Confirm Payment should reference idempotencyKey for traceability but not enforce uniqueness
  - Verify no other code depends on Payment's unique constraint
- **Acceptance Criteria:** Design decision documented, no hidden dependencies found

### 1.2 Remove Duplicate Unique Constraint from Payment Model
- **File:** `backend/prisma/schema.prisma`
- **Line:** 528
- **Change:** Remove `@@unique([companyId, idempotencyKey])` from Payment model
- **Details:**
  - Keep PaymentOperation's unique constraint at line 698
  - Keep Payment's idempotencyKey field for traceability
  - Add comment explaining that PaymentOperation enforces idempotency
- **Acceptance Criteria:** Schema compiles without errors, only PaymentOperation has the unique constraint

### 1.3 Generate Prisma Migration
- **Command:** `pnpm --filter backend prisma:migrate dev --name remove_payment_idempotency_duplicate`
- **Details:**
  - Generate migration for dropping the duplicate constraint
  - Review generated migration SQL for correctness
  - Ensure migration is reversible
- **Acceptance Criteria:** Migration file generated, SQL reviewed and validated

### 1.4 Test Migration on Development Database
- **Command:** `pnpm --filter backend prisma:migrate deploy`
- **Details:**
  - Apply migration to local development database
  - Verify Payment table structure
  - Verify PaymentOperation table structure unchanged
  - Test that constraint is removed from Payment
- **Acceptance Criteria:** Migration applies successfully, database schema correct

### 1.5 Regenerate Prisma Client
- **Command:** `pnpm --filter backend prisma:generate`
- **Details:**
  - Regenerate TypeScript types after schema change
  - Verify no compilation errors
- **Acceptance Criteria:** Prisma client regenerated successfully, no TypeScript errors

### 1.6 Run Payment Integration Tests
- **Command:** `pnpm --filter backend test -- payment-idempotency.test.ts`
- **Details:**
  - Run all payment idempotency tests
  - Verify all 7 previously failing tests now pass
  - Confirm no new test failures introduced
- **Acceptance Criteria:** All payment tests pass (7/7)

### 1.7 Run Full Backend Test Suite
- **Command:** `pnpm --filter backend test`
- **Details:**
  - Run complete backend test suite
  - Verify test count: 416 total, 0 failed, 2 skipped
  - Confirm payment-related tests in customer-to-cash integration pass
- **Acceptance Criteria:** Full test suite passes (407 passed, 0 failed, 2 skipped)

---

## Phase 2: Flutter UI Critical Fixes (P1)

**Objective:** Fix the technician assignment loading state bug that prevents dispatch workflow.

### 2.1 Analyze Technician Assignment Flow
- **File:** `lib/features/jobs/job_detail_screen.dart`
- **Lines:** 278-319
- **Details:**
  - Review current implementation using `ref.read(techniciansProvider)`
  - Identify the pattern used elsewhere in the codebase for loading states
  - Check CreateQuoteScreen for proper `.when()` pattern reference
- **Acceptance Criteria:** Correct pattern identified, implementation approach decided

### 2.2 Refactor Technician Assignment to Use Loading State
- **File:** `lib/features/jobs/job_detail_screen.dart`
- **Method:** `_assignTechnician` (lines 278-352)
- **Change:** Replace synchronous read with reactive watch and loading state handling
- **Implementation:**
  ```dart
  // Change from:
  final techniciansAsync = ref.read(techniciansProvider);
  final technicians = techniciansAsync.value ?? [];

  // To:
  final techniciansAsync = ref.watch(techniciansProvider);
  return techniciansAsync.when(
    loading: () {
      // Show loading indicator in dialog
      return showDialog(...);
    },
    error: (error, _) {
      // Show error message
      return _showError(error);
    },
    data: (technicians) {
      // Existing dialog logic
      return _showTechnicianDialog(technicians);
    },
  );
  ```
- **Acceptance Criteria:** Code compiles, loading state properly handled

### 2.3 Add Flutter Widget Test for Technician Assignment
- **File:** `lib/features/jobs/job_detail_screen_test.dart` (create if not exists)
- **Details:**
  - Test loading state displays indicator
  - Test empty list displays appropriate message
  - Test populated list displays technicians correctly
  - Test error state displays error message
- **Acceptance Criteria:** Widget test covers all three states (loading, data, error)

### 2.4 Manually Test Technician Assignment Flow
- **Steps:**
  1. Start Flutter app in development mode
  2. Navigate to a job detail screen
  3. Click "Assign Technician" button
  4. Verify loading indicator appears while technicians load
  5. Verify technician list appears after loading
  6. Verify technician assignment succeeds
  7. Repeat with no technicians available
  8. Verify appropriate message shown
- **Acceptance Criteria:** Manual testing confirms fix works correctly

### 2.5 Run Flutter Analyzer
- **Command:** `flutter analyze`
- **Details:**
  - Verify no new warnings or errors introduced
  - Check for potential performance issues
- **Acceptance Criteria:** Flutter analyzer reports no issues

---

## Phase 3: Flutter UI Minor Improvements (P3)

**Objective:** Fix quote preview rounding discrepancy between client and server calculations.

### 3.1 Analyze Quote Preview Calculation
- **File:** `lib/features/quotes/create_quote_screen.dart`
- **Lines:** 440 (previewTotal calculation)
- **Details:**
  - Review current Dart `double`-based preview calculation
  - Compare with server-side BigInt calculation in `money.service.ts`
  - Identify potential rounding scenarios
- **Acceptance Criteria:** Rounding discrepancy scenarios documented

### 3.2 Add "Approximate" Label to Quote Preview
- **File:** `lib/features/quotes/create_quote_screen.dart`
- **Lines:** ~440
- **Change:** Add visual indicator that preview is approximate
- **Implementation:**
  ```dart
  Text(
    'Preview (approximate): $_currency ${item.previewTotal.toStringAsFixed(2)}',
    style: AeraTypography.bodySm.copyWith(
      color: AeraColors.inkSoft,
      fontStyle: FontStyle.italic,
    ),
  ),
  ```
- **Acceptance Criteria:** Preview clearly labeled as approximate

### 3.3 Add Comment Explaining Server Authority
- **File:** `lib/features/quotes/create_quote_screen.dart`
- **Location:** Near preview calculation code
- **Details:** Add comment explaining that server recomputes authoritative total
- **Implementation:**
  ```dart
  // Note: This preview uses Dart double for display only.
  // The server recomputes the authoritative total using exact BigInt arithmetic
  // in money.service.ts. The preview may show minor rounding differences.
  ```
- **Acceptance Criteria:** Comment added explaining calculation authority

### 3.4 Test Quote Preview with Edge Cases
- **Steps:**
  1. Create quote with fractional quantities (e.g., 1.5 hours)
  2. Create quote with high-precision prices (e.g., $99.99)
  3. Verify preview displays
  4. Submit quote and compare with server total
  5. Verify discrepancy is minimal (< $0.01)
- **Acceptance Criteria:** Edge cases tested, discrepancies acceptable

---

## Phase 4: Backend Performance & Warnings (P3)

**Objective:** Investigate and fix PostgreSQL deprecation warning about concurrent queries.

### 4.1 Identify Source of pg Deprecation Warning
- **File:** `backend/src/modules/dashboard/dashboard.service.ts`
- **Lines:** 88-131 (Promise.all section)
- **Details:**
  - The warning occurs when `client.query()` is called while another query is executing
  - Dashboard service uses `Promise.all` with multiple concurrent queries
  - Review each query in the Promise.all array
- **Acceptance Criteria:** Source of warning identified

### 4.2 Review Concurrent Query Pattern
- **Details:**
  - Verify that concurrent queries are intentional (performance optimization)
  - Check if Prisma's connection pool handles this correctly
  - Research pg driver version and deprecation context
  - Determine if this is a false positive or actual issue
- **Acceptance Criteria:** Understanding of warning impact documented

### 4.3 Fix or Document Warning Resolution
- **Option A (if actual issue):** Sequentialize queries or adjust connection pool
- **Option B (if false positive):** Add comment explaining safe concurrent pattern
- **Decision:** Based on investigation in 4.2
- **Acceptance Criteria:** Warning resolved or documented as acceptable

### 4.4 Run Backend Tests After Fix
- **Command:** `pnpm --filter backend test -- dashboard`
- **Details:**
  - Run dashboard-related tests
  - Verify no performance regression
  - Confirm warning no longer appears (if fixed)
- **Acceptance Criteria:** Tests pass, warning resolved

---

## Phase 5: Documentation & Configuration (P3)

**Objective:** Fix documentation inconsistencies and ensure configuration is production-ready.

### 5.1 Investigate Missing Documentation File
- **File:** `docs/phase_H1_final_hardening_evidence.md`
- **Details:**
  - Check if file was intended to be created
  - Review README reference to understand purpose
  - Determine if file should be created or reference removed
- **Acceptance Criteria:** Decision made on file creation vs. reference removal

### 5.2 Resolve Documentation Reference
- **Option A (create file):** Create `docs/phase_H1_final_hardening_evidence.md` with Phase H1 hardening evidence
- **Option B (remove reference):** Remove reference from README if not needed
- **Decision:** Based on investigation in 5.1
- **Acceptance Criteria:** Documentation inconsistency resolved

### 5.3 Review README for Production Deployment Instructions
- **File:** `README.md`
- **Details:**
  - Verify CORS_ORIGINS configuration is documented
  - Verify Sentry configuration is documented
  - Verify environment variable requirements are complete
  - Check for any missing production setup steps
- **Acceptance Criteria:** Production deployment instructions complete

### 5.4 Update README with Migration Instructions
- **File:** `README.md`
- **Section:** Database Migration (around line 58)
- **Change:** Add note about the new migration for payment idempotency fix
- **Implementation:**
  ```markdown
  **Note:** After pulling the latest code, apply the payment idempotency fix migration:
  ```powershell
  pnpm --filter backend prisma:migrate deploy
  ```
  ```
- **Acceptance Criteria:** README updated with migration instructions

### 5.5 Verify Environment Configuration
- **Files:** `.env.development`, `.env.production`, `.env.staging`
- **Details:**
  - Confirm CORS_ORIGINS is set in production/staging
  - Confirm API_BASE_URL uses HTTPS in production/staging
  - Verify no hardcoded values in tracked files
- **Acceptance Criteria:** Environment configuration verified for production

---

## Phase 6: Regression Test Suite

**Objective:** Add comprehensive regression tests to prevent future breakage of fixed issues.

### 6.1 Add Payment Idempotency Regression Test
- **File:** `backend/tests/payment-idempotency-regression.test.ts` (create new)
- **Details:**
  - Test that PaymentOperation enforces idempotency
  - Test that Payment can reference same idempotencyKey without conflict
  - Test that duplicate PaymentOperation with same key fails
  - Test idempotency is scoped to companyId
- **Acceptance Criteria:** Regression test covers idempotency constraint behavior

### 6.2 Add Technician Assignment Loading State Test
- **File:** `lib/features/jobs/job_detail_screen_test.dart`
- **Details:**
  - Widget test for loading state
  - Widget test for empty state
  - Widget test for error state
  - Widget test for successful assignment
- **Acceptance Criteria:** Regression test covers loading state handling

### 6.3 Add Quote Preview Accuracy Test
- **File:** `lib/features/quotes/create_quote_screen_test.dart` (create if not exists)
- **Details:**
  - Test preview displays with "approximate" label
  - Test preview calculation with various quantities
  - Verify preview does not crash on edge cases
- **Acceptance Criteria:** Regression test covers preview display

### 6.4 Run Full Regression Test Suite
- **Commands:**
  - Backend: `pnpm --filter backend test`
  - Flutter: `flutter test`
- **Details:**
  - Run all tests including new regression tests
  - Verify all tests pass
  - Confirm test coverage improved
- **Acceptance Criteria:** All tests pass, regression tests included

---

## Phase 7: Final Verification & Validation

**Objective:** Comprehensive end-to-end verification that all fixes work correctly and system is production-ready.

### 7.1 Run Complete Backend Test Suite
- **Command:** `pnpm --filter backend test`
- **Details:**
  - Verify 416 total tests
  - Verify 0 failed tests
  - Verify 2 skipped tests (password reset)
  - Confirm all payment tests pass
- **Acceptance Criteria:** Backend test suite fully green

### 7.2 Run Complete Flutter Test Suite
- **Command:** `flutter test`
- **Details:**
  - Run all Flutter tests including new widget tests
  - Verify no failures
  - Check coverage report
- **Acceptance Criteria:** Flutter test suite fully green

### 7.3 Manual End-to-End Testing - Payment Flow
- **Steps:**
  1. Start backend server
  2. Start Flutter app
  3. Register/login as owner
  4. Create customer and job
  5. Complete job
  6. Generate invoice
  7. Issue invoice
  8. Record payment with idempotency key
  9. Verify payment succeeds
  10. Attempt duplicate payment with same key
  11. Verify idempotency works (no duplicate payment)
- **Acceptance Criteria:** Full payment flow works, idempotency enforced

### 7.4 Manual End-to-End Testing - Technician Assignment
- **Steps:**
  1. Create multiple technicians
  2. Create a job
  3. Navigate to job detail
  4. Click "Assign Technician"
  5. Verify loading indicator appears
  6. Verify technician list appears
  7. Assign technician
  8. Verify assignment succeeds
- **Acceptance Criteria:** Technician assignment works with proper loading state

### 7.5 Manual End-to-End Testing - Quote Creation
- **Steps:**
  1. Create customer
  2. Create new quote
  3. Add line items with fractional quantities
  4. Verify preview displays with "approximate" label
  5. Submit quote
  6. Verify server total matches expectation
- **Acceptance Criteria:** Quote creation works, preview properly labeled

### 7.6 Verify Database Schema
- **Command:** `pnpm --filter backend prisma:studio` (visual inspection)
- **Details:**
  - Verify Payment table has no unique constraint on (companyId, idempotencyKey)
  - Verify PaymentOperation table has unique constraint on (companyId, idempotencyKey)
  - Verify all other constraints intact
- **Acceptance Criteria:** Database schema matches design

### 7.7 Verify No Regressions
- **Steps:**
  1. Run all scheduling concurrency tests
  2. Run all quote lifecycle tests
  3. Run all customer-to-cash integration tests
  4. Verify no test failures introduced
- **Acceptance Criteria:** No test regressions

### 7.8 Generate Test Coverage Report
- **Backend:** `pnpm --filter backend test --coverage`
- **Flutter:** `flutter test --coverage`
- **Details:**
  - Generate coverage reports
  - Verify coverage not decreased
  - Check that new code is covered
- **Acceptance Criteria:** Coverage reports generated, coverage maintained

### 7.9 Final Documentation Update
- **File:** `docs/bug_fixes_implementation_report.md` (create new)
- **Details:**
  - Document all fixes applied
  - Document test results
  - Document migration applied
  - Provide production deployment checklist
- **Acceptance Criteria:** Implementation report created

---

## Phase Completion Criteria

**Phase 1 Complete When:**
- Payment schema constraint removed
- Migration generated and applied
- All 7 payment tests pass
- Full backend test suite passes

**Phase 2 Complete When:**
- Technician assignment uses loading state
- Widget test added
- Manual testing confirms fix
- Flutter analyzer clean

**Phase 3 Complete When:**
- Quote preview labeled as approximate
- Comment added explaining server authority
- Edge cases tested
- No functional regression

**Phase 4 Complete When:**
- pg deprecation warning investigated
- Warning resolved or documented
- Dashboard tests pass
- No performance regression

**Phase 5 Complete When:**
- Documentation inconsistency resolved
- README updated with migration instructions
- Environment configuration verified
- Production deployment instructions complete

**Phase 6 Complete When:**
- Regression tests added for all fixes
- All tests pass (backend + Flutter)
- Coverage report generated
- No test regressions

**Phase 7 Complete When:**
- All manual E2E tests pass
- Database schema verified
- No regressions detected
- Implementation report created
- System ready for production deployment

---

## Risk Assessment & Mitigation

**Risk 1: Migration Failure in Production**
- **Mitigation:** Test migration in staging environment first
- **Rollback Plan:** Keep migration file for potential rollback

**Risk 2: Flutter Loading State Breaks Existing Flow**
- **Mitigation:** Thorough manual testing before deployment
- **Rollback Plan:** Keep original code as comment temporarily

**Risk 3: Payment Idempotency Logic Change Breaks Clients**
- **Mitigation:** Verify API contract unchanged from client perspective
- **Rollback Plan:** Revert schema change if issues detected

**Risk 4: Test Environment Differences**
- **Mitigation:** Run tests in environment matching production configuration
- **Rollback Plan:** Fix test configuration and re-run

---

## Estimated Timeline

**Phase 1:** 2-3 hours (schema fix, migration, testing)
**Phase 2:** 1-2 hours (Flutter fix, testing)
**Phase 3:** 1 hour (preview labeling, testing)
**Phase 4:** 1-2 hours (investigation, fix/testing)
**Phase 5:** 1 hour (documentation updates)
**Phase 6:** 2-3 hours (regression tests)
**Phase 7:** 2-3 hours (E2E verification)

**Total Estimated Time:** 10-15 hours

---

## Post-Implementation Checklist

- [ ] All phases completed according to acceptance criteria
- [ ] Implementation report generated
- [ ] Migration backed up for production deployment
- [ ] Test results documented
- [ ] Code reviewed (if applicable)
- [ ] Ready for staging deployment
- [ ] Ready for production deployment

---

**Notes for Implementer:**
- Do not commit changes automatically
- Follow the sequence in order
- Test each phase before proceeding
- Document any deviations from this plan
- Ask for clarification if any step is unclear
