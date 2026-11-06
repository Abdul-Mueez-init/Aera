import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import 'technician_repository.dart';

/// Result of attempting to start live location sharing for a job.
enum TrackingStartResult { started, permissionDenied, unavailable }

/// Posts the technician's position to `POST /jobs/:id/location` on a
/// battery-aware interval while the job is EN_ROUTE. The backend only
/// accepts updates while EN_ROUTE and wipes state on arrival, so this
/// service is a dumb periodic pumper — all gating is server-side.
///
/// Uses the foreground (when-in-use) permission only: updates pause when
/// the app is backgrounded, which is acceptable because the customer
/// tracking card already degrades to "stale" after two minutes.
class JobLocationTracker {
  JobLocationTracker(this._repo);

  final TechnicianRepository _repo;

  Timer? _timer;
  bool _posting = false;

  /// ~20s cadence balances freshness against battery; the customer UI
  /// polls every 15s and treats >2min-old fixes as stale anyway.
  static const _interval = Duration(seconds: 20);

  Future<TrackingStartResult> start(String jobId) async {
    stop();

    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return TrackingStartResult.permissionDenied;
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        return TrackingStartResult.unavailable;
      }
    } catch (_) {
      // Platform plugin unavailable (tests, unsupported device) — treat
      // as unavailable rather than crashing the screen.
      return TrackingStartResult.unavailable;
    }

    // Post once immediately so the customer sees movement right away.
    await _post(jobId);
    _timer = Timer.periodic(_interval, (_) => _post(jobId));
    return TrackingStartResult.started;
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _post(String jobId) async {
    if (_posting) return;
    _posting = true;
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      await _repo.updateLocation(
        jobId,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      );
    } catch (_) {
      // Offline / permission revoked mid-route / job left EN_ROUTE —
      // all recoverable; the next tick retries. Never crash the UI.
    } finally {
      _posting = false;
    }
  }
}

final jobLocationTrackerProvider = Provider<JobLocationTracker>((ref) {
  final tracker = JobLocationTracker(ref.watch(technicianRepositoryProvider));
  ref.onDispose(tracker.stop);
  return tracker;
});
