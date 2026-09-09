import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_button.dart';

class AiInsightDetailScreen extends StatefulWidget {
  const AiInsightDetailScreen({super.key, this.insightId = 'ins-1'});

  final String insightId;

  @override
  State<AiInsightDetailScreen> createState() => _AiInsightDetailScreenState();
}

class _AiInsightDetailScreenState extends State<AiInsightDetailScreen> {
  String _selectedOption = 'A';
  bool _isExecuted = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Algorithmic Trace & Action'),
        actions: [
          IconButton(
            icon: const Icon(Icons.apps),
            tooltip: 'Screen Catalog',
            onPressed: () => Scaffold.of(context).openEndDrawer(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // Header Hazard Banner
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AeraColors.dangerSoft,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AeraColors.danger.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AeraColors.danger,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'SCHEDULE RISK • CRITICAL BUFFER',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.danger,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                Text(
                  'Audited 09:45 AM',
                  style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Core Recommendation Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'AUTONOMOUS RECOMMENDATION',
                      style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AeraColors.accentSoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'High Confidence (94%)',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Reassign Job #JOB-8492 (Sarah Khan) to Omar Khan or advance dispatch window to 15:00.',
                  style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.crisis_alert, size: 16, color: AeraColors.danger),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Imminent 22-minute arrival SLA breach detected on primary technician.',
                        style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Evidence Stack (4-Grid)
          Text(
            'EVIDENCE STACK & TELEMETRY TRACE',
            style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
          ),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: [
              _metricTile('Current Delay', '+28 min', 'Ahmed Raza at Model Town', Icons.schedule, AeraColors.danger),
              _metricTile('Transit Distance', '17.4 km', 'Via Ring Road congestion', Icons.alt_route, AeraColors.warning),
              _metricTile('Est. Transit Time', '34 min', 'Peak traffic 14:00 model', Icons.navigation, AeraColors.ink),
              _metricTile('Buffer Deficit', '-22 min', 'Arrival breach imminent', Icons.hourglass_bottom, AeraColors.danger),
            ],
          ),
          const SizedBox(height: 14),

          // Contextual Alternative Analysis
          Text(
            'CONTEXTUAL ALTERNATIVE ANALYSIS',
            style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
          ),
          const SizedBox(height: 8),

          // Option A
          _optionCard(
            'A',
            'Reassign to Omar Khan (Recommended)',
            'Omar is finishing routine filter swap in Gulberg II (4 min transit to site). 100% on-time arrival guaranteed.',
            '0 min delay • 100% SLA',
            AeraColors.success,
          ),
          const SizedBox(height: 8),

          // Option B
          _optionCard(
            'B',
            'Keep Ahmed Raza & Notify Customer',
            'Send automated WhatsApp/SMS to Sarah Khan pushing window from 14:30 to 15:15 due to traffic delay.',
            '+28 min shift • SLA hit',
            AeraColors.warning,
          ),
          const SizedBox(height: 20),

          // Execution CTA
          if (_isExecuted) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AeraColors.successSoft,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AeraColors.success.withOpacity(0.3)),
              ),
              child: Column(
                children: [
                  const Icon(Icons.check_circle, size: 36, color: AeraColors.success),
                  const SizedBox(height: 6),
                  Text(
                    'Intervention Successfully Executed!',
                    style: AeraTypography.body.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AeraColors.success,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'JOB-8492 reassigned to Omar Khan. Notifications dispatched to both technicians and client updated.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => context.pop(),
                    child: const Text('Return to Intelligence Hub'),
                  ),
                ],
              ),
            ),
          ] else ...[
            AeraButton(
              text: 'Execute Intervention (Option $_selectedOption)',
              icon: const Icon(Icons.bolt, size: 18, color: Colors.white),
              onPressed: () {
                setState(() => _isExecuted = true);
              },
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => context.pop(),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                side: const BorderSide(color: AeraColors.line),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Dismiss Without Action', style: TextStyle(color: AeraColors.inkSoft)),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _metricTile(String label, String value, String desc, IconData icon, Color valColor) {
    return AeraCard(
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
              Icon(icon, size: 14, color: valColor),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700, color: valColor),
          ),
          const SizedBox(height: 1),
          Text(
            desc,
            style: AeraTypography.label.copyWith(color: AeraColors.outline, fontSize: 10),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _optionCard(String key, String title, String desc, String badge, Color badgeColor) {
    final isSelected = _selectedOption == key;
    return InkWell(
      onTap: () => setState(() => _selectedOption = key),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.surfaceSubtle : AeraColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AeraColors.accent : AeraColors.line,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Radio<String>(
              value: key,
              groupValue: _selectedOption,
              activeColor: AeraColors.accent,
              onChanged: (val) {
                if (val != null) setState(() => _selectedOption = val);
              },
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: badgeColor.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          badge,
                          style: AeraTypography.label.copyWith(
                            color: badgeColor,
                            fontWeight: FontWeight.w600,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    desc,
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
