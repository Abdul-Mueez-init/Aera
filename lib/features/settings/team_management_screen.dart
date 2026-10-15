import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../auth/providers/auth_provider.dart';
import 'data/members_repository.dart';

/// Company team directory backed by the current-company members API.
/// Owners can invite members; dispatchers can view the roster read-only.
class TeamManagementScreen extends ConsumerStatefulWidget {
  const TeamManagementScreen({super.key});

  @override
  ConsumerState<TeamManagementScreen> createState() =>
      _TeamManagementScreenState();
}

class _TeamManagementScreenState extends ConsumerState<TeamManagementScreen> {
  List<Member> _members = const [];
  bool _loading = true;
  bool _inviting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  Future<void> _loadMembers() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final members = await ref.read(membersRepositoryProvider).listMembers();
      if (!mounted) return;
      setState(() {
        _members = members;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is ApiException
            ? error.message
            : 'Could not load team members. Check your connection and try again.';
        _loading = false;
      });
    }
  }

  Future<void> _inviteMember() async {
    final input = await _showInviteDialog();
    if (input == null || !mounted) return;

    setState(() {
      _inviting = true;
      _error = null;
    });
    try {
      final member = await ref.read(membersRepositoryProvider).inviteMember(input);
      if (!mounted) return;
      setState(() {
        _members = [..._members, member];
        _inviting = false;
      });
      final token = member.invitationToken;
      if (token != null && token.isNotEmpty) {
        await _showInvitationCode(token);
      } else {
        _showMessage('Invitation created for ${member.user.email}.');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _inviting = false);
      _showMessage(
        error is ApiException
            ? error.message
            : 'Could not create the invitation. Please try again.',
        isError: true,
      );
    }
  }

  Future<InviteMemberInput?> _showInviteDialog() async {
    final firstName = TextEditingController();
    final lastName = TextEditingController();
    final email = TextEditingController();
    var role = 'TECHNICIAN';
    String? validationError;

    try {
      return await showDialog<InviteMemberInput>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: const Text('Invite team member'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: firstName,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'First name'),
                  ),
                  TextField(
                    controller: lastName,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'Last name'),
                  ),
                  TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Email'),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: role,
                    decoration: const InputDecoration(labelText: 'Role'),
                    items: const [
                      DropdownMenuItem(
                        value: 'TECHNICIAN',
                        child: Text('Technician'),
                      ),
                      DropdownMenuItem(
                        value: 'DISPATCHER',
                        child: Text('Dispatcher'),
                      ),
                    ],
                    onChanged: (value) {
                      if (value != null) setDialogState(() => role = value);
                    },
                  ),
                  if (validationError != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      validationError!,
                      style: const TextStyle(color: AeraColors.danger),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () {
                  final first = firstName.text.trim();
                  final last = lastName.text.trim();
                  final address = email.text.trim();
                  final validEmail = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                      .hasMatch(address);
                  if (first.isEmpty || last.isEmpty || !validEmail) {
                    setDialogState(() {
                      validationError =
                          'Enter first name, last name, and a valid email.';
                    });
                    return;
                  }
                  Navigator.pop(
                    dialogContext,
                    InviteMemberInput(
                      email: address,
                      firstName: first,
                      lastName: last,
                      role: role,
                    ),
                  );
                },
                child: const Text('Create invitation'),
              ),
            ],
          ),
        ),
      );
    } finally {
      firstName.dispose();
      lastName.dispose();
      email.dispose();
    }
  }

  Future<void> _showInvitationCode(String token) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Invitation created'),
        content: SelectableText(
          'Share this one-time invitation code with the team member. They can '
          'choose “I have an invitation” on the Welcome screen and enter it.\n\n$token',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Done'),
          ),
          FilledButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: token));
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) _showMessage('Invitation code copied.');
            },
            icon: const Icon(Icons.copy),
            label: const Text('Copy code'),
          ),
        ],
      ),
    );
  }

  void _showMessage(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: isError ? AeraColors.danger : null,
        content: Text(message),
      ),
    );
  }

  String _displayName(Member member) {
    final name = '${member.user.firstName} ${member.user.lastName}'.trim();
    return name.isEmpty ? member.user.email : name;
  }

  String _roleLabel(String role) => switch (role) {
        'OWNER' => 'Owner',
        'DISPATCHER' => 'Dispatcher',
        'TECHNICIAN' => 'Technician',
        _ => role,
      };

  @override
  Widget build(BuildContext context) {
    final canInvite = ref.watch(currentRoleProvider) == 'OWNER';
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Team'),
        actions: [
          IconButton(
            tooltip: 'Refresh team',
            onPressed: _loading ? null : _loadMembers,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: canInvite
          ? FloatingActionButton.extended(
              onPressed: _loading || _inviting ? null : _inviteMember,
              icon: _inviting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.person_add_alt_1),
              label: Text(_inviting ? 'Creating…' : 'Invite member'),
            )
          : null,
      body: _loading && _members.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _members.isEmpty
              ? _TeamLoadError(message: _error!, onRetry: _loadMembers)
              : RefreshIndicator(
                  onRefresh: _loadMembers,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                    children: [
                      Text(
                        'Company members',
                        style: AeraTypography.h3.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        canInvite
                            ? 'Manage your roster and invite technicians or dispatchers.'
                            : 'Your company roster (view only).',
                        style: AeraTypography.bodySm.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            _error!,
                            style: const TextStyle(color: AeraColors.danger),
                          ),
                        ),
                      if (_members.isEmpty)
                        AeraCard(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            children: [
                              const Icon(Icons.groups_outlined, size: 40),
                              const SizedBox(height: 10),
                              Text(
                                'No team members yet',
                                style: AeraTypography.bodyMedium,
                              ),
                              const SizedBox(height: 4),
                              const Text('Use Invite member to add your crew.'),
                            ],
                          ),
                        )
                      else
                        ..._members.map(
                          (member) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: AeraCard(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    child: Text(
                                      _displayName(member).isNotEmpty
                                          ? _displayName(member)[0].toUpperCase()
                                          : '?',
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _displayName(member),
                                          style: AeraTypography.bodyMedium
                                              .copyWith(
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        Text(
                                          member.user.email,
                                          style: AeraTypography.bodySm.copyWith(
                                            color: AeraColors.inkSoft,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${_roleLabel(member.role)} · ${member.status}',
                                          style: AeraTypography.label.copyWith(
                                            color: member.status == 'ACTIVE'
                                                ? AeraColors.success
                                                : AeraColors.inkSoft,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}

class _TeamLoadError extends StatelessWidget {
  const _TeamLoadError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AeraColors.danger, size: 34),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
            ],
          ),
        ),
      );
}
