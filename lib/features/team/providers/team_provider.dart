import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../settings/data/members_repository.dart';

/// The company roster from `GET /companies/current/members`.
///
/// Auto-disposed so a different person signing in on the same phone never
/// sees the previous person's team.
final teamMembersProvider = FutureProvider.autoDispose<List<Member>>((ref) {
  return ref.watch(membersRepositoryProvider).listMembers();
});
