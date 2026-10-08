import 'package:aera/features/settings/data/members_repository.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _json({
  required String status,
  String? invitationExpiresAt,
}) => {
  'id': 'm1',
  'role': 'TECHNICIAN',
  'status': status,
  'createdAt': '2026-10-01T09:00:00.000Z',
  'invitationExpiresAt': invitationExpiresAt,
  'user': {
    'id': 'u1',
    'email': 'ivy@example.com',
    'firstName': 'Ivy',
    'lastName': 'Invitee',
  },
};

void main() {
  group('Member.isInvitationExpired', () {
    test('is true for a pending invitation whose expiry has passed', () {
      final member = Member.fromJson(
        _json(
          status: 'INVITED',
          invitationExpiresAt: DateTime.now()
              .subtract(const Duration(hours: 1))
              .toUtc()
              .toIso8601String(),
        ),
      );
      expect(member.isInvitationExpired, isTrue);
    });

    test('is false for a pending invitation that is still valid', () {
      final member = Member.fromJson(
        _json(
          status: 'INVITED',
          invitationExpiresAt: DateTime.now()
              .add(const Duration(days: 3))
              .toUtc()
              .toIso8601String(),
        ),
      );
      expect(member.isInvitationExpired, isFalse);
    });

    test('is false when the server sends no expiry (people who joined)', () {
      final member = Member.fromJson(_json(status: 'ACTIVE'));
      expect(member.invitationExpiresAt, isNull);
      expect(member.isInvitationExpired, isFalse);
    });

    test('never reads an invitation code from the members list', () {
      final member = Member.fromJson(_json(status: 'INVITED'));
      expect(member.invitationToken, isNull);
    });
  });
}
