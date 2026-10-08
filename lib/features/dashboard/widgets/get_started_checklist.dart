import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/aera_colors.dart';
import '../../../core/theme/aera_typography.dart';
import '../../../core/widgets/aera_card.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/get_started_provider.dart';

/// "Get started" card for a new company. Shows only real progress and
/// disappears once every step is done. It is silent while loading and on
/// error: it is a nicety, never a reason to show an error on the dashboard.
class GetStartedChecklist extends ConsumerWidget {
  const GetStartedChecklist({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(currentRoleProvider);
    final isOwner = role == 'OWNER';
    final progress = ref.watch(getStartedProvider).valueOrNull;

    if (progress == null || progress.isComplete(needsTechnician: isOwner)) {
      return const SizedBox.shrink();
    }

    Future<void> open(String path) async {
      await context.push<void>(path);
      // Coming back: re-check what the user just did.
      if (!context.mounted) return;
      ref.invalidate(getStartedProvider);
    }

    final steps = <_Step>[
      _Step(
        title: 'Add your first customer',
        done: progress.hasCustomer,
        onTap: () => open('/create-customer'),
      ),
      _Step(
        title: 'Create your first job',
        done: progress.hasJob,
        onTap: () => open('/create-job'),
      ),
      if (isOwner)
        _Step(
          title: 'Invite a technician',
          done: progress.hasTechnician,
          onTap: () => open('/team'),
        ),
    ];
    final doneCount = steps.where((s) => s.done).length;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: AeraCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Get started',
                    style: AeraTypography.h3.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  '$doneCount of ${steps.length}',
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.outline,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'A few steps to get your company running in Aera.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 8),
            for (final step in steps) _StepRow(step: step),
          ],
        ),
      ),
    );
  }
}

class _Step {
  const _Step({required this.title, required this.done, required this.onTap});

  final String title;
  final bool done;
  final VoidCallback onTap;
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.step});

  final _Step step;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: step.done ? null : step.onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(
              step.done ? Icons.check_circle : Icons.radio_button_unchecked,
              size: 22,
              color: step.done ? AeraColors.success : AeraColors.outline,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                step.title,
                style: AeraTypography.bodySm.copyWith(
                  fontWeight: FontWeight.w600,
                  decoration: step.done ? TextDecoration.lineThrough : null,
                  color: step.done ? AeraColors.outline : AeraColors.ink,
                ),
              ),
            ),
            if (!step.done)
              const Icon(
                Icons.chevron_right,
                size: 20,
                color: AeraColors.outline,
              ),
          ],
        ),
      ),
    );
  }
}
