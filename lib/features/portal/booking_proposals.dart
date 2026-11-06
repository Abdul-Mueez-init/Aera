import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/aera_typography.dart';
import 'data/portal_repository.dart';

/// Phase 5.6 — customer appointment proposals. Renders OPEN proposals as
/// pickable windows and PICKED proposals with a confirm-booking action
/// (creates a short-lived hold, then confirms it atomically server-side).
class BookingProposals extends ConsumerStatefulWidget {
  const BookingProposals({
    required this.proposals,
    this.fallbackRequestId,
    super.key,
  });

  final List<dynamic> proposals;

  /// Used when a proposal carries no quote/job reference of its own.
  final String? fallbackRequestId;

  @override
  ConsumerState<BookingProposals> createState() => _BookingProposalsState();
}

class _BookingProposalsState extends ConsumerState<BookingProposals> {
  final Set<String> _busy = {};
  final Set<String> _confirmed = {};
  // proposalId → locally picked window (optimistic after pick succeeds)
  final Map<String, Map<String, dynamic>> _picked = {};

  String _fmt(dynamic iso) {
    final parsed = DateTime.tryParse(iso?.toString() ?? '');
    if (parsed == null) return iso?.toString() ?? '';
    final local = parsed.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '${local.month}/${local.day} $hh:$mm';
  }

  List<Map<String, dynamic>> _windows(Map<String, dynamic> proposal) {
    final raw = proposal['windows'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((w) => Map<String, dynamic>.from(w))
        .toList();
  }

  Map<String, dynamic>? _pickedWindow(Map<String, dynamic> proposal) {
    final local = _picked[proposal['id']?.toString()];
    if (local != null) return local;
    final raw = proposal['pickedWindow'];
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return null;
  }

  Future<void> _pick(
    Map<String, dynamic> proposal,
    Map<String, dynamic> window,
  ) async {
    final id = proposal['id']?.toString();
    if (id == null || _busy.contains(id)) return;
    setState(() => _busy.add(id));
    final result = await ref
        .read(portalRepositoryProvider)
        .pickAppointmentProposal(
          id,
          DateTime.parse(window['startsAt'].toString()),
          DateTime.parse(window['endsAt'].toString()),
        );
    if (!mounted) return;
    setState(() {
      _busy.remove(id);
      if (result is PortalSessionActive) {
        _picked[id] = window;
      }
    });
    if (result is PortalFailure) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.message)));
    }
  }

  Future<void> _confirm(Map<String, dynamic> proposal) async {
    final id = proposal['id']?.toString();
    if (id == null || _busy.contains(id)) return;
    final window = _pickedWindow(proposal);
    if (window == null) return;
    final reference =
        proposal['quoteId']?.toString() ??
        proposal['jobId']?.toString() ??
        widget.fallbackRequestId;
    if (reference == null) return;
    setState(() => _busy.add(id));
    final repository = ref.read(portalRepositoryProvider);
    final isQuote = proposal['quoteId'] != null;
    final isJob = proposal['jobId'] != null;
    final hold = await repository.createBookingHold(
      quoteId: isQuote ? reference : null,
      jobId: isJob ? reference : null,
      requestId: (!isQuote && !isJob) ? reference : null,
      windowStart: DateTime.parse(window['startsAt'].toString()),
      windowEnd: DateTime.parse(window['endsAt'].toString()),
    );
    String? holdId;
    if (hold is PortalSessionActive) {
      holdId = hold.workspace?['id']?.toString();
    }
    PortalResult confirmResult = hold;
    if (holdId != null) {
      confirmResult = await repository.confirmBookingHold(holdId);
    }
    if (!mounted) return;
    setState(() {
      _busy.remove(id);
      if (confirmResult is PortalSessionActive) _confirmed.add(id);
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          confirmResult is PortalSessionActive
              ? 'Appointment confirmed'
              : confirmResult is PortalFailure
              ? confirmResult.message
              : 'Could not confirm booking',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.proposals.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final raw in widget.proposals)
          if (raw is Map) _proposalCard(Map<String, dynamic>.from(raw)),
      ],
    );
  }

  Widget _proposalCard(Map<String, dynamic> proposal) {
    final id = proposal['id']?.toString() ?? '';
    final status = proposal['status']?.toString() ?? '';
    final busy = _busy.contains(id);
    final done = _confirmed.contains(id) || status == 'EXPIRED';
    final picked = _pickedWindow(proposal);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              status == 'PICKED' || picked != null
                  ? 'Selected: ${_fmt(picked?['startsAt'])}'
                  : 'Appointment options',
              style: AeraTypography.labelUpper,
            ),
            if (status == 'OPEN' && picked == null) ...[
              const SizedBox(height: 8),
              for (final window in _windows(proposal))
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: OutlinedButton(
                    onPressed: busy ? null : () => _pick(proposal, window),
                    child: Text(
                      '${_fmt(window['startsAt'])} – ${_fmt(window['endsAt'])}',
                    ),
                  ),
                ),
            ],
            if ((status == 'PICKED' || picked != null) && !done) ...[
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: busy ? null : () => _confirm(proposal),
                icon: busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.event_available, size: 18),
                label: const Text('Confirm booking'),
              ),
            ],
            if (done && _confirmed.contains(id))
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Booking confirmed'),
              ),
          ],
        ),
      ),
    );
  }
}
