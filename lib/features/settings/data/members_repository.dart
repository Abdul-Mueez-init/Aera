import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final membersRepositoryProvider = Provider<MembersRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return MembersRepository(client);
});

class Member {
  const Member({
    required this.id,
    required this.role,
    required this.status,
    required this.createdAt,
    required this.user,
    this.invitationToken,
    this.invitationExpiresAt,
  });

  final String id;
  final String role;
  final String status;
  final DateTime createdAt;
  final MemberUser user;
  final String? invitationToken;

  /// When a pending invitation stops working. Null for people who already
  /// joined. The code itself is never part of the members list.
  final DateTime? invitationExpiresAt;

  bool get isInvitationExpired =>
      status == 'INVITED' &&
      invitationExpiresAt != null &&
      invitationExpiresAt!.isBefore(DateTime.now());

  factory Member.fromJson(Map<String, dynamic> json) => Member(
    id: json['id'] as String,
    role: json['role'] as String,
    status: json['status'] as String,
    createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    user: MemberUser.fromJson(json['user'] as Map<String, dynamic>),
    invitationToken: json['invitationToken'] as String?,
    invitationExpiresAt: DateTime.tryParse(
      json['invitationExpiresAt'] as String? ?? '',
    ),
  );
}

class MemberUser {
  const MemberUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
  });

  final String id;
  final String email;
  final String firstName;
  final String lastName;

  factory MemberUser.fromJson(Map<String, dynamic> json) => MemberUser(
    id: json['id'] as String,
    email: json['email'] as String? ?? '',
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
  );
}

class InviteMemberInput {
  const InviteMemberInput({
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  final String email;
  final String firstName;
  final String lastName;
  final String role;

  Map<String, dynamic> toJson() => {
    'email': email.trim(),
    'firstName': firstName.trim(),
    'lastName': lastName.trim(),
    'role': role,
  };
}

class MembersRepository {
  MembersRepository(this._client);

  final ApiClient _client;

  Future<List<Member>> listMembers() async {
    final res = await _client.get('/api/v1/companies/current/members');
    final list = res as List<dynamic>;
    return list.map((m) => Member.fromJson(m as Map<String, dynamic>)).toList();
  }

  Future<Member> inviteMember(InviteMemberInput input) async {
    final res = await _client.post(
      '/api/v1/companies/current/invitations',
      body: input.toJson(),
    );
    return Member.fromJson(res as Map<String, dynamic>);
  }

  /// Issues a new one-time code for a member who has not accepted yet (OWNER
  /// only). The old code stops working. The returned [Member] carries the new
  /// `invitationToken`, which is shown to the owner once.
  Future<Member> resendInvitation(String memberId) async {
    final res = await _client.post(
      '/api/v1/companies/current/members/$memberId/resend-invitation',
    );
    return Member.fromJson(res as Map<String, dynamic>);
  }

  /// Changes a member's role and/or status (OWNER only; the server enforces
  /// it). Only ACTIVE <-> SUSPENDED is allowed for status, and never for a
  /// member who is still INVITED.
  Future<void> updateMember(
    String memberId, {
    String? role,
    String? status,
  }) async {
    await _client.patch(
      '/api/v1/companies/current/members/$memberId',
      body: {
        if (role != null) 'role': role,
        if (status != null) 'status': status,
      },
    );
  }

  /// Removes a member and revokes their sessions (OWNER only).
  Future<void> removeMember(String memberId) async {
    await _client.delete('/api/v1/companies/current/members/$memberId');
  }
}
