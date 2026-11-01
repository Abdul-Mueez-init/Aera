import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../../../core/network/api_client.dart';

final onboardingRepositoryProvider = Provider<OnboardingRepository>((ref) {
  return OnboardingRepository(ref.watch(apiClientProvider));
});

class OnboardingService {
  const OnboardingService({
    this.id,
    this.serviceKey,
    required this.name,
    required this.iconKey,
    required this.isCustom,
  });

  final String? id;
  final String? serviceKey;
  final String name;
  final String iconKey;
  final bool isCustom;

  factory OnboardingService.fromJson(Map<String, dynamic> json) =>
      OnboardingService(
        id: json['id'] as String?,
        serviceKey: json['serviceKey'] as String?,
        name: json['name'] as String,
        iconKey: json['iconKey'] as String,
        isCustom: json['isCustom'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
    if (serviceKey != null) 'serviceKey': serviceKey,
    'name': name,
    'iconKey': iconKey,
    'isCustom': isCustom,
  };
}

class ServiceZone {
  const ServiceZone({
    this.id,
    required this.placeId,
    required this.name,
    required this.latitude,
    required this.longitude,
  });

  final String? id;
  final String placeId;
  final String name;
  final double latitude;
  final double longitude;

  bool get isCustom => placeId.startsWith('custom:');

  factory ServiceZone.fromJson(Map<String, dynamic> json) => ServiceZone(
    id: json['id'] as String?,
    placeId: (json['providerPlaceId'] ?? json['placeId']) as String,
    name: json['name'] as String,
    latitude: _asDouble(json['latitude']),
    longitude: _asDouble(json['longitude']),
  );
}

class GeocodedLocation {
  const GeocodedLocation({
    required this.address,
    required this.latitude,
    required this.longitude,
  });
  final String address;
  final double latitude;
  final double longitude;

  factory GeocodedLocation.fromJson(Map<String, dynamic> json) =>
      GeocodedLocation(
        address: json['address'] as String,
        latitude: _asDouble(json['latitude']),
        longitude: _asDouble(json['longitude']),
      );
}

class OnboardingProfile {
  const OnboardingProfile({
    required this.id,
    required this.name,
    required this.defaultCurrency,
    required this.onboardingStep,
    this.phone,
    this.taxId,
    this.logoObjectKey,
    this.headquartersAddress,
    this.headquartersLatitude,
    this.headquartersLongitude,
    this.serviceRadiusKm,
    this.onboardingCompletedAt,
    this.services = const [],
    this.serviceZones = const [],
  });

  final String id;
  final String name;
  final String defaultCurrency;
  final int onboardingStep;
  final String? phone;
  final String? taxId;
  final String? logoObjectKey;
  final String? headquartersAddress;
  final double? headquartersLatitude;
  final double? headquartersLongitude;
  final int? serviceRadiusKm;
  final DateTime? onboardingCompletedAt;
  final List<OnboardingService> services;
  final List<ServiceZone> serviceZones;

  factory OnboardingProfile.fromJson(Map<String, dynamic> json) =>
      OnboardingProfile(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        defaultCurrency: json['defaultCurrency'] as String? ?? 'USD',
        onboardingStep: (json['onboardingStep'] as num?)?.toInt() ?? 1,
        phone: json['phone'] as String?,
        taxId: json['taxId'] as String?,
        logoObjectKey: json['logoObjectKey'] as String?,
        headquartersAddress: json['headquartersAddress'] as String?,
        headquartersLatitude: _nullableDouble(json['headquartersLatitude']),
        headquartersLongitude: _nullableDouble(json['headquartersLongitude']),
        serviceRadiusKm: (json['serviceRadiusKm'] as num?)?.toInt(),
        onboardingCompletedAt: json['onboardingCompletedAt'] == null
            ? null
            : DateTime.tryParse(json['onboardingCompletedAt'] as String),
        services: (json['services'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(OnboardingService.fromJson)
            .toList(growable: false),
        serviceZones: (json['serviceZones'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ServiceZone.fromJson)
            .toList(growable: false),
      );
}

class OnboardingRepository {
  OnboardingRepository(this._client);
  final ApiClient _client;

  Future<String> presignLogo(String mimeType) async {
    final presign =
        await _client.post(
              '/api/v1/companies/current/onboarding/logo/presign',
              body: {'mimeType': mimeType},
            )
            as Map<String, dynamic>;
    return presign['uploadUrl'] as String;
  }

  Future<String> uploadLogoToPresignedUrl({
    required String uploadUrl,
    required String mimeType,
    required List<int> bytes,
  }) async {
    final uploadResponse = await http
        .put(
          Uri.parse(uploadUrl),
          headers: {'Content-Type': mimeType},
          body: bytes,
        )
        .timeout(const Duration(seconds: 45));
    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw Exception(
        'The image could not be uploaded. Check your connection and retry.',
      );
    }
    return uploadResponse.headers['x-amz-version-id'] ?? '';
  }

  Future<List<ServiceZone>> findZones({
    required double latitude,
    required double longitude,
    required int radiusKm,
  }) async {
    final response = await _client.get(
      '/api/v1/companies/current/onboarding/zones',
      queryParameters: {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'radiusKm': radiusKm.toString(),
      },
    );
    return (response as List<dynamic>)
        .whereType<Map<String, dynamic>>()
        .map(ServiceZone.fromJson)
        .toList(growable: false);
  }

  Future<GeocodedLocation> reverseGeocode({
    required double latitude,
    required double longitude,
  }) async {
    final response = await _client.get(
      '/api/v1/companies/current/onboarding/reverse-geocode',
      queryParameters: {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
      },
    );
    return GeocodedLocation.fromJson(response as Map<String, dynamic>);
  }

  Future<GeocodedLocation> searchAddress(String address) async {
    final response = await _client.get(
      '/api/v1/companies/current/onboarding/geocode',
      queryParameters: {'address': address.trim()},
    );
    return GeocodedLocation.fromJson(response as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> completeOnboarding({
    required Map<String, dynamic> business,
    required Map<String, dynamic> area,
    required Map<String, dynamic> services,
    String? logoObjectKey,
    String? logoMimeType,
    int? logoSizeBytes,
  }) async {
    final body = <String, dynamic>{
      'business': business,
      'area': area,
      'services': services,
    };
    if (logoObjectKey != null) {
      body['logoObjectKey'] = logoObjectKey;
      body['logoMimeType'] = logoMimeType;
      body['logoSizeBytes'] = logoSizeBytes;
    }
    final response = await _client.post(
      '/api/v1/companies/current/onboarding/complete',
      body: body,
    );
    return response as Map<String, dynamic>;
  }
}

double _asDouble(dynamic value) => _nullableDouble(value) ?? 0;

double? _nullableDouble(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}
