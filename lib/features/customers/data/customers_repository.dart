import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final customersRepositoryProvider = Provider<CustomersRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return CustomersRepository(client);
});

class ServiceAddress {
  const ServiceAddress({
    required this.id,
    required this.label,
    required this.line1,
    this.line2,
    required this.city,
    this.region,
    this.postalCode,
    required this.countryCode,
  });

  final String id;
  final String label;
  final String line1;
  final String? line2;
  final String city;
  final String? region;
  final String? postalCode;
  final String countryCode;

  String get formatted => [
    line1,
    if (line2 != null && line2!.isNotEmpty) line2,
    city,
  ].whereType<String>().join(', ');

  factory ServiceAddress.fromJson(Map<String, dynamic> json) => ServiceAddress(
    id: json['id'] as String,
    label: json['label'] as String? ?? 'Primary',
    line1: json['line1'] as String? ?? '',
    line2: json['line2'] as String?,
    city: json['city'] as String? ?? '',
    region: json['region'] as String?,
    postalCode: json['postalCode'] as String?,
    countryCode: json['countryCode'] as String? ?? 'US',
  );
}

class Customer {
  const Customer({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.email,
    this.phone,
    this.notes,
    required this.status,
    this.serviceAddresses = const [],
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? email;
  final String? phone;
  final String? notes;
  final String status;
  final List<ServiceAddress> serviceAddresses;

  String get fullName => '$firstName $lastName'.trim();

  String get initials {
    final parts = fullName.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  factory Customer.fromJson(Map<String, dynamic> json) => Customer(
    id: json['id'] as String,
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
    email: json['email'] as String?,
    phone: json['phone'] as String?,
    notes: json['notes'] as String?,
    status: json['status'] as String? ?? 'ACTIVE',
    serviceAddresses:
        (json['serviceAddresses'] as List<dynamic>?)
            ?.map((a) => ServiceAddress.fromJson(a as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

class PaginatedCustomers {
  const PaginatedCustomers({required this.items, required this.meta});

  final List<Customer> items;
  final PageMeta meta;
}

class PageMeta {
  const PageMeta({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.pageCount,
  });

  final int page;
  final int pageSize;
  final int total;
  final int pageCount;

  factory PageMeta.fromJson(Map<String, dynamic> json) => PageMeta(
    page: json['page'] as int? ?? 1,
    pageSize: json['pageSize'] as int? ?? 20,
    total: json['total'] as int? ?? 0,
    pageCount: json['pageCount'] as int? ?? 0,
  );
}

class CreateCustomerInput {
  const CreateCustomerInput({
    required this.firstName,
    required this.lastName,
    this.email,
    this.phone,
    this.notes,
    this.address,
  });

  final String firstName;
  final String lastName;
  final String? email;
  final String? phone;
  final String? notes;
  final CreateAddressInput? address;
}

class CreateAddressInput {
  const CreateAddressInput({
    required this.label,
    required this.line1,
    this.line2,
    required this.city,
    this.region,
    this.postalCode,
    required this.countryCode,
  });

  final String label;
  final String line1;
  final String? line2;
  final String city;
  final String? region;
  final String? postalCode;
  final String countryCode;

  Map<String, dynamic> toJson() => {
    'label': label,
    'line1': line1,
    if (line2 != null && line2!.isNotEmpty) 'line2': line2,
    'city': city,
    if (region != null && region!.isNotEmpty) 'region': region,
    if (postalCode != null && postalCode!.isNotEmpty) 'postalCode': postalCode,
    'countryCode': countryCode,
  };
}

class CustomerJob {
  const CustomerJob({
    required this.id,
    required this.jobNumber,
    required this.serviceType,
    required this.problemDescription,
    required this.priority,
    required this.status,
    this.scheduledStart,
    this.scheduledEnd,
    this.completedAt,
    required this.createdAt,
    this.technicianName,
  });

  final String id;
  final int jobNumber;
  final String serviceType;
  final String problemDescription;
  final String priority;
  final String status;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final DateTime? completedAt;
  final DateTime createdAt;
  final String? technicianName;

  factory CustomerJob.fromJson(Map<String, dynamic> json) {
    final technician = json['assignedTechnician'] as Map<String, dynamic>?;
    final techName = technician != null
        ? '${technician['firstName'] ?? ''} ${technician['lastName'] ?? ''}'
              .trim()
        : null;
    return CustomerJob(
      id: json['id'] as String,
      jobNumber: json['jobNumber'] as int? ?? 0,
      serviceType: json['serviceType'] as String? ?? '',
      problemDescription: json['problemDescription'] as String? ?? '',
      priority: json['priority'] as String? ?? 'NORMAL',
      status: json['status'] as String? ?? 'NEW',
      scheduledStart: json['scheduledStart'] != null
          ? DateTime.tryParse(json['scheduledStart'] as String)
          : null,
      scheduledEnd: json['scheduledEnd'] != null
          ? DateTime.tryParse(json['scheduledEnd'] as String)
          : null,
      completedAt: json['completedAt'] != null
          ? DateTime.tryParse(json['completedAt'] as String)
          : null,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      technicianName: (techName == null || techName.isEmpty) ? null : techName,
    );
  }
}

class PaginatedCustomerJobs {
  const PaginatedCustomerJobs({required this.items, required this.meta});

  final List<CustomerJob> items;
  final PageMeta meta;
}

class CustomersRepository {
  CustomersRepository(this._client);

  final ApiClient _client;

  Future<PaginatedCustomers> listCustomers({
    int page = 1,
    int pageSize = 20,
    String? search,
  }) async {
    final res = await _client.get(
      '/api/v1/customers',
      queryParameters: {
        'page': page.toString(),
        'pageSize': pageSize.toString(),
        if (search != null && search.isNotEmpty) 'search': search,
      },
    );
    final map = res as Map<String, dynamic>;
    return PaginatedCustomers(
      items: (map['items'] as List<dynamic>)
          .map((c) => Customer.fromJson(c as Map<String, dynamic>))
          .toList(),
      meta: PageMeta.fromJson(map['meta'] as Map<String, dynamic>),
    );
  }

  Future<Customer> getCustomer(String customerId) async {
    final res = await _client.get('/api/v1/customers/$customerId');
    return Customer.fromJson(res as Map<String, dynamic>);
  }

  Future<Customer> createCustomer(CreateCustomerInput input) async {
    final res = await _client.post(
      '/api/v1/customers',
      body: {
        'firstName': input.firstName.trim(),
        'lastName': input.lastName.trim(),
        if (input.email != null && input.email!.isNotEmpty)
          'email': input.email!.trim(),
        if (input.phone != null && input.phone!.isNotEmpty)
          'phone': input.phone!.trim(),
        if (input.notes != null && input.notes!.isNotEmpty)
          'notes': input.notes!.trim(),
      },
    );
    var customer = Customer.fromJson(res as Map<String, dynamic>);

    if (input.address != null) {
      final addrRes = await _client.post(
        '/api/v1/customers/${customer.id}/addresses',
        body: input.address!.toJson(),
      );
      final addr = ServiceAddress.fromJson(addrRes as Map<String, dynamic>);
      customer = Customer(
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes,
        status: customer.status,
        serviceAddresses: [addr],
      );
    }

    return customer;
  }

  /// Updates the given customer. Fields left null/empty are left unchanged —
  /// the backend's PATCH schema has no way to explicitly clear
  /// email/phone/notes to blank; this mirrors that constraint on purpose
  /// rather than sending values the API would reject.
  Future<Customer> updateCustomer(
    String customerId, {
    String? firstName,
    String? lastName,
    String? email,
    String? phone,
    String? notes,
  }) async {
    final body = <String, dynamic>{
      if (firstName != null && firstName.trim().isNotEmpty)
        'firstName': firstName.trim(),
      if (lastName != null && lastName.trim().isNotEmpty)
        'lastName': lastName.trim(),
      if (email != null && email.trim().isNotEmpty) 'email': email.trim(),
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
    };
    final res = await _client.patch(
      '/api/v1/customers/$customerId',
      body: body,
    );
    return Customer.fromJson(res as Map<String, dynamic>);
  }

  Future<void> archiveCustomer(String customerId) async {
    await _client.delete('/api/v1/customers/$customerId');
  }

  Future<PaginatedCustomerJobs> getCustomerJobs(
    String customerId, {
    int page = 1,
    int pageSize = 20,
  }) async {
    final res = await _client.get(
      '/api/v1/customers/$customerId/jobs',
      queryParameters: {
        'page': page.toString(),
        'pageSize': pageSize.toString(),
      },
    );
    final map = res as Map<String, dynamic>;
    return PaginatedCustomerJobs(
      items: (map['items'] as List<dynamic>)
          .map((j) => CustomerJob.fromJson(j as Map<String, dynamic>))
          .toList(),
      meta: PageMeta.fromJson(map['meta'] as Map<String, dynamic>),
    );
  }
}
