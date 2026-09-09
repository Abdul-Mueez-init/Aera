import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/jobs_repository.dart';

class JobsQuery {
  const JobsQuery({
    this.page = 1,
    this.pageSize = 20,
    this.status,
    this.priority,
  });

  final int page;
  final int pageSize;
  final String? status;
  final String? priority;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is JobsQuery &&
          page == other.page &&
          pageSize == other.pageSize &&
          status == other.status &&
          priority == other.priority;

  @override
  int get hashCode => Object.hash(page, pageSize, status, priority);
}

final jobsQueryProvider = StateProvider<JobsQuery>((ref) => const JobsQuery());

/// Not autoDispose: keeps the last-fetched page cached, same rationale as
/// `customersListProvider`. Mutations explicitly `ref.invalidate` this.
final jobsListProvider = FutureProvider<PaginatedJobs>((ref) async {
  final query = ref.watch(jobsQueryProvider);
  final repo = ref.watch(jobsRepositoryProvider);
  return repo.listJobs(
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    priority: query.priority,
  );
});

/// Not autoDispose: a job viewed once stays cached for the rest of the
/// session, bounded by the number of distinct jobs visited. Also backs
/// `ScheduleJobScreen`, which reads a job by id from the route param
/// rather than a shared draft — mirrors `customerDetailProvider`.
final jobDetailProvider = FutureProvider.family<Job, String>((
  ref,
  jobId,
) async {
  final repo = ref.watch(jobsRepositoryProvider);
  return repo.getJob(jobId);
});

final techniciansProvider = FutureProvider<List<Technician>>((ref) async {
  final repo = ref.watch(jobsRepositoryProvider);
  return repo.listTechnicians();
});
