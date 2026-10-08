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

  final customerPage = customers.listCustomers(pageSize: 1);
  final jobPage = jobs.listJobs(pageSize: 1);
  final roster = members.listMembers();

  final resolvedCustomers = await customerPage;
  final resolvedJobs = await jobPage;
  final resolvedRoster = await roster;

  return GetStartedProgress(
    hasCustomer: resolvedCustomers.meta.total > 0,
    hasJob: resolvedJobs.meta.total > 0,
    hasTechnician: resolvedRoster.any((m) => m.role == 'TECHNICIAN'),
  );
});
