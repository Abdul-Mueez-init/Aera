import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../jobs/data/jobs_repository.dart' show Job;
import '../data/technician_repository.dart';

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

final selectedTechDateProvider = StateProvider<DateTime>(
  (ref) => _dateOnly(DateTime.now()),
);

/// Not autoDispose: mirrors `jobsListProvider`'s caching rationale. Mutating
/// a job's status invalidates this explicitly rather than relying on
/// disposal, same pattern as `job_detail_screen.dart`.
final technicianTodayProvider = FutureProvider<List<Job>>((ref) async {
  final date = ref.watch(selectedTechDateProvider);
  final repo = ref.watch(technicianRepositoryProvider);
  return repo.getToday(date);
});
