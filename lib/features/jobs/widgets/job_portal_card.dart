import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/network/api_response.dart';
import '../../../core/theme/aera_colors.dart';
import '../../../core/theme/aera_radii.dart';
import '../../../core/theme/aera_typography.dart';
import '../../../core/widgets/aera_button.dart';
import '../../../core/widgets/aera_card.dart';
import '../../../core/widgets/aera_status_chip.dart';
import '../../../core/widgets/text_prompt_dialog.dart';
import '../data/jobs_repository.dart';
import '../providers/jobs_provider.dart';

/// Portal access grant summary for one job. OWNER/DISPATCHER only —
/// the backend rejects every other role on these endpoints.
final jobPortalAccessProvider = FutureProvider.autoDispose
    .family<PortalAccessStatus?, String>((ref, jobId) async {
      final repo = ref.watch(jobsRepositoryProvider);
      return repo.getPortalAccess(jobId);
    });

String _humanizeReason(String reason) {
  switch (reason) {
    case 'AUTO_COMPLETED':
      return 'Job completed';
    case 'AUTO_CANCELLED':
      return 'Job cancelled';
    case 'AUTO_MAX_AGE':
      return 'Expired after completion';
    case 'AUTO_LINK_UNUSED':
      return 'Link never opened';
    case 'MANUAL':
      return 'Deactivated by staff';
    case 'REISSUED':
      return 'Replaced by a new link';
    default:
      return reason.replaceAll('_', ' ').toLowerCase();
  }
}

/// Staff card on the job detail screen: portal link status, Send /
/// Reissue / Deactivate, the one-time link reveal, WhatsApp hand-off,
/// and the audited "Override start" for EN_ROUTE jobs.
///
/// The plaintext link only ever exists in this widget's state, right
/// after an issue/reissue response. It is never persisted.
class JobPortalCard extends ConsumerStatefulWidget {
  const JobPortalCard({
    super.key,
    required this.job,
    required this.companyName,
  });

  final Job job;

  /// Display name used in the WhatsApp hand-off message.
  final String companyName;

  @override
  ConsumerState<JobPortalCard> createState() => _JobPortalCardState();
}

class _JobPortalCardState extends ConsumerState<JobPortalCard> {
  bool _busy = false;
  String? _lastIssuedLink;

  Job get _job => widget.job;

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  (String, AeraStatusType) _chipFor(PortalAccessStatus? status) {
    if (status == null) return ('Not sent', AeraStatusType.neutral);
    if (status.isDeactivated) return ('Deactivated', AeraStatusType.danger);
    if (status.isOpened) {
      final seen = status.lastSeenAt ?? status.linkConsumedAt;
      final when = seen != null ? DateFormat('MMM d, h:mm a').format(seen) : '';
      return ('Opened $when', AeraStatusType.success);
    }
    return ('Sent – not opened', AeraStatusType.info);
  }

  String? _detailFor(PortalAccessStatus? status) {
    if (status == null) {
      return 'Send the customer a one-time link to follow this job.';
    }
    if (status.isDeactivated) {
      final parts = <String>[
        if (status.deactivatedReason != null)
          _humanizeReason(status.deactivatedReason!),
        if (status.deactivatedAt != null)
          DateFormat('MMM d, h:mm a').format(status.deactivatedAt!),
      ];
      return parts.isEmpty ? null : parts.join(' · ');
    }
    if (!status.isOpened && status.createdAt != null) {
      return 'Sent ${DateFormat('MMM d, h:mm a').format(status.createdAt!)}';
    }
    return null;
  }

