import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../../core/widgets/aera_text_field.dart';
import '../auth/data/auth_repository.dart';
import '../auth/providers/auth_provider.dart';
import '../settings/data/members_repository.dart';
import 'providers/team_provider.dart';

String _errorText(Object error) =>
    error is ApiException ? error.message : 'Something went wrong. Try again.';

/// The company team: owner and dispatcher can view it, only the owner can
/// invite, change roles, suspend and remove. The server enforces all of it;
/// the UI just hides what the signed-in role cannot do.
class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  Future<void> _openInvite(BuildContext context, WidgetRef ref) async {
    final member = await showModalBottomSheet<Member>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AeraColors.canvas,
      builder: (_) => const _InviteSheet(),
    );
    if (member == null) return;
    ref.invalidate(teamMembersProvider);
    final token = member.invitationToken;
    if (token == null || token.isEmpty || !context.mounted) return;
    final company = ref.read(currentCompanyProvider)?.name ?? 'your company';
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _InvitationCodeDialog(
        member: member,
        token: token,
        companyName: company,
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final membersAsync = ref.watch(teamMembersProvider);
    final role = ref.watch(currentRoleProvider);
    final me = ref.watch(currentUserProvider);
    final isOwner = role == 'OWNER';

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Team'),
      floatingActionButton: isOwner
          ? FloatingActionButton.extended(
              onPressed: () => _openInvite(context, ref),
              backgroundColor: AeraColors.accent,
              foregroundColor: AeraColors.surface,
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Invite'),
            )
          : null,
      body: membersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline,
                  color: AeraColors.danger,
                  size: 32,
                ),
                const SizedBox(height: 12),
                Text(
                  error is ApiException
                      ? error.message
                      : 'Could not load the team.',
                  textAlign: TextAlign.center,
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => ref.invalidate(teamMembersProvider),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        data: (members) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(teamMembersProvider);
            await ref.read(teamMembersProvider.future);
          },
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            itemCount: members.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final member = members[index];
              final isSelf = me != null && member.user.id == me.id;
              return _MemberCard(
                member: member,
                isSelf: isSelf,
                canManage: isOwner && !isSelf && member.role != 'OWNER',
              );
            },
          ),
        ),
      ),
    );
  }
}

class _MemberCard extends ConsumerWidget {
  const _MemberCard({
    required this.member,
    required this.isSelf,
    required this.canManage,
  });

  final Member member;
  final bool isSelf;
  final bool canManage;

  String get _name {
    final full = '${member.user.firstName} ${member.user.lastName}'.trim();
    return full.isNotEmpty ? full : member.user.email;
  }

  String get _initials {
    final first = member.user.firstName.trim();
    final last = member.user.lastName.trim();
    final letters = [
      if (first.isNotEmpty) first[0],
      if (last.isNotEmpty) last[0],
    ].join();
    if (letters.isNotEmpty) return letters.toUpperCase();
    return member.user.email.isNotEmpty
        ? member.user.email[0].toUpperCase()
        : '?';
  }

  AeraStatusType get _statusType {
    switch (member.status) {
      case 'ACTIVE':
        return AeraStatusType.success;
      case 'INVITED':
        return AeraStatusType.pending;
      case 'SUSPENDED':
        return AeraStatusType.danger;
      default:
        return AeraStatusType.neutral;
    }
  }

  String get _statusLabel {
    switch (member.status) {
      case 'ACTIVE':
        return 'Active';
      case 'INVITED':
        return 'Invited';
      case 'SUSPENDED':
        return 'Suspended';
      default:
        return member.status;
    }
  }

  Future<bool> _confirm(
    BuildContext context, {
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              confirmLabel,
              style: const TextStyle(color: AeraColors.danger),
            ),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _onAction(
    BuildContext context,
    WidgetRef ref,
    String action,
  ) async {
    final repo = ref.read(membersRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);

    try {
      if (action.startsWith('role:')) {
        final newRole = action.substring(5);
        await repo.updateMember(member.id, role: newRole);
        messenger.showSnackBar(
          SnackBar(content: Text('$_name is now ${roleLabel(newRole)}')),
        );
      } else if (action == 'suspend') {
        final ok = await _confirm(
          context,
          title: 'Suspend $_name?',
          message:
              'They will be signed out and cannot use Aera until you '
              'reactivate them.',
          confirmLabel: 'Suspend',
        );
        if (!ok) return;
        await repo.updateMember(member.id, status: 'SUSPENDED');
        messenger.showSnackBar(SnackBar(content: Text('$_name suspended')));
      } else if (action == 'reactivate') {
        await repo.updateMember(member.id, status: 'ACTIVE');
        messenger.showSnackBar(SnackBar(content: Text('$_name reactivated')));
      } else if (action == 'remove') {
        final ok = await _confirm(
          context,
          title: 'Remove $_name?',
          message:
              'They lose access to this company immediately. Jobs already '
              'assigned to them stay in the history.',
          confirmLabel: 'Remove',
        );
        if (!ok) return;
        await repo.removeMember(member.id);
        messenger.showSnackBar(SnackBar(content: Text('$_name removed')));
      }
      ref.invalidate(teamMembersProvider);
    } catch (error) {
      messenger.showSnackBar(
        SnackBar(
          backgroundColor: AeraColors.danger,
          content: Text(_errorText(error)),
        ),
      );
    }
  }

  List<PopupMenuEntry<String>> _menuItems() {
    final items = <PopupMenuEntry<String>>[];
    if (member.status == 'ACTIVE') {
      if (member.role != 'DISPATCHER') {
        items.add(
          const PopupMenuItem(
            value: 'role:DISPATCHER',
            child: Text('Make dispatcher'),
          ),
        );
      }
      if (member.role != 'TECHNICIAN') {
        items.add(
          const PopupMenuItem(
            value: 'role:TECHNICIAN',
            child: Text('Make technician'),
          ),
        );
      }
      items.add(const PopupMenuItem(value: 'suspend', child: Text('Suspend')));
    } else if (member.status == 'SUSPENDED') {
      items.add(
        const PopupMenuItem(value: 'reactivate', child: Text('Reactivate')),
      );
    }
    items.add(const PopupMenuItem(value: 'remove', child: Text('Remove')));
    return items;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AeraCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AeraColors.accentSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(
                _initials,
                style: AeraTypography.h3.copyWith(
                  color: AeraColors.accent,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isSelf ? '$_name (you)' : _name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AeraTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (member.user.email.isNotEmpty)
                  Text(
                    member.user.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.outline,
                    ),
                  ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    AeraStatusChip(label: roleLabel(member.role)),
                    AeraStatusChip(label: _statusLabel, type: _statusType),
                  ],
                ),
                if (member.status == 'INVITED') ...[
                  const SizedBox(height: 8),
                  Text(
                    'Waiting to accept. The code was shown once; remove and '
                    're-invite for a new one.',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.outline,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (canManage)
            PopupMenuButton<String>(
              tooltip: 'Manage',
              onSelected: (action) => _onAction(context, ref, action),
              itemBuilder: (_) => _menuItems(),
            ),
        ],
      ),
    );
  }
}

