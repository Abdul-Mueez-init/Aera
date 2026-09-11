import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../../../core/network/api_client.dart';
import '../../jobs/data/jobs_repository.dart' show Job, JobPhoto, JobPart;

final technicianRepositoryProvider = Provider<TechnicianRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return TechnicianRepository(client);
});

/// Result of `POST /jobs/:jobId/photos/presign` — a short-lived Supabase
/// Storage signed upload URL, not a value the client should cache.
class PresignedPhotoUpload {
  const PresignedPhotoUpload({
    required this.objectKey,
    required this.uploadUrl,
    required this.expiresAt,
  });

  final String objectKey;
  final String uploadUrl;
  final DateTime expiresAt;

  factory PresignedPhotoUpload.fromJson(Map<String, dynamic> json) =>
      PresignedPhotoUpload(
        objectKey: json['objectKey'] as String? ?? '',
        uploadUrl: json['uploadUrl'] as String? ?? '',
        expiresAt:
            DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
            DateTime.now(),
      );
}

class TechnicianRepository {
  TechnicianRepository(this._client);

  final ApiClient _client;

  /// Backs the Technician Home screen. Same `jobSelect()` shape as
  /// `GET /jobs/:jobId`, so plain `Job.fromJson` is safe here — no photos/
  /// parts/notes on this endpoint (those only appear on job detail), which
  /// `Job.fromJson` already defaults to empty lists for.
  Future<List<Job>> getToday(DateTime date) async {
    final formatted =
        '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';
    final res = await _client.get(
      '/api/v1/jobs/today',
      queryParameters: {'date': formatted},
    );
    final map = res as Map<String, dynamic>;
    return (map['jobs'] as List<dynamic>)
        .map((j) => Job.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  /// Step 1 of the two-call photo flow: ask the backend for a signed,
  /// tenant-scoped Supabase Storage upload URL.
  Future<PresignedPhotoUpload> presignPhoto(
    String jobId,
    String mimeType,
  ) async {
    final res = await _client.post(
      '/api/v1/jobs/$jobId/photos/presign',
      body: {'mimeType': mimeType},
    );
    return PresignedPhotoUpload.fromJson(res as Map<String, dynamic>);
  }

  /// Step 2 of the direct-to-Supabase upload — this is a raw PUT straight
  /// to Storage, never through `ApiClient`/our API, so it deliberately
  /// bypasses the usual auth headers. This is the one legitimate place in
  /// the app that uses `http` outside `ApiClient`; do not "fix" this to
  /// route through `ApiClient`, it would break the signed-URL contract.
  Future<void> uploadPhotoBytes({
    required String uploadUrl,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    final response = await http.put(
      Uri.parse(uploadUrl),
      headers: {'Content-Type': mimeType},
      body: bytes,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        'Photo upload failed (${response.statusCode}): ${response.body}',
      );
    }
  }

  /// Step 3: confirm the upload so the backend records the DB row.
  Future<JobPhoto> confirmPhoto(
    String jobId, {
    required String objectKey,
    required String mimeType,
    required int sizeBytes,
    String kind = 'OTHER',
    String? caption,
  }) async {
    final res = await _client.post(
      '/api/v1/jobs/$jobId/photos',
      body: {
        'objectKey': objectKey,
        'mimeType': mimeType,
        'sizeBytes': sizeBytes,
        'kind': kind,
        if (caption != null && caption.trim().isNotEmpty)
          'caption': caption.trim(),
      },
    );
    return JobPhoto.fromJson(res as Map<String, dynamic>);
  }

  Future<JobPart> addPart(
    String jobId, {
    required String name,
    required double quantity,
    required int unitPriceMinor,
    required String currency,
  }) async {
    final res = await _client.post(
      '/api/v1/jobs/$jobId/parts',
      body: {
        'name': name.trim(),
        'quantity': quantity,
        'unitPriceMinor': unitPriceMinor,
        'currency': currency.toUpperCase(),
      },
    );
    return JobPart.fromJson(res as Map<String, dynamic>);
  }

  Future<void> addNote(
    String jobId, {
    required String body,
    String visibility = 'INTERNAL',
  }) async {
    await _client.post(
      '/api/v1/jobs/$jobId/notes',
      body: {'body': body.trim(), 'visibility': visibility},
    );
  }
}

/// Maps a picked image file's extension to the mime type the backend's
/// presign/confirm schemas accept (`image/jpeg|png|webp` only — regex
/// enforced in `job.routes.ts`).
String? mimeTypeForImagePath(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}
