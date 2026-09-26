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
  });

  final String id;
  final String role;
  final String status;
  final DateTime createdAt;
  final MemberUser user;
  final String? invitationToken;

  factory Member.fromJson(Map<String, dynamic> json) => Member(
    id: json['id'] as String,
    role: json['role'] as String,
    status: json['status'] as String,
    createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    user: MemberUser.fromJson(json['user'] as Map<String, dynamic>),
    invitationToken: json['invitationToken'] as String?,
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
}
