import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/booking_repository.dart';

final bookingConfigProvider = FutureProvider<BookingConfig>((ref) {
  return ref.watch(bookingRepositoryProvider).getConfig();
});
