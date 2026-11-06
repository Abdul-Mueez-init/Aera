import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/portal_repository.dart';

/// The closed state of the portal, when access has ended. Written by
/// [PortalSessionController] and read by the closed screen — the *reason*
/// and the business contacts travel here, never in a route.
final portalClosedProvider = StateProvider<PortalClosed?>((ref) => null);

/// How a bootstrap attempt ended, so the open screen can navigate.
enum PortalBootstrapOutcome { active, closed, error }

/// Holds the portal snapshot for the one session on this device.
///
/// Not autoDispose: once a customer opens their link, the snapshot stays
/// cached for the rest of that browsing session. There is no token in this
/// state — identity is the server-side session (cookie or stored bearer),
/// established by [bootstrap].
final portalSessionControllerProvider =
    StateNotifierProvider<PortalSessionController, AsyncValue<PortalSnapshot>>(
      (ref) =>
          PortalSessionController(ref.watch(portalRepositoryProvider), ref),
    );

class PortalSessionController
    extends StateNotifier<AsyncValue<PortalSnapshot>> {
  PortalSessionController(this._repository, this._ref)
    : super(const AsyncValue.loading());

  final PortalRepository _repository;
  final Ref _ref;

  bool _bootstrapped = false;

  /// Establishes the session for the portal screens.
  ///
  /// Order (handoff 6.3 + Phase 2): when the URL carries a link token, the
  /// exchange runs FIRST — a fresh link must replace any stale session on
  /// this device before anything renders, so old workspace data can never
  /// appear under a new link. Only when there is no token (or the exchange
  /// could not reach the server) does the existing session get probed.
  /// Ends in exactly one of active (snapshot loaded), closed (see
  /// [portalClosedProvider]) or error.
  Future<PortalBootstrapOutcome> bootstrap({String? fragmentToken}) async {
    _bootstrapped = true;
    state = const AsyncValue.loading();
    _ref.read(portalClosedProvider.notifier).state = null;

    PortalFailure? exchangeFailure;
    if (fragmentToken != null && fragmentToken.isNotEmpty) {
      final exchangeResult = await _repository.exchange(fragmentToken);
      if (exchangeResult is PortalSessionActive) {
        return _loadJob();
      }
      if (exchangeResult is PortalFailure) {
        // The exchange never got a definitive answer (and the token may or
        // may not have been burned), so fall through and probe the session.
        exchangeFailure = exchangeResult;
      } else {
        // The link itself is dead (invalid, already used, expired or
        // deactivated). A still-live session on this device keeps working —
        // e.g. the customer re-opened an already-consumed link — otherwise
        // the link's closed state is what the customer needs to see.
        final deadLinkSession = await _repository.session();
        if (deadLinkSession is PortalSessionActive) {
          return _loadJob();
        }
        if (exchangeResult is PortalClosed) {
          return _close(exchangeResult);
        }
        return _close(const PortalClosed(variant: PortalClosedVariant.invalid));
      }
    }

    final sessionResult = await _repository.session();
    if (sessionResult is PortalSessionActive) {
      return _loadJob();
    }
    if (sessionResult is PortalClosed) {
      return _close(sessionResult);
    }
    if (exchangeFailure != null) {
      // Exchange failed AND there is no usable session: retryable error,
      // not a dead portal — the customer should see "try again".
      state = AsyncValue.error(exchangeFailure.message, StackTrace.current);
      return PortalBootstrapOutcome.error;
    }
    if (sessionResult is PortalFailure) {
      state = AsyncValue.error(sessionResult.message, StackTrace.current);
      return PortalBootstrapOutcome.error;
    }

    // No live session and no link token: nothing to show.
    return _close(const PortalClosed(variant: PortalClosedVariant.invalid));
  }

  /// Bootstraps only if nobody has yet — used by the home screen when it is
  /// reached directly (e.g. app relaunch with a stored bearer session).
  Future<void> ensureBootstrapped() async {
    if (_bootstrapped) return;
    _bootstrapped = true;
    final sessionResult = await _repository.session();
    if (sessionResult is PortalSessionActive) {
      await _loadJob();
    } else if (sessionResult is PortalClosed) {
      _close(sessionResult);
    } else if (sessionResult is PortalFailure) {
      state = AsyncValue.error(sessionResult.message, StackTrace.current);
    } else {
      // No stored session at all: the portal is closed for this device.
      _close(const PortalClosed(variant: PortalClosedVariant.invalid));
    }
  }

  PortalBootstrapOutcome _close(PortalClosed closed) {
    _ref.read(portalClosedProvider.notifier).state = closed;
    return PortalBootstrapOutcome.closed;
  }

  Future<PortalBootstrapOutcome> _loadJob() async {
    final workspaceResult = await _repository.workspace();
    if (workspaceResult is PortalSessionActive &&
        workspaceResult.workspace != null) {
      return PortalBootstrapOutcome.active;
    }
    final result = await _repository.job();
    if (result is PortalSessionActive && result.snapshot != null) {
      state = AsyncValue.data(result.snapshot!);
      return PortalBootstrapOutcome.active;
    }
    if (result is PortalClosed) return _close(result);
    if (result is PortalInvalid) {
      return _close(const PortalClosed(variant: PortalClosedVariant.invalid));
    }
    final message = result is PortalFailure
        ? result.message
        : 'Could not load your service details';
    state = AsyncValue.error(message, StackTrace.current);
    return PortalBootstrapOutcome.error;
  }

  /// Reloads the snapshot. Keeps the current data on screen while loading;
  /// a closed result moves the portal to the closed state.
  Future<void> refresh() async {
    final result = await _repository.job();
    if (result is PortalSessionActive && result.snapshot != null) {
      state = AsyncValue.data(result.snapshot!);
    } else if (result is PortalClosed) {
      // Includes the 401 PORTAL_SESSION_EXPIRED mapping: a session that
      // expires while the page is open must move to the closed state,
      // not leave a stale snapshot on screen.
      _close(result);
    } else if (result is PortalInvalid) {
      _close(const PortalClosed(variant: PortalClosedVariant.invalid));
    } else if (!state.hasValue) {
      final message = result is PortalFailure
          ? result.message
          : 'Could not load your service details';
      state = AsyncValue.error(message, StackTrace.current);
    }
  }

  Future<PortalResult> respondToQuote(String quoteId, String action) async {
    final result = await _repository.respondToQuote(quoteId, action);
    if (result is PortalSessionActive) {
      await refresh();
    } else if (result is PortalClosed) {
      _close(result);
    }
    return result;
  }

  Future<PortalResult> submitReview(int rating, String? comment) async {
    final result = await _repository.submitReview(rating, comment);
    if (result is PortalSessionActive) {
      await refresh();
    } else if (result is PortalClosed) {
      _close(result);
    }
    return result;
  }

  Future<void> logout() async {
    await _repository.logout();
    _ref.read(portalClosedProvider.notifier).state = null;
    state = const AsyncValue.loading();
  }
}
