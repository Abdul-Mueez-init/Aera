import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/onboarding_repository.dart';

/// In-memory wizard state for onboarding.
/// Never persisted to disk or SharedPreferences.
/// Scoped per signed-in user and reset on sign-out.
class OnboardingWizardState {
  const OnboardingWizardState({
    this.name = '',
    this.phone = '',
    this.taxId = '',
    this.currency = 'USD',
    this.logoBytes,
    this.logoFileName,
    this.latitude,
    this.longitude,
    this.radiusKm = 30,
    this.resolvedAddress,
    this.selectedZoneIds = const [],
    this.zoneObjects = const [],
    this.customZoneNames = const [],
    this.selectedServices = const [],
    this.teamInvites = const [],
  });

  final String name;
  final String phone;
  final String taxId;
  final String currency;
  final List<int>? logoBytes;
  final String? logoFileName;
  final double? latitude;
  final double? longitude;
  final int radiusKm;
  final String? resolvedAddress;
  final List<String> selectedZoneIds;
  final List<ServiceZone> zoneObjects;
  final List<String> customZoneNames;
  final List<OnboardingService> selectedServices;
  final List<TeamInviteDraft> teamInvites;

  bool get businessBasicsComplete =>
      name.trim().isNotEmpty &&
      phone.trim().isNotEmpty &&
      phone.length >= 7 &&
      phone.length <= 25;

  bool get serviceAreaComplete =>
      latitude != null &&
      longitude != null &&
      resolvedAddress != null &&
      radiusKm >= 10 &&
      radiusKm <= 50 &&
      (selectedZoneIds.isNotEmpty || customZoneNames.isNotEmpty);

  bool get servicesComplete => selectedServices.isNotEmpty;

  OnboardingWizardState copyWith({
    String? name,
    String? phone,
    String? taxId,
    String? currency,
    List<int>? logoBytes,
    String? logoFileName,
    double? latitude,
    double? longitude,
    int? radiusKm,
    String? resolvedAddress,
    List<String>? selectedZoneIds,
    List<ServiceZone>? zoneObjects,
    List<String>? customZoneNames,
    List<OnboardingService>? selectedServices,
    List<TeamInviteDraft>? teamInvites,
  }) {
    return OnboardingWizardState(
      name: name ?? this.name,
      phone: phone ?? this.phone,
      taxId: taxId ?? this.taxId,
      currency: currency ?? this.currency,
      logoBytes: logoBytes ?? this.logoBytes,
      logoFileName: logoFileName ?? this.logoFileName,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      radiusKm: radiusKm ?? this.radiusKm,
      resolvedAddress: resolvedAddress ?? this.resolvedAddress,
      selectedZoneIds: selectedZoneIds ?? this.selectedZoneIds,
      zoneObjects: zoneObjects ?? this.zoneObjects,
      customZoneNames: customZoneNames ?? this.customZoneNames,
      selectedServices: selectedServices ?? this.selectedServices,
      teamInvites: teamInvites ?? this.teamInvites,
    );
  }
}

class TeamInviteDraft {
  const TeamInviteDraft({
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  final String email;
  final String firstName;
  final String lastName;
  final String role;
}

class OnboardingWizardNotifier extends StateNotifier<OnboardingWizardState> {
  OnboardingWizardNotifier() : super(const OnboardingWizardState());

  void reset() {
    state = const OnboardingWizardState();
  }

  void updateBusinessBasics({
    required String name,
    required String phone,
    String? taxId,
    required String currency,
  }) {
    state = state.copyWith(
      name: name,
      phone: phone,
      taxId: taxId,
      currency: currency,
    );
  }

  void setLogo(List<int> bytes, String fileName) {
    state = state.copyWith(logoBytes: bytes, logoFileName: fileName);
  }

  void clearLogo() {
    state = state.copyWith(logoBytes: null, logoFileName: null);
  }

  void updateServiceArea({
    required double latitude,
    required double longitude,
    required int radiusKm,
    required String resolvedAddress,
    required List<String> selectedZoneIds,
    required List<ServiceZone> zoneObjects,
    required List<String> customZoneNames,
  }) {
    state = state.copyWith(
      latitude: latitude,
      longitude: longitude,
      radiusKm: radiusKm,
      resolvedAddress: resolvedAddress,
      selectedZoneIds: selectedZoneIds,
      zoneObjects: zoneObjects,
      customZoneNames: customZoneNames,
    );
  }

  void updateServices(List<OnboardingService> services) {
    state = state.copyWith(selectedServices: services);
  }

  void addTeamInvite(TeamInviteDraft invite) {
    state = state.copyWith(teamInvites: [...state.teamInvites, invite]);
  }

  void removeTeamInvite(int index) {
    final updated = List<TeamInviteDraft>.from(state.teamInvites);
    updated.removeAt(index);
    state = state.copyWith(teamInvites: updated);
  }

  void clearTeamInvites() {
    state = state.copyWith(teamInvites: []);
  }
}

final onboardingWizardProvider =
    StateNotifierProvider<OnboardingWizardNotifier, OnboardingWizardState>(
      (ref) => OnboardingWizardNotifier(),
    );
