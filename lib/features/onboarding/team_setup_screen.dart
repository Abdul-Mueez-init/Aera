import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class TeamSetupScreen extends StatefulWidget {
  const TeamSetupScreen({super.key});

  @override
  State<TeamSetupScreen> createState() => _TeamSetupScreenState();
}

class _TeamSetupScreenState extends State<TeamSetupScreen> {
  final List<_TeamMember> _members = [
    _TeamMember('Tariq Khan', 'tariq.k@northstarclimate.com', 'TK', 'Field Technician', true),
    _TeamMember('Sana Malik', '+92 300 3921084', 'SM', 'Dispatcher', true),
    _TeamMember('Bilal Ahmed', 'bilal.hvac@northstarclimate.com', 'BA', 'Lead Technician', false),
  ];

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

            // Team Members List
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
                                  backgroundColor: AeraColors.surfaceContainerHigh,
                                  child: Text(
                                    member.initials,
                                    style: AeraTypography.h3.copyWith(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: AeraColors.primary,
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
                                color: AeraColors.successSoft,
                                borderRadius: AeraRadii.borderFull,
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 5,
                                    height: 5,
                                    decoration: const BoxDecoration(
                                      color: AeraColors.success,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Ready to invite',
                                    style: AeraTypography.label.copyWith(
                                      color: AeraColors.success,
                                      fontSize: 10,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),

            // Add member button
            OutlinedButton.icon(
              onPressed: () {
                setState(() {
                  _members.add(_TeamMember(
                    'Zayd Ali',
                    'zayd@northstarclimate.com',
                    'ZA',
                    'Field Technician',
                    true,
                  ));
                });
              },
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AeraColors.line),
                backgroundColor: AeraColors.surface,
                shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderMd),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: const Icon(Icons.add, color: AeraColors.accent, size: 18),
              label: Text(
                'Add Another Crew Member',
                style: AeraTypography.bodyMedium.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AeraColors.accent,
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Complete Setup CTA
            AeraButton(
              text: 'Finish Setup & Deploy Workspace',
              icon: const Icon(Icons.check_circle_outline, size: 18, color: Colors.white),
              onPressed: () => context.push('/onboarding/complete'),
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: () => context.push('/onboarding/complete'),
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
}

class _TeamMember {
  _TeamMember(this.name, this.contact, this.initials, this.role, this.isTech);
  final String name;
  final String contact;
  final String initials;
  final String role;
  final bool isTech;
}
