import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the signed-in session (as one JSON string) is kept on this device.
///
/// A tiny interface so [AuthRepository] never knows which storage is used,
/// and tests can swap in an in-memory version.
abstract class SessionStore {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> delete();
}

final sessionStoreProvider = Provider<SessionStore>(
  (ref) => SecureSessionStore(),
);

/// Keeps the session in the platform keystore (Android Keystore-backed
/// encrypted storage) instead of a plain, readable preferences file.
///
/// Older app versions saved the session in SharedPreferences. On the first
/// read, that old copy is moved here and then deleted, so people who are
/// already signed in stay signed in.
class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const String storageKey = 'aera_auth_session';

  /// The key the previous app version used in SharedPreferences.
  static const String legacyPrefsKey = 'aera_auth_session';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() async {
    String? secure;
    try {
      secure = await _storage.read(key: storageKey);
    } catch (_) {
      // The stored value cannot be decrypted (for example it was restored
      // from a backup onto a phone that does not have the key). Forget it:
      // the user just signs in again. Never crash the app on startup.
      try {
        await _storage.delete(key: storageKey);
      } catch (_) {}
      secure = null;
    }
    if (secure != null && secure.isNotEmpty) return secure;
    return _migrateLegacy();
  }

  @override
  Future<void> write(String value) async {
    await _storage.write(key: storageKey, value: value);
    // A fresh session replaces any old plain-text copy.
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(legacyPrefsKey);
  }

  @override
  Future<void> delete() async {
    try {
      await _storage.delete(key: storageKey);
    } catch (_) {
      // Signing out must always finish.
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(legacyPrefsKey);
  }

  Future<String?> _migrateLegacy() async {
    final prefs = await SharedPreferences.getInstance();
    final legacy = prefs.getString(legacyPrefsKey);
    if (legacy == null || legacy.isEmpty) return null;
    try {
      await _storage.write(key: storageKey, value: legacy);
    } catch (_) {
      // Could not move it yet: keep the old copy and retry next launch.
      return legacy;
    }
    await prefs.remove(legacyPrefsKey);
    return legacy;
  }
}
