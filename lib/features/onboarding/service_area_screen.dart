import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../auth/providers/auth_provider.dart';
import 'data/onboarding_repository.dart';

class ServiceAreaScreen extends ConsumerStatefulWidget {
  const ServiceAreaScreen({super.key});

  @override
  ConsumerState<ServiceAreaScreen> createState() => _ServiceAreaScreenState();
}

class _ServiceAreaScreenState extends ConsumerState<ServiceAreaScreen> {
  static const _googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
  );
  static const _maxCustomZones = 10;

  final _addressController = TextEditingController();
  final _customZoneController = TextEditingController();
  GoogleMapController? _mapController;
  Timer? _addressDebounce;

  double? _latitude;
  double? _longitude;
  String? _resolvedAddress;
  int _radiusKm = 30;
  List<ServiceZone> _zones = [];
  final Set<String> _selectedZoneIds = {};
  final List<String> _customZones = [];

  bool _loading = true;
  bool _searching = false;
  bool _resolvingAddress = false;
  bool _loadingZones = false;
  bool _saving = false;
  bool _zonesLoaded = false;
  bool _zonesStale = false;
  int _zoneSearchGeneration = 0;
  String? _error;
  String? _zoneNotice;

  bool get _addressMatches =>
      _resolvedAddress != null &&
      _addressController.text.trim() == _resolvedAddress;

  bool get _hasVerifiedZones =>
      _zonesLoaded && !_zonesStale && _selectedZoneIds.isNotEmpty;

  bool get _serviceAreaValid =>
      _latitude != null &&
      _longitude != null &&
      _addressMatches &&
      _radiusKm >= 10 &&
      _radiusKm <= 50 &&
      !_searching &&
      !_resolvingAddress &&
      (_hasVerifiedZones || _customZones.isNotEmpty);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _addressDebounce?.cancel();
    _addressController.dispose();
    _customZoneController.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final profile = await ref.read(onboardingRepositoryProvider).getProfile();
      if (!mounted) return;
      final discovered = profile.serviceZones
          .where((zone) => !zone.isCustom)
          .toList();
      setState(() {
        _latitude = profile.headquartersLatitude;
        _longitude = profile.headquartersLongitude;
        _radiusKm = (profile.serviceRadiusKm ?? 30).clamp(10, 50);
        _addressController.text = profile.headquartersAddress ?? '';
        _resolvedAddress = profile.headquartersAddress;
        _zones = discovered;
        _selectedZoneIds.addAll(discovered.map((zone) => zone.placeId));
        _customZones.addAll(
          profile.serviceZones
              .where((zone) => zone.isCustom)
              .map((zone) => zone.name),
        );
        _zonesLoaded = discovered.isNotEmpty;
        _loading = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = _friendly(error);
        });
      }
    }
  }

  String _friendly(Object error) {
    if (error is ApiException) return error.message;
    if (error is TimeoutException) {
      return 'Location lookup timed out. Try again or search for an address.';
    }
    if (error is Exception) {
      return error.toString().replaceFirst('Exception: ', '');
    }
    return 'Could not complete this request. Check your connection and retry.';
  }

  // ---------------------------------------------------------------------------
  // Location: device GPS, typed address, map tap, marker drag
  // ---------------------------------------------------------------------------

  Future<void> _useCurrentLocation() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw Exception(
          'Turn on location services, or type your dispatch address.',
        );
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception(
          'Location permission is unavailable. Type an address instead, or enable location permission in device settings.',
        );
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      if (!mounted) return;
      await _placePin(position.latitude, position.longitude);
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  /// Pin placed by GPS, map tap or marker drag: move the camera, reverse-geocode
  /// the pin into the address field, then load neighborhoods automatically.
  Future<void> _placePin(double latitude, double longitude) async {
    _addressDebounce?.cancel();
    final generation = ++_zoneSearchGeneration;
    setState(() {
      _latitude = latitude;
      _longitude = longitude;
      _resolvedAddress = null;
      _addressController.text = '';
      _resolvingAddress = true;
      _zonesStale = true;
      _zonesLoaded = false;
      _zones = [];
      _selectedZoneIds.clear();
      _zoneNotice = null;
      _error = null;
    });
    unawaited(_moveCamera());
    try {
      final result = await ref
          .read(onboardingRepositoryProvider)
          .reverseGeocode(latitude: latitude, longitude: longitude);
      if (!mounted || generation != _zoneSearchGeneration) return;
      setState(() {
        _resolvedAddress = result.address;
        _addressController.text = result.address;
        _resolvingAddress = false;
      });
    } catch (error) {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() {
          _resolvingAddress = false;
          _error =
              '${_friendly(error)} The pin is placed; type the address and press search to continue.';
        });
      }
      return;
    }
    await _findZones();
  }

  void _onAddressChanged(String value) {
    _addressDebounce?.cancel();
    final text = value.trim();
    if (text.length < 6 || text == _resolvedAddress) {
      setState(() {});
      return;
    }
    setState(() {});
    _addressDebounce = Timer(const Duration(milliseconds: 1200), () {
      if (!mounted || _searching) return;
      if (_addressController.text.trim() != text) return;
      unawaited(_searchAddress());
    });
  }

  Future<void> _searchAddress() async {
    _addressDebounce?.cancel();
    final query = _addressController.text.trim();
    if (query.length < 4) {
      setState(() => _error = 'Enter a complete address or place name.');
      return;
    }
    FocusScope.of(context).unfocus();
    final generation = ++_zoneSearchGeneration;
    setState(() {
      _searching = true;
      _error = null;
      _zoneNotice = null;
    });
    try {
      final location = await ref
          .read(onboardingRepositoryProvider)
          .searchAddress(query);
      if (!mounted || generation != _zoneSearchGeneration) return;
      setState(() {
        _latitude = location.latitude;
        _longitude = location.longitude;
        _resolvedAddress = location.address;
        _addressController.text = location.address;
        _zonesStale = true;
        _zonesLoaded = false;
        _zones = [];
        _selectedZoneIds.clear();
      });
      await _moveCamera();
      await _findZones();
    } catch (error) {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() => _error = _friendly(error));
      }
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _moveCamera() async {
    final lat = _latitude;
    final lng = _longitude;
    if (lat != null && lng != null) {
      await _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(lat, lng), 12),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Neighborhoods: automatic discovery + custom areas
  // ---------------------------------------------------------------------------

  Future<void> _findZones() async {
    if (_latitude == null || _longitude == null) {
      setState(
        () => _error = 'Choose a dispatch headquarters before finding areas.',
      );
      return;
    }
    final generation = ++_zoneSearchGeneration;
    setState(() {
      _loadingZones = true;
      _error = null;
      _zoneNotice = null;
    });
    try {
      final zones = await ref
          .read(onboardingRepositoryProvider)
          .findZones(
            latitude: _latitude!,
            longitude: _longitude!,
            radiusKm: _radiusKm,
          );
      if (!mounted || generation != _zoneSearchGeneration) return;
      setState(() {
        _zones = zones;
        _selectedZoneIds.clear();
        _zonesLoaded = true;
        _zonesStale = false;
        if (zones.isEmpty) {
          _zoneNotice =
              'No neighborhoods were found automatically within this radius. Add your areas manually below, or increase the radius.';
        }
      });
    } catch (error) {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() {
          _error =
              '${_friendly(error)} You can still add your areas manually below.';
        });
      }
    } finally {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() => _loadingZones = false);
      }
    }
  }

  void _addCustomZone() {
    final name = _customZoneController.text
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (name.length < 2) {
      setState(() => _error = 'Enter an area name of at least 2 characters.');
      return;
    }
    if (name.length > 80) {
      setState(() => _error = 'Area names can be at most 80 characters.');
      return;
    }
    final lower = name.toLowerCase();
    var exists = false;
    for (final item in _customZones) {
      if (item.toLowerCase() == lower) exists = true;
    }
    if (exists) {
      setState(() => _error = '"$name" is already in your list.');
      return;
    }
    if (_customZones.length >= _maxCustomZones) {
      setState(
        () => _error = 'You can add up to $_maxCustomZones custom areas.',
      );
      return;
    }
    setState(() {
      _customZones.add(name);
      _customZoneController.clear();
      _error = null;
    });
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  Future<void> _saveAndContinue() async {
    if (!_addressMatches) {
      setState(
        () => _error =
            'Search the edited headquarters address before saving so the map pin matches it.',
      );
      return;
    }
    if (_latitude == null || _longitude == null) {
      setState(() => _error = 'Choose your dispatch headquarters on the map.');
      return;
    }
    final useDiscovered = _zonesLoaded && !_zonesStale;
    final selected = useDiscovered
        ? _zones
              .where((zone) => _selectedZoneIds.contains(zone.placeId))
              .toList()
        : <ServiceZone>[];
    if (selected.isEmpty && _customZones.isEmpty) {
      setState(
        () => _error =
            'Select at least one neighborhood or add a custom area to continue.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(onboardingRepositoryProvider)
          .saveServiceArea(
            latitude: _latitude!,
            longitude: _longitude!,
            radiusKm: _radiusKm,
            zones: selected,
            customZoneNames: _customZones,
          );
      ref.invalidate(onboardingProfileProvider);
      await ref.read(authNotifierProvider.notifier).refreshServerIdentity();
      if (mounted) context.push('/onboarding/services');
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  Widget _spinner() => const SizedBox(
    width: 16,
    height: 16,
    child: CircularProgressIndicator(strokeWidth: 2),
  );

  Widget _buildMap(LatLng point) {
    return SizedBox(
      height: 260,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: GoogleMap(
          initialCameraPosition: CameraPosition(target: point, zoom: 12),
          onMapCreated: (controller) => _mapController = controller,
          gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
            Factory<OneSequenceGestureRecognizer>(
              () => EagerGestureRecognizer(),
            ),
          },
          onTap: (position) =>
              unawaited(_placePin(position.latitude, position.longitude)),
          markers: {
            Marker(
              markerId: const MarkerId('dispatch-hq'),
              position: point,
              draggable: true,
              onDragEnd: (position) =>
                  unawaited(_placePin(position.latitude, position.longitude)),
              infoWindow: const InfoWindow(title: 'Dispatch headquarters'),
            ),
            ..._zones.map(
              (zone) => Marker(
                markerId: MarkerId('zone-${zone.placeId}'),
                position: LatLng(zone.latitude, zone.longitude),
                icon: BitmapDescriptor.defaultMarkerWithHue(
                  _selectedZoneIds.contains(zone.placeId)
                      ? BitmapDescriptor.hueAzure
                      : BitmapDescriptor.hueOrange,
                ),
                infoWindow: InfoWindow(
                  title: zone.name,
                  snippet: 'Tap to toggle dispatch coverage',
                ),
                onTap: () => setState(() {
                  if (_selectedZoneIds.contains(zone.placeId)) {
                    _selectedZoneIds.remove(zone.placeId);
                  } else {
                    _selectedZoneIds.add(zone.placeId);
                  }
                }),
              ),
            ),
          },
          circles: {
            Circle(
              circleId: const CircleId('dispatch-radius'),
              center: point,
              radius: _radiusKm * 1000.0,
              fillColor: AeraColors.accent.withValues(alpha: 0.12),
              strokeColor: AeraColors.accent,
              strokeWidth: 2,
            ),
          },
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          zoomControlsEnabled: true,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasLocation = _latitude != null && _longitude != null;
    final mapsKeyConfigured = _googleMapsApiKey.isNotEmpty;
    final point = hasLocation ? LatLng(_latitude!, _longitude!) : null;
    final addressNeedsSearch =
        _addressController.text.trim().length >= 4 && !_addressMatches;

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Service Territory',
        subtitle: 'Step 02 / 04',
        showBrand: true,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                ),
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.circle,
                        size: 8,
                        color: AeraColors.accent,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'STEP 02 / 04 • SERVICE TERRITORY',
                        style: AeraTypography.labelUpper.copyWith(
                          color: AeraColors.accent,
                          fontSize: 10,
                        ),
                      ),
                      const Spacer(),
                      const Text('2 of 4'),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Define your service territory',
                    style: AeraTypography.display.copyWith(fontSize: 26),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Use your device location or type an address. The map pin and address stay in sync, then pick nearby neighborhoods or add your own areas.',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  const SizedBox(height: 16),
                  AeraCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Dispatch headquarters',
                          style: AeraTypography.label.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _addressController,
                          textInputAction: TextInputAction.search,
                          onChanged: _onAddressChanged,
                          onSubmitted: (_) => _searchAddress(),
                          decoration: InputDecoration(
                            hintText: _resolvingAddress
                                ? 'Resolving address…'
                                : 'Type an address, city, or place',
                            border: const OutlineInputBorder(),
                            suffixIcon: IconButton(
                              onPressed: _searching || _resolvingAddress
                                  ? null
                                  : _searchAddress,
                              icon: _searching || _resolvingAddress
                                  ? _spinner()
                                  : const Icon(Icons.search),
                            ),
                          ),
                        ),
                        if (addressNeedsSearch && !_searching)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(
                              'Finding this address on the map…',
                              style: AeraTypography.label.copyWith(
                                color: AeraColors.inkSoft,
                              ),
                            ),
                          ),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: _searching || _resolvingAddress
                              ? null
                              : _useCurrentLocation,
                          icon: _searching
                              ? _spinner()
                              : const Icon(Icons.my_location),
                          label: const Text('Use this device location'),
                        ),
                        const SizedBox(height: 8),
                        if (hasLocation && mapsKeyConfigured)
                          _buildMap(point!)
                        else if (!mapsKeyConfigured)
                          Text(
                            'Interactive map is not configured for this build. Configure the restricted GOOGLE_MAPS_API_KEY SDK key; address search still uses the API provider.',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.danger,
                            ),
                          )
                        else
                          Container(
                            height: 120,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: AeraColors.surfaceSubtle,
                              borderRadius: AeraRadii.borderMd,
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Text(
                                'Type an address or use device location to place the headquarters pin.',
                                style: AeraTypography.bodySm.copyWith(
                                  color: AeraColors.inkSoft,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                        if (hasLocation) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Pin: ${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)} — tap the map or drag the pin to adjust.',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  AeraCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Maximum response radius',
                                style: AeraTypography.label.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            Text(
                              '$_radiusKm km',
                              style: AeraTypography.h3.copyWith(
                                color: AeraColors.accent,
                              ),
                            ),
                          ],
                        ),
                        Slider(
                          value: _radiusKm.toDouble(),
                          min: 10,
                          max: 50,
                          divisions: 40,
                          activeColor: AeraColors.accent,
                          onChanged: (value) => setState(() {
                            _zoneSearchGeneration++;
                            _radiusKm = value.round();
                            _zonesStale = true;
                            _zonesLoaded = false;
                            _zones = [];
                            _selectedZoneIds.clear();
                          }),
                          onChangeEnd: (_) {
                            if (_latitude != null && _longitude != null) {
                              unawaited(_findZones());
                            }
                          },
                        ),
                        const SizedBox(height: 4),
                        OutlinedButton.icon(
                          onPressed: _loadingZones || !hasLocation
                              ? null
                              : _findZones,
                          icon: _loadingZones
                              ? _spinner()
                              : const Icon(Icons.travel_explore),
                          label: Text(
                            _loadingZones
                                ? 'Finding neighborhoods…'
                                : 'Find neighborhoods',
                          ),
                        ),
                        if (_zoneNotice != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            _zoneNotice!,
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ],
                        if (_zones.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Select nearby neighborhoods',
                            style: AeraTypography.label.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          ..._zones.map(
                            (zone) => CheckboxListTile(
                              value: _selectedZoneIds.contains(zone.placeId),
                              contentPadding: EdgeInsets.zero,
                              controlAffinity: ListTileControlAffinity.leading,
                              title: Text(zone.name),
                              onChanged: (selected) => setState(() {
                                if (selected == true) {
                                  _selectedZoneIds.add(zone.placeId);
                                } else {
                                  _selectedZoneIds.remove(zone.placeId);
                                }
                              }),
                            ),
                          ),
                        ],
                        if (_zonesStale &&
                            _zones.isEmpty &&
                            hasLocation &&
                            !_loadingZones)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              'Location or radius changed. Find neighborhoods again, or use custom areas.',
                              style: AeraTypography.label.copyWith(
                                color: AeraColors.inkSoft,
                              ),
                            ),
                          ),
                        const SizedBox(height: 16),
                        Text(
                          'Custom areas',
                          style: AeraTypography.label.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Add a neighborhood, district or landmark that is not listed above.',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _customZoneController,
                                textInputAction: TextInputAction.done,
                                textCapitalization: TextCapitalization.words,
                                maxLength: 80,
                                onSubmitted: (_) => _addCustomZone(),
                                decoration: const InputDecoration(
                                  hintText: 'e.g. Clifton Block 5',
                                  counterText: '',
                                  border: OutlineInputBorder(),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton.filled(
                              onPressed: _addCustomZone,
                              icon: const Icon(Icons.add),
                              tooltip: 'Add custom area',
                            ),
                          ],
                        ),
                        if (_customZones.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            children: [
                              for (final name in _customZones)
                                InputChip(
                                  label: Text(name),
                                  onDeleted: () =>
                                      setState(() => _customZones.remove(name)),
                                ),
                            ],
                          ),
                        ],
                        if (!_hasVerifiedZones && _customZones.isEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Select at least one neighborhood or add a custom area to continue.',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _error!,
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  AeraButton(
                    text: _saving ? 'Saving…' : 'Save & Continue to Services',
                    icon: const Icon(
                      Icons.arrow_forward,
                      size: 18,
                      color: Colors.white,
                    ),
                    onPressed: !_serviceAreaValid || _saving
                        ? null
                        : _saveAndContinue,
                  ),
                  const SizedBox(height: 20),
                ],
              ),
      ),
    );
  }
}