class _InviteSheet extends ConsumerStatefulWidget {
  const _InviteSheet();

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _firstController = TextEditingController();
  final _lastController = TextEditingController();
  final _emailController = TextEditingController();
  String _role = 'TECHNICIAN';
  bool _saving = false;

  @override
  void dispose() {
    _firstController.dispose();
    _lastController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(backgroundColor: AeraColors.danger, content: Text(message)),
    );
  }

  Future<void> _submit() async {
    final first = _firstController.text.trim();
    final last = _lastController.text.trim();
    final email = _emailController.text.trim();

    if (first.isEmpty || last.isEmpty || email.isEmpty) {
      _showError('Please fill in all fields');
      return;
    }
    if (!email.contains('@') || !email.contains('.')) {
      _showError('Please enter a valid email address');
      return;
    }

    setState(() => _saving = true);
    try {
      final member = await ref
          .read(membersRepositoryProvider)
          .inviteMember(
            InviteMemberInput(
              email: email,
              firstName: first,
              lastName: last,
              role: _role,
            ),
          );
      if (mounted) Navigator.of(context).pop(member);
    } catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        _showError(_errorText(error));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        20,
        24,
        24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Invite a team member', style: AeraTypography.h2),
            const SizedBox(height: 4),
            Text(
              'You will get a one-time code to send them.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 16),
            AeraTextField(label: 'First name', controller: _firstController),
            const SizedBox(height: 12),
            AeraTextField(label: 'Last name', controller: _lastController),
            const SizedBox(height: 12),
            AeraTextField(
              label: 'Email',
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            Text(
              'Role',
              style: AeraTypography.label.copyWith(
                color: AeraColors.inkSoft,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _role,
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
                if (value != null) setState(() => _role = value);
              },
            ),
            const SizedBox(height: 20),
            AeraButton(
              text: 'Create invitation',
              isLoading: _saving,
              onPressed: _saving ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

/// Shows the one-time invitation code. The server only stores a hash of it,
/// so it cannot be shown again after this dialog is closed.
class _InvitationCodeDialog extends StatefulWidget {
  const _InvitationCodeDialog({
    required this.member,
    required this.token,
    required this.companyName,
  });

  final Member member;
  final String token;
  final String companyName;

  @override
  State<_InvitationCodeDialog> createState() => _InvitationCodeDialogState();
}

class _InvitationCodeDialogState extends State<_InvitationCodeDialog> {
  bool _copied = false;

  String get _message =>
      "You've been invited to join ${widget.companyName} on Aera as "
      '${roleLabel(widget.member.role)}.\n\n'
      '1. Open the Aera app\n'
      '2. Tap "I have an invitation"\n'
      '3. Enter this code and choose a password:\n\n'
      '${widget.token}\n\n'
      'The code works once and expires in 7 days.';

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.token));
    if (mounted) setState(() => _copied = true);
  }

  Future<void> _shareWhatsApp() async {
    final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(_message)}');
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open WhatsApp')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = '${widget.member.user.firstName} ${widget.member.user.lastName}'
        .trim();
    return AlertDialog(
      title: const Text('Invitation created'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Send this code to ${name.isNotEmpty ? name : widget.member.user.email}. '
              "It is shown only once, so copy or share it now.",
              style: AeraTypography.bodySm,
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AeraColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AeraColors.line),
              ),
              child: SelectableText(
                widget.token,
                style: AeraTypography.bodySm.copyWith(
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton.icon(
          onPressed: _copy,
          icon: Icon(_copied ? Icons.check : Icons.copy, size: 18),
          label: Text(_copied ? 'Copied' : 'Copy'),
        ),
        TextButton.icon(
          onPressed: _shareWhatsApp,
          icon: const Icon(Icons.send, size: 18),
          label: const Text('WhatsApp'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Done'),
        ),
      ],
    );
  }
}
