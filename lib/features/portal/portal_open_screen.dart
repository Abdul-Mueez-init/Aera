import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_button.dart';
import 'data/portal_repository.dart';
import 'providers/portal_provider.dart';

/// The link landing screen (`/open#t=…`, handoff 6.3).
///
/// Reads the one-time token out of the URL fragment, establishes the
/// portal session via [PortalSessionController.bootstrap] (existing
/// session first, then the exchange), and routes onward:
/// active → `/p` (which drops the fragment — and the token — from the
/// URL), closed → `/p/closed`. The token is never put in a route param,
/// a logging provider, or analytics.
class PortalOpenScreen extends ConsumerStatefulWidget {
  const PortalOpenScreen({super.key, this.fragment});

  /// The URL fragment (`t=…`) as delivered by the router for deep links.
  /// On web, when not supplied, `Uri.base.fragment` is read instead.
  final String? fragment;

  @override
  ConsumerState<PortalOpenScreen> createState() => _PortalOpenScreenState();
}

class _PortalOpenScreenState extends ConsumerState<PortalOpenScreen> {
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _open());
  }

  String get _effectiveFragment {
    final fromRoute = widget.fragment;
    if (fromRoute != null && fromRoute.isNotEmpty) return fromRoute;
    if (kIsWeb) return Uri.base.fragment;
    return '';
  }

  Future<void> _open() async {
    if (!mounted) return;
    setState(() => _failed = false);
    final token = parsePortalFragment(_effectiveFragment);
    final outcome = await ref
        .read(portalSessionControllerProvider.notifier)
        .bootstrap(fragmentToken: token);
    if (!mounted) return;
    switch (outcome) {
      case PortalBootstrapOutcome.active:
        context.go('/p');
      case PortalBootstrapOutcome.closed:
        context.go('/p/closed');
      case PortalBootstrapOutcome.error:
        setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: _failed
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.wifi_off_outlined,
                        size: 40,
                        color: AeraColors.warning,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'We could not open your link just now.',
                        textAlign: TextAlign.center,
                        style: AeraTypography.h3.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Check your connection and try again.',
                        textAlign: TextAlign.center,
                        style: AeraTypography.body.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 20),
                      AeraButton(
                        text: 'Try again',
                        isFullWidth: false,
                        onPressed: _open,
                      ),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: 16),
                      Text(
                        'Opening your service portal…',
                        style: AeraTypography.body.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
