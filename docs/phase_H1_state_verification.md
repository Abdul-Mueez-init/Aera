# Phase H1 — Loading, Empty, Error, Offline, and Permission States Verification

## Overview

This document verifies the implementation of loading, empty, error, offline, and permission states across all major screens in the Aera Flutter application.

## Screens Verified

### 1. Dashboard Screen
**File:** `lib/features/dashboard/dashboard_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | Not applicable (static mock data) | N/A |
| Empty | Not applicable (static mock data) | N/A |
| Error | Not applicable (static mock data) | N/A |
| Offline | Not implemented | ❌ Missing |
| Permission | Not applicable (static mock data) | N/A |

**Notes:** Dashboard currently displays static mock data. Should be converted to API-backed with proper state handling.

---

### 2. Customers Screen
**File:** `lib/features/customers/customers_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | `CircularProgressIndicator()` in `customersAsync.when(loading:)` | ✅ Implemented |
| Empty | Empty state with icon, message, and "Add your first customer" hint | ✅ Implemented |
| Error | `_ErrorState` widget with error message and retry button | ✅ Implemented |
| Offline | Not implemented | ❌ Missing |
| Permission | Not implemented (401 handled at API level only) | ⚠️ Partial |

**Code References:**
- Loading: Line 113
- Empty: Lines 181-204
- Error: Lines 114-119, 334-358

---

### 3. Jobs Screen
**File:** `lib/features/jobs/jobs_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | `CircularProgressIndicator()` in `jobsAsync.when(loading:)` | ✅ Implemented |
| Empty | Empty state with icon, message, and "Create your first work order" hint | ✅ Implemented |
| Error | `_ErrorState` widget with error message and retry button | ✅ Implemented |
| Offline | Not implemented | ❌ Missing |
| Permission | Not implemented (401 handled at API level only) | ⚠️ Partial |

**Code References:**
- Loading: Line 129
- Empty: Lines 184-212
- Error: Lines 130-135, 443-471

---

### 4. Calendar Screen
**File:** `lib/features/calendar/calendar_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | `CircularProgressIndicator()` in `scheduleAsync.when(loading:)` | ✅ Implemented |
| Empty | Empty state with "Nothing scheduled for this day" message | ✅ Implemented |
| Error | `_ErrorBlock` widget with error message and retry button | ✅ Implemented |
| Offline | Not implemented | ❌ Missing |
| Permission | Not implemented (401 handled at API level only) | ⚠️ Partial |

**Code References:**
- Loading: Lines 279-282
- Empty: Lines 348-367
- Error: Lines 283-288

---

### 5. Invoices Screen
**File:** `lib/features/invoices/invoices_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | `CircularProgressIndicator()` in `invoicesAsync.when(loading:)` | ✅ Implemented |
| Empty | Empty state with icon, message, and "Generate one from a completed job" hint | ✅ Implemented |
| Error | `_ErrorState` widget with error message and retry button | ✅ Implemented |
| Offline | Not implemented | ❌ Missing |
| Permission | Not implemented (401 handled at API level only) | ⚠️ Partial |

**Code References:**
- Loading: Line 72
- Empty: Lines 335-363
- Error: Lines 73-78

---

### 6. Quotes Screen
**File:** `lib/features/quotes/quotes_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | `CircularProgressIndicator()` in `quotesAsync.when(loading:)` | ✅ Implemented |
| Empty | Empty state with icon, message, and "Create your first quote" hint | ✅ Implemented |
| Error | `_ErrorState` widget with error message and retry button | ✅ Implemented |
| Offline | Not implemented | ❌ Missing |
| Permission | Not implemented (401 handled at API level only) | ⚠️ Partial |

**Code References:**
- Loading: Line 82
- Empty: Lines 148-176
- Error: Lines 83-88, 325-353

---

