import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the mobile portal session token lives between app launches.
///
/// On mobile the link exchange is done with `deliver: "bearer"`, so the
/// returned session token must be kept somewhere device-bound and private:
/// the platform keystore via [FlutterSecureStorage] (handoff 6.2). On web
/// the session is an HttpOnly cookie managed by the browser, so this store
/// is a no-op there — nothing about the portal session is ever written to
/// web storage.
class PortalSessionStore {
  PortalSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const String storageKey = 'portal_session_v1';

  final FlutterSecureStorage _storage;

  Future<String?> read() async {
    if (kIsWeb) return null;
    try {
      return await _storage.read(key: storageKey);
    } catch (_) {
      // Undecryptable value (e.g. restored from a backup onto a phone
      // without the key): treat as "no session" — the customer can open a
      // fresh link. Never crash startup on storage problems.
      return null;
    }
  }

  Future<void> write(String sessionToken) async {
    if (kIsWeb) return;
    await _storage.write(key: storageKey, value: sessionToken);
  }

  Future<void> clear() async {
    if (kIsWeb) return;
    try {
      await _storage.delete(key: storageKey);
    } catch (_) {
      // Best effort: logout already revoked the session server-side.
    }
  }
}
