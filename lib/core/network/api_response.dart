class ApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;
  final dynamic details;

  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.details,
  });

  @override
  String toString() => 'ApiException($statusCode, code: $code, message: $message)';
}
