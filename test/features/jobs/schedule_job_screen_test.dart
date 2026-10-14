import 'package:aera/core/network/api_client.dart';
import 'package:aera/features/customers/data/customers_repository.dart';
import 'package:aera/features/jobs/data/jobs_repository.dart';
import 'package:aera/features/jobs/providers/jobs_provider.dart';
import 'package:aera/features/jobs/schedule_job_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _MockJobsRepository extends JobsRepository {
  _MockJobsRepository({
    required this.job,
    required this.technicians,
  }) : super(ApiClient());

  final Job job;
  final List<Technician> technicians;

  bool assignCalled = false;
  String? assignedTechId;
  bool scheduleCalled = false;

  @override
  Future<Job> getJob(String id) async => job;

  @override
  Future<List<Technician>> listTechnicians() async => technicians;

  @override
  Future<JobMutationResult> assignTechnician(
    String jobId,
    String? technicianId,
  ) async {
    assignCalled = true;
    assignedTechId = technicianId;
    return JobMutationResult(job: job, warnings: const []);
  }

  @override
  Future<JobMutationResult> scheduleJob(
    String jobId, {
    required DateTime scheduledStart,
    required DateTime scheduledEnd,
    bool reschedule = false,
  }) async {
    scheduleCalled = true;
    return JobMutationResult(job: job, warnings: const []);
  }
}

void main() {
  final testJob = Job(
    id: 'job-123',
    jobNumber: 42,
    status: 'NEW',
    priority: 'HIGH',
    serviceType: 'AC Repair',
    problemDescription: 'AC blowing warm air',
    customer: const JobCustomer(
      id: 'cust-1',
      firstName: 'Alice',
      lastName: 'Smith',
    ),
    serviceAddress: const ServiceAddress(
      id: 'addr-1',
      label: 'Home',
      line1: '100 Main St',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      countryCode: 'US',
    ),
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
  );

  const testTech = Technician(
    id: 'tech-99',
    firstName: 'Bob',
    lastName: 'Vance',
  );

  testWidgets('Area L #3: scheduling without selecting technician shows clear error', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final mockRepo = _MockJobsRepository(
      job: testJob,
      technicians: [testTech],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          jobsRepositoryProvider.overrideWithValue(mockRepo),
          jobDetailProvider('job-123').overrideWith((ref) => Future.value(testJob)),
          techniciansProvider.overrideWith((ref) => Future.value([testTech])),
        ],
        child: const MaterialApp(
          home: ScheduleJobScreen(jobId: 'job-123'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Verify screen rendered
    expect(find.text('Schedule Dispatch'), findsOneWidget);
    final buttonFinder = find.text('Confirm Dispatch & Alert Crew');
    expect(buttonFinder, findsOneWidget);

    // Tap confirm without selecting technician
    await tester.tap(buttonFinder);
    await tester.pumpAndSettle();

    // Clear snackbar message shown
    expect(find.text('Select a technician before dispatching'), findsOneWidget);
    expect(mockRepo.assignCalled, isFalse);
    expect(mockRepo.scheduleCalled, isFalse);
  });

  testWidgets('Area L #3: selecting technician assigns AND schedules without error', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final mockRepo = _MockJobsRepository(
      job: testJob,
      technicians: [testTech],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          jobsRepositoryProvider.overrideWithValue(mockRepo),
          jobDetailProvider('job-123').overrideWith((ref) => Future.value(testJob)),
          techniciansProvider.overrideWith((ref) => Future.value([testTech])),
        ],
        child: const MaterialApp(
          home: ScheduleJobScreen(jobId: 'job-123'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Select the technician
    final techFinder = find.text('Bob Vance');
    expect(techFinder, findsOneWidget);
    await tester.tap(techFinder);
    await tester.pumpAndSettle();

    // Tap Confirm
    final buttonFinder = find.text('Confirm Dispatch & Alert Crew');
    await tester.tap(buttonFinder);
    await tester.pumpAndSettle();

    // Both assign and schedule were called in order
    expect(mockRepo.assignCalled, isTrue);
    expect(mockRepo.assignedTechId, 'tech-99');
    expect(mockRepo.scheduleCalled, isTrue);
  });
}