### 7. Technician Home Screen
**File:** `lib/features/technician/technician_home_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | `CircularProgressIndicator()` in `jobsAsync.when(loading:)` | ✅ Implemented |
| Empty | Empty state with "No jobs scheduled for today" message | ✅ Implemented |
| Error | Error state with message and retry button | ✅ Implemented |
| Offline | Not implemented | ❌ Missing |
| Permission | Not implemented (401 handled at API level only) | ⚠️ Partial |

**Code References:**
- Loading: Line 91
- Empty: Lines 111-130
- Error: Lines 92-109

---

### 8. Customer Portal Screen
**File:** `lib/features/portal/customer_home_screen.dart`

| State | Implementation | Status |
|-------|---------------|--------|
| Loading | `CircularProgressIndicator()` in `portalAsync.when(loading:)` | ✅ Implemented |
| Empty | Empty states for appointments, quotes, invoices, and history | ✅ Implemented |
| Error | Error state with message and retry button | ✅ Implemented |
| Offline | Not implemented | ❌ Missing |
| Permission | Token-based access (portal links handle auth) | ✅ Implemented |

**Code References:**
- Loading: Line 87
- Empty: Lines 201-207, 250-256
- Error: Lines 88-109

---

## Summary

### Loading States
**Status:** ✅ **Excellent**
- All API-backed screens implement loading states
- Consistent use of `CircularProgressIndicator()`
- Proper integration with Riverpod's `AsyncValue.when()`

### Empty States
**Status:** ✅ **Excellent**
- All screens implement empty states
- Contextual messages (e.g., "No customers yet", "No jobs scheduled")
- Helpful hints for first-time users
- Appropriate icons for each context

### Error States
**Status:** ✅ **Excellent**
- All screens implement error states
- Consistent error message display
- Retry functionality on all screens
- Proper error handling with `ApiException`

### Offline States
**Status:** ❌ **Not Implemented**
- No network connectivity monitoring
- No offline mode indicators
- No offline-specific error messages
- No cached data support for offline viewing

**Recommendations:**
1. Add `connectivity_plus` package for network monitoring
2. Create `NetworkStatus` provider to track connectivity
3. Add offline banner/indicator to app scaffold
4. Show offline-specific error messages when network is unavailable
5. Consider caching critical data for offline viewing

### Permission States
**Status:** ⚠️ **Partial**
- 401 (unauthorized) handled at API client level with token refresh
- 403 (forbidden) not explicitly handled at UI level
- No role-based permission denied UI states
- No access denied screens for restricted features

**Current Implementation:**
- API client handles 401 with automatic token refresh (line 97 in `api_client.dart`)
- No UI-level feedback for permission denied scenarios
- No role-based feature gating

**Recommendations:**
1. Add explicit 403 (forbidden) handling in API client
2. Create permission denied state widget
3. Add role-based feature gating in UI
4. Show access denied messages for restricted actions
5. Consider permission request flows for missing permissions

## Implementation Priority

### High Priority (Must Fix)
1. **Offline state implementation**
   - Add network connectivity monitoring
   - Show offline indicators
   - Display offline-specific error messages

2. **Permission state enhancement**
   - Add 403 handling at UI level
   - Create permission denied state widget
   - Add role-based feature gating

### Medium Priority (Should Fix)
1. **Dashboard API integration**
   - Convert static mock data to API-backed
   - Add proper state handling

2. **Error state improvements**
   - Add more specific error messages
   - Include error codes for debugging
   - Add error logging for monitoring

### Low Priority (Nice to Have)
1. **Offline data caching**
   - Cache critical data for offline viewing
   - Sync when connection restored

2. **Permission request flows**
   - In-app permission requests
   - Guidance for missing permissions

## Code Samples

### Offline State Implementation (Recommended)

```dart
// lib/core/network/network_status.dart
import 'package:connectivity_plus/connectivity_plus.dart';

final networkStatusProvider = StreamProvider<ConnectivityResult>((ref) {
  return Connectivity().onConnectivityChanged;
});

// lib/core/widgets/offline_banner.dart
class OfflineBanner extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connectivity = ref.watch(networkStatusProvider);
    final isOffline = connectivity.value == ConnectivityResult.none;

    if (!isOffline) return SizedBox.shrink();

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AeraColors.warning,
      child: Row(
        children: [
          Icon(Icons.cloud_off, color: Colors.white, size: 16),
          SizedBox(width: 8),
          Text(
            'You are offline. Some features may be unavailable.',
            style: TextStyle(color: Colors.white, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
```

### Permission Denied State Implementation (Recommended)

```dart
// lib/core/widgets/permission_denied_state.dart
class PermissionDeniedState extends StatelessWidget {
  final String message;
  final VoidCallback onRequestPermission;

  const PermissionDeniedState({
    required this.message,
    required this.onRequestPermission,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 48, color: AeraColors.warning),
            SizedBox(height: 12),
            Text(
              'Access Denied',
              style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
            ),
            SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            SizedBox(height: 16),
            FilledButton(
              onPressed: onRequestPermission,
              child: Text('Request Access'),
            ),
          ],
        ),
      ),
    );
  }
}
```

## Conclusion

The Aera application has excellent implementations of loading, empty, and error states across all major screens. The consistent use of Riverpod's `AsyncValue.when()` pattern ensures a uniform user experience.

**Key Strengths:**
- ✅ All screens have loading states
- ✅ All screens have empty states with helpful messages
- ✅ All screens have error states with retry functionality
- ✅ Consistent implementation patterns across screens

**Critical Gaps:**
- ❌ No offline state implementation
- ⚠️ Limited permission state handling at UI level

**Next Steps:**
1. Implement network connectivity monitoring
2. Add offline indicators and error messages
3. Enhance permission state handling with 403 support
4. Add role-based feature gating where appropriate

## Related Documentation

- **Phase H1 Hardening Completion:** Overall hardening checklist
- **Phase G5 Security Evidence:** Security review and authorization tests
- **Architecture Document:** Error handling patterns
- **API Client:** `lib/core/network/api_client.dart`
