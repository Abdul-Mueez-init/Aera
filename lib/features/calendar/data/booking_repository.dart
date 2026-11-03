import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final bookingRepositoryProvider = Provider<BookingRepository>((ref) {
  return BookingRepository(ref.watch(apiClientProvider));
});

class BookingConfig {
  const BookingConfig({
    required this.bookingMode,
    required this.travelBufferMinutes,
    required this.timezone,
    required this.businessHours,
  });

  final String bookingMode;
  final int travelBufferMinutes;
  final String timezone;
  final List<BusinessHour> businessHours;

  factory BookingConfig.fromJson(Map<String, dynamic> json) {
    final company = json['company'] as Map<String, dynamic>? ?? const {};
    return BookingConfig(
      bookingMode: company['bookingMode'] as String? ?? 'DISPATCHER_CONFIRMS',
      travelBufferMinutes: company['travelBufferMinutes'] as int? ?? 0,
      timezone: company['timezone'] as String? ?? 'UTC',
      businessHours: (json['businessHours'] as List<dynamic>? ?? const [])
          .map((item) => BusinessHour.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class BusinessHour {
  const BusinessHour({
    required this.weekday,
    required this.open,
    required this.close,
  });

  final int weekday;
  final String open;
  final String close;

  factory BusinessHour.fromJson(Map<String, dynamic> json) => BusinessHour(
    weekday: json['weekday'] as int? ?? 0,
    open: json['open'] as String? ?? '09:00',
    close: json['close'] as String? ?? '17:00',
  );
}

class BookingRepository {
  BookingRepository(this._client);
  final ApiClient _client;

  Future<BookingConfig> getConfig() async {
    final response = await _client.get('/api/v1/booking/config');
    return BookingConfig.fromJson(response as Map<String, dynamic>);
  }

  Future<BookingConfig> updateConfig({
    required String bookingMode,
    required int travelBufferMinutes,
    required List<BusinessHour> businessHours,
  }) async {
    final response = await _client.patch(
      '/api/v1/booking/config',
      body: {
        'bookingMode': bookingMode,
        'travelBufferMinutes': travelBufferMinutes,
        'businessHours': businessHours
            .map(
              (hour) => {
                'weekday': hour.weekday,
                'open': hour.open,
                'close': hour.close,
              },
            )
            .toList(),
      },
    );
    return BookingConfig.fromJson(response as Map<String, dynamic>);
  }
}