  Future<List<String>?> _pickChannels() {
    var sms = true;
    var email = true;
    return showDialog<List<String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: AeraColors.surface,
          shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
          title: Text(
            'Send portal link',
            style: AeraTypography.h3.copyWith(fontSize: 17),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CheckboxListTile(
                value: sms,
                onChanged: (v) => setDialogState(() => sms = v ?? false),
                title: const Text('SMS'),
                subtitle: Text(
                  _job.customer.phone ?? 'No phone on file',
                  style: AeraTypography.bodySm,
                ),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
              ),
              CheckboxListTile(
                value: email,
                onChanged: (v) => setDialogState(() => email = v ?? false),
                title: const Text('Email'),
                subtitle: Text(
                  _job.customer.email ?? 'No email on file',
                  style: AeraTypography.bodySm,
                ),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: (!sms && !email)
                  ? null
                  : () => Navigator.of(
                      dialogContext,
                    ).pop([if (sms) 'SMS', if (email) 'EMAIL']),
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
  }

  Future<bool> _confirm({
    required String title,
    required String body,
    required String actionLabel,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        title: Text(title, style: AeraTypography.h3.copyWith(fontSize: 17)),
        content: Text(body, style: AeraTypography.bodySm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              actionLabel,
              style: const TextStyle(
                color: AeraColors.danger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _send({required bool reissue}) async {
    if (reissue) {
      final confirmed = await _confirm(
        title: 'Reissue portal link?',
        body:
            'The current link and any open portal session stop working '
            'immediately. A new link is created.',
        actionLabel: 'Reissue',
      );
      if (!confirmed) return;
    }
    final channels = await _pickChannels();
    if (channels == null || channels.isEmpty) return;

    setState(() => _busy = true);
    try {
      final repo = ref.read(jobsRepositoryProvider);
      final result = reissue
          ? await repo.reissuePortalAccess(_job.id, channels)
          : await repo.issuePortalAccess(_job.id, channels);
      ref.invalidate(jobPortalAccessProvider(_job.id));
      if (mounted) {
        setState(() => _lastIssuedLink = result.link);
        await _showLinkDialog(result.link);
      }
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Could not send the portal link');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deactivate() async {
    final confirmed = await _confirm(
      title: 'Deactivate portal access?',
      body:
          'The customer loses portal access to this job right away. '
          'You can send a new link later.',
      actionLabel: 'Deactivate',
    );
    if (!confirmed) return;

    setState(() => _busy = true);
    try {
      await ref.read(jobsRepositoryProvider).deactivatePortalAccess(_job.id);
      ref.invalidate(jobPortalAccessProvider(_job.id));
      if (mounted) setState(() => _lastIssuedLink = null);
      _snack('Portal access deactivated');
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Could not deactivate portal access');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showLinkDialog(String link) {
    return showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        title: Text(
          'Portal link — shown once',
          style: AeraTypography.h3.copyWith(fontSize: 17),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Don't open the real link yourself — it will use it up.",
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.warning,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AeraColors.surfaceContainerLow,
                borderRadius: AeraRadii.borderMd,
              ),
              child: SelectableText(
                link,
                style: AeraTypography.label.copyWith(
                  fontSize: 11,
                  color: AeraColors.accent,
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: link));
              _snack('Link copied');
            },
            icon: const Icon(Icons.copy, size: 16),
            label: const Text('Copy'),
          ),
          if (_job.customer.phone != null)
            TextButton.icon(
              onPressed: () => _sendWhatsApp(link),
              icon: const Icon(Icons.message, size: 16),
              label: const Text('WhatsApp'),
            ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  Future<void> _sendWhatsApp(String link) async {
    final phone = _job.customer.phone;
    if (phone == null || phone.isEmpty) {
      _snack('No customer phone on file');
      return;
    }
    final digits = phone.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) {
      _snack('Customer phone number looks invalid');
      return;
    }
    final company = widget.companyName.isNotEmpty
        ? widget.companyName
        : 'your service company';
    final message =
        "Hi ${_job.customer.firstName}, here's your service portal link "
        'from $company: $link';
    final uri = Uri.https('wa.me', '/$digits', {'text': message});
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      _snack('Could not open WhatsApp');
    }
  }

  Future<void> _overrideStart() async {
    final reason = await showTextPromptDialog(
      context,
      title: 'Override start',
      message:
          'Starts the job without the customer code. The reason '
          'is recorded in the job history and portal activity.',
      hintText: 'Reason (required, 5–300 characters)',
      confirmLabel: 'Start job',
      minLength: 5,
      maxLength: 300,
    );
    if (reason == null) return;

    setState(() => _busy = true);
    try {
      await ref.read(jobsRepositoryProvider).overrideStartJob(_job.id, reason);
      ref.invalidate(jobDetailProvider(_job.id));
      ref.invalidate(jobsListProvider);
      _snack('Job started — override recorded');
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Could not start the job');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accessAsync = ref.watch(jobPortalAccessProvider(_job.id));

    return AeraCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.link, size: 18, color: AeraColors.accent),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Portal access',
                  style: AeraTypography.h3.copyWith(fontSize: 15),
                ),
              ),
              accessAsync.maybeWhen(
                data: (status) {
                  final (label, type) = _chipFor(status);
                  return AeraStatusChip(
                    label: label,
                    type: type,
                    showDot: true,
                  );
                },
                orElse: () => const SizedBox.shrink(),
              ),
            ],
          ),
          const SizedBox(height: 8),
          accessAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: SizedBox(
                height: 18,
                width: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
            error: (error, _) => Row(
              children: [
                Expanded(
                  child: Text(
                    error is ApiException
                        ? error.message
                        : 'Could not load portal status',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.danger,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(jobPortalAccessProvider(_job.id)),
                  child: const Text('Retry'),
                ),
              ],
            ),
            data: (status) {
              final detail = _detailFor(status);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (detail != null)
                    Text(
                      detail,
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.inkSoft,
                      ),
                    ),
                  const SizedBox(height: 12),
                  if (status != null && status.isActive) ...[
                    Row(
                      children: [
                        Expanded(
                          child: AeraButton(
                            text: 'Reissue link',
                            variant: AeraButtonVariant.secondary,
                            isLoading: _busy,
                            onPressed: _busy
                                ? null
                                : () => _send(reissue: true),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: AeraButton(
                            text: 'Deactivate',
                            variant: AeraButtonVariant.danger,
                            isLoading: _busy,
                            onPressed: _busy ? null : _deactivate,
                          ),
                        ),
                      ],
                    ),
                  ] else
                    AeraButton(
                      text: status == null ? 'Send link' : 'Send new link',
                      icon: const Icon(
                        Icons.send_rounded,
                        size: 18,
                        color: Colors.white,
                      ),
                      isLoading: _busy,
                      onPressed: _busy
                          ? null
                          : () => _send(reissue: status != null),
                    ),
                  if (_lastIssuedLink != null) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: AeraButton(
                            text: 'Copy link',
                            variant: AeraButtonVariant.outline,
                            onPressed: () {
                              Clipboard.setData(
                                ClipboardData(text: _lastIssuedLink!),
                              );
                              _snack('Link copied');
                            },
                          ),
                        ),
                        if (_job.customer.phone != null) ...[
                          const SizedBox(width: 10),
                          Expanded(
                            child: AeraButton(
                              text: 'WhatsApp',
                              variant: AeraButtonVariant.secondary,
                              onPressed: () => _sendWhatsApp(_lastIssuedLink!),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              );
            },
          ),
          if (_job.status == 'EN_ROUTE') ...[
            const Divider(color: AeraColors.line, height: 28),
            Text(
              'Technician waiting on the customer code?',
              style: AeraTypography.bodyMedium.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Override start begins the job without the code and is '
              'fully audited.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 10),
            AeraButton(
              text: 'Override start',
              variant: AeraButtonVariant.outline,
              isLoading: _busy,
              onPressed: _busy ? null : _overrideStart,
            ),
          ],
        ],
      ),
    );
  }
}
