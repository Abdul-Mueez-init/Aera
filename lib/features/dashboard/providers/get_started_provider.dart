import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../customers/data/customers_repository.dart';
import '../../jobs/data/jobs_repository.dart';
import '../../settings/data/members_repository.dart';

/// What a brand-new company has done so far, computed from real records (never
/// from a flag the user can tick). Replaces the old fake onboarding screens.
///
/// Each field is nullable on purpose: `null` means "unknown" — the probe
/// failed (network/server error), which is NOT the same as "not done".
/// Presenting a failed probe as `false` would tell an established company
/// it has no customers/jobs/technicians, so the checklist hides whenever
/// any probe is unknown (see [isUnknown]).
class GetStartedProgress {
  const GetStartedProgress({
    required this.hasCustomer,
    required this.hasJob,
    required this.hasTechnician,
  });

  final bool? hasCustomer;
  final bool? hasJob;

  /// A technician exists on the team, invited or active. Inviting is the
  /// owner's step; whether they accepted is tracked on the Team screen.
  final bool? hasTechnician;

  /// True when any probe failed and the state is therefore unknown.
  bool get isUnknown =>
      hasCustomer == null || hasJob == null || hasTechnician == null;

  /// Whether every step is done. [needsTechnician] is false for roles that
  /// cannot invite (dispatcher): they are never blocked on that step.
  bool isComplete({required bool needsTechnician}) =>
      hasCustomer == true &&
      hasJob == true &&
      (!needsTechnician || hasTechnician == true);
}

/// Three small calls (page size 1 plus the roster), run in parallel. Auto
/// disposed so it is recomputed whenever the dashboard is opened afresh.
final getStartedProvider = FutureProvider.autoDispose<GetStartedProgress>((
  ref,
) async {
  final customers = ref.watch(customersRepositoryProvider);
  final jobs = ref.watch(jobsRepositoryProvider);
  final members = ref.watch(membersRepositoryProvider);

  bool? hasCustomer;
  bool? hasJob;
  bool? hasTechnician;

  try {
    final page = await customers.listCustomers(pageSize: 1);
    hasCustomer = page.meta.total > 0;
  } catch (_) {
    // Unknown — NOT "no customers". The checklist hides on unknown.
    hasCustomer = null;
  }

  try {
    final page = await jobs.listJobs(pageSize: 1);
    hasJob = page.meta.total > 0;
  } catch (_) {
    hasJob = null;
  }

  try {
    final roster = await members.listMembers();
    hasTechnician = roster.any((m) => m.role == 'TECHNICIAN');
  } catch (_) {
    hasTechnician = null;
  }

  return GetStartedProgress(
    hasCustomer: hasCustomer,
    hasJob: hasJob,
    hasTechnician: hasTechnician,
  );
});
