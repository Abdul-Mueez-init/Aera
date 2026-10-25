import 'package:aera/features/dashboard/providers/get_started_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('GetStartedProgress.isComplete', () {
    test('an empty company is not complete', () {
      const progress = GetStartedProgress(
        hasCustomer: false,
        hasJob: false,
        hasTechnician: false,
      );
      expect(progress.isComplete(needsTechnician: true), isFalse);
      expect(progress.isComplete(needsTechnician: false), isFalse);
    });

    test('an owner also needs a technician', () {
      const progress = GetStartedProgress(
        hasCustomer: true,
        hasJob: true,
        hasTechnician: false,
      );
      expect(progress.isComplete(needsTechnician: true), isFalse);
    });

    test('a dispatcher is never blocked on the technician step', () {
      const progress = GetStartedProgress(
        hasCustomer: true,
        hasJob: true,
        hasTechnician: false,
      );
      expect(progress.isComplete(needsTechnician: false), isTrue);
    });

    test('everything done is complete for every role', () {
      const progress = GetStartedProgress(
        hasCustomer: true,
        hasJob: true,
        hasTechnician: true,
      );
      expect(progress.isComplete(needsTechnician: true), isTrue);
      expect(progress.isComplete(needsTechnician: false), isTrue);
    });

    test('a failed probe is unknown, not "not done"', () {
      const progress = GetStartedProgress(
        hasCustomer: null,
        hasJob: true,
        hasTechnician: true,
      );
      expect(progress.isUnknown, isTrue);
      expect(progress.isComplete(needsTechnician: false), isFalse);
    });

    test('fully probed progress is not unknown', () {
      const progress = GetStartedProgress(
        hasCustomer: false,
        hasJob: false,
        hasTechnician: false,
      );
      expect(progress.isUnknown, isFalse);
    });
  });
}
