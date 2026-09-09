import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class AiOperationsAssistantScreen extends StatefulWidget {
  const AiOperationsAssistantScreen({super.key});

  @override
  State<AiOperationsAssistantScreen> createState() => _AiOperationsAssistantScreenState();
}

class _AiOperationsAssistantScreenState extends State<AiOperationsAssistantScreen> {
  String _activePrompt = 'Which jobs are at risk today?';
  final TextEditingController _queryController = TextEditingController();

  final List<String> _presets = [
    'Which jobs are at risk today?',
    'Who is running behind schedule?',
    'What invoices are overdue?',
    'Which customers need follow-up?',
  ];

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AeraColors.accent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(
                child: Text(
                  'A',
                  style: AeraTypography.h3.copyWith(color: AeraColors.surface),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AERA INTELLIGENCE', style: AeraTypography.labelUpper.copyWith(fontSize: 10)),
                Text('AI Operations Assistant', style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.apps),
            tooltip: 'Screen Catalog',
            onPressed: () => Scaffold.of(context).openEndDrawer(),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                // Live Status Sync Ribbon
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AeraColors.successSoft,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: AeraColors.success,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Dispatch telemetry synced · 09:42 AM',
                            style: AeraTypography.label.copyWith(color: AeraColors.success),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      'MARCUS CONSOLE',
                      style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Operational Metric Snapshot (3 columns)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Active Vans', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                            const SizedBox(height: 2),
                            RichText(
                              text: TextSpan(
                                text: '4 ',
                                style: AeraTypography.h3.copyWith(
                                  color: AeraColors.ink,
                                  fontWeight: FontWeight.w700,
                                ),
                                children: [
                                  TextSpan(
                                    text: '/ 4',
                                    style: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(width: 1, height: 32, color: AeraColors.line),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(left: 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Jobs Today', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                              const SizedBox(height: 2),
                              Text('18', style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                      ),
                      Container(width: 1, height: 32, color: AeraColors.line),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(left: 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Interventions', style: AeraTypography.label.copyWith(color: AeraColors.warning)),
                              const SizedBox(height: 2),
                              Text(
                                '2 Pending',
                                style: AeraTypography.body.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AeraColors.warning,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Presets Carousel
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'OPERATIONAL DIAGNOSTICS',
                      style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                    ),
                    Text(
                      'Presets',
                      style: AeraTypography.label.copyWith(color: AeraColors.accent),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _presets.map((preset) {
                      final isSelected = _activePrompt == preset;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ActionChip(
                          label: Text(preset),
                          onPressed: () => setState(() => _activePrompt = preset),
                          backgroundColor: isSelected ? AeraColors.accent : AeraColors.surface,
                          labelStyle: AeraTypography.label.copyWith(
                            color: isSelected ? AeraColors.surface : AeraColors.ink,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                            side: BorderSide(
                              color: isSelected ? AeraColors.accent : AeraColors.line,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 14),

                // Conversation Thread
                // User Message
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AeraColors.surfaceSubtle,
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(14),
                            topRight: Radius.circular(4),
                            bottomLeft: Radius.circular(14),
                            bottomRight: Radius.circular(14),
                          ),
                          border: Border.all(color: AeraColors.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Marcus Vance · 09:41 AM',
                              style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _activePrompt,
                              style: AeraTypography.body.copyWith(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const CircleAvatar(
                      radius: 14,
                      backgroundColor: AeraColors.accentSoft,
                      child: Icon(Icons.person, size: 16, color: AeraColors.accent),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Aera Synthesized Response
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: AeraColors.accent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Center(
                        child: Text(
                          'A',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.surface,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Hazard Alert Card
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AeraColors.warningSoft,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AeraColors.warning.withOpacity(0.3)),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.priority_high, color: AeraColors.warning, size: 20),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'OPERATIONAL HAZARD DETECTED',
                                        style: AeraTypography.labelUpper.copyWith(
                                          color: AeraColors.warning,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '2 jobs require dispatch intervention before 14:00 peak rush.',
                                        style: AeraTypography.bodySm.copyWith(
                                          fontWeight: FontWeight.w600,
                                          color: AeraColors.ink,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),

                          // Grounded Evidence Feed Card
                          AeraCard(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        const Icon(Icons.fact_check, size: 16, color: AeraColors.inkSoft),
                                        const SizedBox(width: 6),
                                        Text(
                                          'VERIFIED EVIDENCE FEED',
                                          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                                        ),
                                      ],
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AeraColors.surfaceSubtle,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text('2 Flagged Units', style: AeraTypography.label),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),

                                // Incident 1
                                _incidentItem(
                                  'JOB-4019: Sarah Khan (Gulberg III)',
                                  'Ahmed Raza delayed by +28 min on coil clean in Model Town. Arrival window breach imminent.',
                                  Icons.schedule,
                                  AeraColors.danger,
                                  onTap: () => context.push('/ai-insight/ins-1'),
                                ),
                                const Divider(color: AeraColors.line, height: 16),

                                // Incident 2
                                _incidentItem(
                                  'JOB-4022: M. Trading Co. HQ (Cantt)',
                                  'Carrier scroll compressor CP-402 delivery pending at regional depot. Risk to 15:30 start.',
                                  Icons.inventory_2,
                                  AeraColors.warning,
                                  onTap: () => context.push('/ai-insight/ins-2'),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),

                          // Recommended Action Card
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AeraColors.surface,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AeraColors.line),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'RECOMMENDED AUTONOMOUS ACTION',
                                  style: AeraTypography.labelUpper.copyWith(color: AeraColors.accent),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Reassign JOB-4019 to Omar Khan (currently idle in Gulberg II, 4 min away) to preserve 100% SLA.',
                                  style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                                ),
                                const SizedBox(height: 8),
                                ElevatedButton.icon(
                                  onPressed: () => context.push('/ai-insight/ins-1'),
                                  icon: const Icon(Icons.bolt, size: 16),
                                  label: const Text('Review & Execute Reassignment'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AeraColors.accent,
                                    foregroundColor: AeraColors.surface,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),

          // Persistent Input Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: AeraColors.surface,
              border: const Border(top: BorderSide(color: AeraColors.line)),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 44,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: AeraColors.canvas,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(color: AeraColors.line),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.auto_awesome, size: 18, color: AeraColors.accent),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: _queryController,
                              style: AeraTypography.bodySm,
                              decoration: InputDecoration(
                                hintText: 'Ask Aera anything about jobs, techs, revenue...',
                                hintStyle: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                                border: InputBorder.none,
                                isDense: true,
                              ),
                              onSubmitted: (val) {
                                if (val.trim().isNotEmpty) {
                                  setState(() => _activePrompt = val.trim());
                                  _queryController.clear();
                                }
                              },
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.mic, size: 20, color: AeraColors.inkSoft),
                            onPressed: () {},
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    style: IconButton.styleFrom(backgroundColor: AeraColors.accent),
                    icon: const Icon(Icons.arrow_upward, size: 20, color: AeraColors.surface),
                    onPressed: () {
                      if (_queryController.text.trim().isNotEmpty) {
                        setState(() => _activePrompt = _queryController.text.trim());
                        _queryController.clear();
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _incidentItem(
    String title,
    String desc,
    IconData icon,
    Color color, {
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  desc,
                  style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, size: 16, color: AeraColors.outline),
        ],
      ),
    );
  }
}
