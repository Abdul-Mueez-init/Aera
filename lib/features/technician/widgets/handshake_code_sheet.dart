import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/network/api_response.dart';
import '../../../core/theme/aera_colors.dart';
import '../../../core/theme/aera_radii.dart';
import '../../../core/theme/aera_typography.dart';
import '../../../core/widgets/aera_button.dart';
import '../../jobs/data/jobs_repository.dart';

/// Bottom sheet where the assigned technician types the 6-digit code
/// the customer received (portal / SMS / email) to start an EN_ROUTE
/// job via `POST /jobs/:jobId/start`.
///
/// The sheet never receives, fetches or displays the expected code —
/// the field below is the only place a code exists, typed by hand.
///
/// Pops with:
/// - `true` when the job was started,
/// - a `String` error message the caller should show (e.g.
///   HANDSHAKE_NOT_AVAILABLE),
/// - `null` when dismissed.
class HandshakeCodeSheet extends ConsumerStatefulWidget {
  const HandshakeCodeSheet({
    super.key,
    required this.jobId,
    this.dispatchPhone,
  });

  final String jobId;

  /// Optional number for the "Call dispatch" action shown when the job
  /// is locked out. Null hides the button (no company phone is exposed
  /// on the job payload today).
  final String? dispatchPhone;

  @override
  ConsumerState<HandshakeCodeSheet> createState() => _HandshakeCodeSheetState();
}

class _HandshakeCodeSheetState extends ConsumerState<HandshakeCodeSheet> {
  final _controller = TextEditingController();
  bool _submitting = false;
  String? _error;
  bool _locked = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _canSubmit => _controller.text.length == 6 && !_submitting;

  Future<void> _submit() async {
    final code = _controller.text.trim();
    if (code.length != 6) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref
          .read(jobsRepositoryProvider)
          .startJobWithCode(widget.jobId, code);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      switch (e.code) {
        case 'HANDSHAKE_INVALID':
          // Server message carries the attempts remaining.
          setState(() {
            _error = e.message;
            _submitting = false;
          });
        case 'HANDSHAKE_LOCKED':
          setState(() {
            _locked = true;
            _submitting = false;
          });
        case 'HANDSHAKE_NOT_AVAILABLE':
          Navigator.of(context).pop(e.message);
        default:
          setState(() {
            _error = e.message;
            _submitting = false;
          });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not start the job. Check your connection and retry.';
          _submitting = false;
        });
      }
    }
  }

  Future<void> _callDispatch() async {
    final phone = widget.dispatchPhone;
    if (phone == null || phone.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    try {
      await launchUrl(uri);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not open the phone dialer for $phone');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: const BoxDecoration(
        color: AeraColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AeraColors.line,
                borderRadius: AeraRadii.borderFull,
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_locked) ..._lockedView() else ..._entryView(),
        ],
      ),
    );
  }

  List<Widget> _entryView() {
    return [
      Text(
        'Ask the customer for their code',
        style: AeraTypography.h3.copyWith(fontSize: 18),
      ),
      const SizedBox(height: 6),
      Text(
        'The customer got a 6-digit code when you set off. Type it here '
        'to start the job.',
        style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
      ),
      const SizedBox(height: 18),
      TextField(
        controller: _controller,
        autofocus: true,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(6),
        ],
        maxLength: 6,
        textAlign: TextAlign.center,
        style: AeraTypography.h2.copyWith(fontSize: 32, letterSpacing: 10),
        decoration: InputDecoration(
          counterText: '',
          hintText: '––––––',
          errorText: _error,
          border: OutlineInputBorder(borderRadius: AeraRadii.borderMd),
        ),
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _canSubmit ? _submit() : null,
      ),
      const SizedBox(height: 16),
      AeraButton(
        text: 'Start job',
        icon: const Icon(Icons.play_arrow, size: 18, color: Colors.white),
        isLoading: _submitting,
        onPressed: _canSubmit ? _submit : null,
      ),
      const SizedBox(height: 6),
      Center(
        child: TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ),
    ];
  }

  List<Widget> _lockedView() {
    return [
      Row(
        children: [
          const Icon(Icons.lock, size: 22, color: AeraColors.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Too many attempts',
              style: AeraTypography.h3.copyWith(fontSize: 18),
            ),
          ),
        ],
      ),
      const SizedBox(height: 8),
      Text(
        'Too many attempts. Locked — call dispatch. They can start the '
        'job for you, or wait for the lock to expire and try the code '
        'again.',
        style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
      ),
      if (_error != null) ...[
        const SizedBox(height: 8),
        Text(
          _error!,
          style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
        ),
      ],
      const SizedBox(height: 18),
      if (widget.dispatchPhone != null)
        AeraButton(
          text: 'Call dispatch',
          icon: const Icon(Icons.phone, size: 18, color: Colors.white),
          onPressed: _callDispatch,
        ),
      const SizedBox(height: 6),
      Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ),
    ];
  }
}
