import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens a maps application for a given address text.
/// On Android, uses the geo: URI scheme to open the default maps app.
/// On iOS, web, or if geo: fails, opens OpenStreetMap's search page.
/// Returns false if both attempts fail.
Future<bool> openMapsForAddress(
  String addressText, {
  bool directions = false,
}) async {
  final encodedAddress = Uri.encodeComponent(addressText);

  // On Android, try geo: URI first
  if (!kIsWeb && Platform.isAndroid) {
    final geoUri = Uri.parse('geo:0,0?q=$encodedAddress');
    try {
      final launched = await launchUrl(
        geoUri,
        mode: LaunchMode.externalApplication,
      );
      if (launched) return true;
    } catch (_) {
      // Fall through to OSM web
    }
  }

  // Fallback: OpenStreetMap search (works on all platforms)
  final osmUri = Uri.parse(
    'https://www.openstreetmap.org/search?query=$encodedAddress',
  );
  try {
    return await launchUrl(osmUri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}
