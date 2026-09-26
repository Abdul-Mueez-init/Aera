import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../settings/data/members_repository.dart';

class TeamSetupScreen extends ConsumerStatefulWidget {
  const TeamSetupScreen({super.key});

  @override
  ConsumerState<TeamSetupScreen> createState() => _TeamSetupScreenState();
}

class _TeamSetupScreenState extends ConsumerState<TeamSetupScreen> {
  final List<_TeamMember> _members = [];
  bool _isLoading = false;
  String? _errorMessage;
  static const String _invitedCountKey = 'onboarding_invited_count';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Team Setup',
        subtitle: 'Step 04 / 04',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          children: [
            // Progress Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AeraColors.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'STEP 04 / 04 • CREW & DISPATCH',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.accent,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: AeraRadii.borderFull,
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: Text(
                    'Final Step',
                    style: AeraTypography.label.copyWith(fontSize: 11),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // 4 Progress Segments (100%)
            Row(
              children: [
                _progressSegment(true),
                const SizedBox(width: 6),
                _progressSegment(true),
                const SizedBox(width: 6),
                _progressSegment(true),
                const SizedBox(width: 6),
                _progressSegment(true),
              ],
            ),
            const SizedBox(height: 20),

            Text(
              'Invite your field & dispatch crew',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 4),
            Text(
              'Give your technicians mobile access to job briefs and dispatches. You can also skip this and invite them anytime from Company Settings.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 20),

            // Error message
            if (_errorMessage != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: AeraColors.danger.withOpacity(0.1),
                  borderRadius: AeraRadii.borderMd,
                  border: Border.all(color: AeraColors.danger),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, color: AeraColors.danger, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
                      ),
                    ),
                  ],
                ),
              ),

            // Team Members List
            if (_members.isEmpty)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AeraColors.surfaceSubtle,
                  borderRadius: AeraRadii.borderMd,
                  border: Border.all(color: AeraColors.line),
                ),
                child: Column(
                  children: [
                    Icon(Icons.group_add, size: 48, color: AeraColors.outline),
                    const SizedBox(height: 12),
                    Text(
                      'No team members added yet',
                      style: AeraTypography.bodyMedium.copyWith(
                        color: AeraColors.inkSoft,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Add team members above or skip for now',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.outline,
                      ),
                    ),
                  ],
                ),
              ),
            ..._members.map((member) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AeraCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  radius: 20,
                                  backgroundColor: member.isInvited
                                      ? AeraColors.successSoft
                                      : AeraColors.surfaceContainerHigh,
                                  child: Text(
                                    member.initials,
                                    style: AeraTypography.h3.copyWith(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: member.isInvited
                                          ? AeraColors.success
                                          : AeraColors.primary,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      member.name,
                                      style: AeraTypography.h3.copyWith(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    Text(
                                      member.contact,
                                      style: AeraTypography.bodySm.copyWith(fontSize: 12),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            if (!member.isInvited)
                              IconButton(
                                icon: const Icon(Icons.close, size: 18, color: AeraColors.outline),
                                onPressed: () {
                                  setState(() => _members.remove(member));
                                },
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Divider(color: AeraColors.line),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: AeraColors.accentSoft,
                                borderRadius: AeraRadii.borderFull,
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    member.role.contains('Technician')
                                        ? Icons.build
                                        : Icons.headset_mic,
                                    size: 13,
                                    color: AeraColors.accent,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    member.role,
                                    style: AeraTypography.label.copyWith(
                                      color: AeraColors.accent,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: member.isInvited
                                    ? AeraColors.successSoft
                                    : AeraColors.surfaceSubtle,
                                borderRadius: AeraRadii.borderFull,
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 5,
                                    height: 5,
                                    decoration: BoxDecoration(
                                      color: member.isInvited
                                          ? AeraColors.success
                                          : AeraColors.outline,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    member.isInvited ? 'Invited' : 'Ready to invite',
                                    style: AeraTypography.label.copyWith(
                                      color: member.isInvited
                                          ? AeraColors.success
                                          : AeraColors.inkSoft,
                                      fontSize: 10,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (member.invitationError != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              member.invitationError!,
                              style: AeraTypography.bodySm.copyWith(
                                color: AeraColors.danger,
                                fontSize: 11,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                )),

            // Add member button
            OutlinedButton.icon(
              onPressed: _showAddMemberDialog,
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AeraColors.line),
                backgroundColor: AeraColors.surface,
                shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderMd),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: const Icon(Icons.add, color: AeraColors.accent, size: 18),
              label: Text(
                'Add Team Member',
                style: AeraTypography.bodyMedium.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AeraColors.accent,
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Complete Setup CTA
            AeraButton(
              text: _isLoading
                  ? 'Sending Invitations...'
                  : 'Finish Setup & Deploy Workspace',
              icon: _isLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Icon(Icons.check_circle_outline, size: 18, color: Colors.white),
              onPressed: _isLoading ? null : _handleFinishSetup,
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: _isLoading ? null : () => context.push('/onboarding/complete'),
                child: Text(
                  'Skip for now, I will invite crew later',
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _progressSegment(bool isCompleted) {
    return Expanded(
      child: Container(
        height: 5,
        decoration: BoxDecoration(
          color: isCompleted ? AeraColors.accent : AeraColors.surfaceContainerHighest,
          borderRadius: AeraRadii.borderFull,
        ),
      ),
    );
  }

  void _showAddMemberDialog() {
    final nameController = TextEditingController();
    final emailController = TextEditingController();
    String selectedRole = 'TECHNICIAN';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add Team Member'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Full Name',
                  hintText: 'e.g. John Doe',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: emailController,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  hintText: 'e.g. john@example.com',
                ),
              ),
              const SizedBox(height: 12),
              const Text('Role'),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: RadioListTile<String>(
                      title: const Text('Technician'),
                      value: 'TECHNICIAN',
                      groupValue: selectedRole,
                      onChanged: (value) => setDialogState(() => selectedRole = value!),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                  Expanded(
                    child: RadioListTile<String>(
                      title: const Text('Dispatcher'),
                      value: 'DISPATCHER',
                      groupValue: selectedRole,
                      onChanged: (value) => setDialogState(() => selectedRole = value!),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                final name = nameController.text.trim();
                final email = emailController.text.trim();
                if (name.isNotEmpty && email.isNotEmpty) {
                  final nameParts = name.split(' ');
                  final initials = nameParts.length >= 2
                      ? '${nameParts[0][0]}${nameParts[1][0]}'
                      : name[0];
                  setState(() {
                    _members.add(_TeamMember(
                      name: name,
                      contact: email,
                      initials: initials.toUpperCase(),
                      role: selectedRole == 'TECHNICIAN' ? 'Field Technician' : 'Dispatcher',
                    ));
                  });
                  Navigator.pop(context);
                }
              },
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleFinishSetup() async {
    if (_members.isEmpty) {
      context.push('/onboarding/complete');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final membersRepo = ref.read(membersRepositoryProvider);
      int successCount = 0;

      for (int i = 0; i < _members.length; i++) {
        final member = _members[i];
        if (member.isInvited) continue;

        try {
          final nameParts = member.name.split(' ');
          final firstName = nameParts.first;
          final lastName = nameParts.length > 1 ? nameParts.sublist(1).join(' ') : '';

          await membersRepo.inviteMember(
            InviteMemberInput(
              email: member.contact,
              firstName: firstName,
              lastName: lastName,
              role: member.role.contains('Technician') ? 'TECHNICIAN' : 'DISPATCHER',
            ),
          );

          setState(() {
            _members[i] = _TeamMember(
              name: member.name,
              contact: member.contact,
              initials: member.initials,
              role: member.role,
              isInvited: true,
            );
          });
          successCount++;
        } catch (e) {
          setState(() {
            _members[i] = _TeamMember(
              name: member.name,
              contact: member.contact,
              initials: member.initials,
              role: member.role,
              isInvited: false,
              invitationError: 'Failed to send invitation',
            );
          });
        }
      }

      // Save invited count for completion screen
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_invitedCountKey, successCount);

      if (successCount > 0 && mounted) {
        context.push('/onboarding/complete');
      } else if (mounted) {
        setState(() => _errorMessage = 'Failed to send invitations. Please try again.');
      }
    } catch (e) {
      setState(() => _errorMessage = 'Failed to send invitations. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }
}

class _TeamMember {
  _TeamMember({
    required this.name,
    required this.contact,
    required this.initials,
    required this.role,
    this.isInvited = false,
    this.invitationError,
  });
  final String name;
  final String contact;
  final String initials;
  final String role;
  final bool isInvited;
  final String? invitationError;
}
