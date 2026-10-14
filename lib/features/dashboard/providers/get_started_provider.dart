import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../customers/data/customers_repository.dart';
import '../../jobs/data/jobs_repository.dart';
import '../../settings/data/members_repository.dart';

/// What a brand-new company has done so far, computed from real records (never
/// from a flag the user can tick). Replaces the old fake onboarding screens.
class GetStartedProgress {
  const GetStartedProgress({
    required this.hasCustomer,
    required this.hasJob,
    required this.hasTechnician,
  });

  final bool hasCustomer;
  final bool hasJob;

  /// A technician exists on the team, invited or active. Inviting is the
  /// owner's step; whether they accepted is tracked on the Team screen.
  final bool hasTechnician;

  /// Whether every step is done. [needsTechnician] is false for roles that
  /// cannot invite (dispatcher): they are never blocked on that step.
  bool isComplete({required bool needsTechnician}) =>
      hasCustomer && hasJob && (!needsTechnician || hasTechnician);
}

/// Three small calls (page size 1 plus the roster), run in parallel. Auto
/// disposed so it is recomputed whenever the dashboard is opened afresh.
final getStartedProvider = FutureProvider.autoDispose<GetStartedProgress>((
  ref,
) async {
  final customers = ref.watch(customersRepositoryProvider);
  final jobs = ref.watch(jobsRepositoryProvider);
  final members = ref.watch(membersRepositoryProvider);

  bool hasCustomer = false;
  bool hasJob = false;
  bool hasTechnician = false;

  try {
    final page = await customers.listCustomers(pageSize: 1);
    hasCustomer = page.meta.total > 0;
  } catch (_) {}

  try {
    final page = await jobs.listJobs(pageSize: 1);
    hasJob = page.meta.total > 0;
  } catch (_) {}

  try {
    final roster = await members.listMembers();
    hasTechnician = roster.any((m) => m.role == 'TECHNICIAN');
  } catch (_) {}

  return GetStartedProgress(
    hasCustomer: hasCustomer,
    hasJob: hasJob,
    hasTechnician: hasTechnician,
  );
});
