import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/calendar_repository.dart';

DateTime _dateOnly(DateTime date) => DateTime(date.year, date.month, date.day);

final selectedScheduleDateProvider = StateProvider<DateTime>(
  (ref) => _dateOnly(DateTime.now()),
);

final dayScheduleProvider = FutureProvider<ScheduleDay>((ref) async {
  final date = ref.watch(selectedScheduleDateProvider);
  final repo = ref.watch(calendarRepositoryProvider);
  return repo.getDaySchedule(date);
});

final workloadProvider = FutureProvider<WorkloadDay>((ref) async {
  final date = ref.watch(selectedScheduleDateProvider);
  final repo = ref.watch(calendarRepositoryProvider);
  return repo.getWorkload(date);
});
