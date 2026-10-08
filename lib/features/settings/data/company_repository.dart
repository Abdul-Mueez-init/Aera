import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final companyRepositoryProvider = Provider<CompanyRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return CompanyRepository(client);
});

class Company {
  const Company({
    required this.id,
    required this.name,
    required this.slug,
    required this.timezone,
    required this.defaultCurrency,
  });

  final String id;
  final String name;
  final String slug;
  final String timezone;
  final String defaultCurrency;

  factory Company.fromJson(Map<String, dynamic> json) => Company(
    id: json['id'] as String,
    name: json['name'] as String,
    slug: json['slug'] as String,
    timezone: json['timezone'] as String? ?? 'UTC',
    defaultCurrency: json['defaultCurrency'] as String? ?? 'USD',
  );
}

class CreateCompanyInput {
  const CreateCompanyInput({
    required this.name,
    this.slug,
    this.timezone = 'UTC',
    this.defaultCurrency = 'USD',
  });

  final String name;
  final String? slug;
  final String timezone;
  final String defaultCurrency;

  Map<String, dynamic> toJson() => {
    'name': name.trim(),
    if (slug != null && slug!.trim().isNotEmpty) 'slug': slug!.trim(),
    'timezone': timezone,
    'defaultCurrency': defaultCurrency,
  };
}

class UpdateCompanyInput {
  const UpdateCompanyInput({
    this.name,
    this.timezone,
    this.defaultCurrency,
  });

  final String? name;
  final String? timezone;
  final String? defaultCurrency;

  Map<String, dynamic> toJson() => {
    if (name != null && name!.trim().isNotEmpty) 'name': name!.trim(),
    if (timezone != null) 'timezone': timezone,
    if (defaultCurrency != null) 'defaultCurrency': defaultCurrency,
  };
}

class CompanyRepository {
  CompanyRepository(this._client);

  final ApiClient _client;

  Future<Company> createCompany(CreateCompanyInput input) async {
    final res = await _client.post(
      '/api/v1/companies',
      body: input.toJson(),
    );
    return Company.fromJson(res as Map<String, dynamic>);
  }

  Future<Company> getCurrentCompany() async {
    final res = await _client.get('/api/v1/companies/current');
    return Company.fromJson(res as Map<String, dynamic>);
  }

  Future<Company> updateCompany(UpdateCompanyInput input) async {
    final res = await _client.patch(
      '/api/v1/companies/current',
      body: input.toJson(),
    );
    return Company.fromJson(res as Map<String, dynamic>);
  }
}
