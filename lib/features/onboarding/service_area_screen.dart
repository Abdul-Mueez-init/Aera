import 'dart:async';

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
  final _addressController = TextEditingController();
  GoogleMapController? _mapController;
  double? _latitude;
  double? _longitude;
  String? _resolvedAddress;
  int _radiusKm = 30;
  List<ServiceZone> _zones = [];
  final Set<String> _selectedZoneIds = {};
  bool _loading = true;
  bool _searching = false;
  bool _loadingZones = false;
  bool _saving = false;
  bool _zonesLoaded = false;
  bool _zonesStale = false;
  int _zoneSearchGeneration = 0;
  String? _error;

  bool get _serviceAreaValid =>
      _latitude != null &&
      _longitude != null &&
      _resolvedAddress != null &&
      _addressController.text.trim() == _resolvedAddress &&
      _radiusKm >= 10 &&
      _radiusKm <= 50 &&
      _zonesLoaded &&
      !_zonesStale &&
      _selectedZoneIds.isNotEmpty;

  static const _googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
  );

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _addressController.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final profile = await ref.read(onboardingRepositoryProvider).getProfile();
      if (!mounted) return;
      setState(() {
        _latitude = profile.headquartersLatitude;
        _longitude = profile.headquartersLongitude;
        _radiusKm = (profile.serviceRadiusKm ?? 30).clamp(10, 50);
        _addressController.text = profile.headquartersAddress ?? '';
        _resolvedAddress = profile.headquartersAddress;
        _zones = profile.serviceZones;
        _selectedZoneIds.addAll(
          profile.serviceZones.map((zone) => zone.placeId),
        );
        _zonesLoaded = profile.serviceZones.isNotEmpty;
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

  Future<void> _useCurrentLocation() async {
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw Exception(
          'Turn on location services, or search for your dispatch address.',
        );
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception(
          'Location permission is unavailable. Search for an address instead, or enable location permission in device settings.',
        );
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      if (!mounted) return;
      _setLocation(position.latitude, position.longitude);
      await _moveCamera();
      await _resolvePinAndSearch(position.latitude, position.longitude);
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _searchAddress() async {
    final query = _addressController.text.trim();
    if (query.length < 4) {
      setState(() => _error = 'Enter a complete address or place name.');
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final location = await ref
          .read(onboardingRepositoryProvider)
          .searchAddress(query);
      if (!mounted) return;
      _setLocation(location.latitude, location.longitude);
      _resolvedAddress = location.address;
      _addressController.text = location.address;
      await _moveCamera();
      await _findZones();
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _setLocation(double latitude, double longitude) {
    _zoneSearchGeneration++;
    setState(() {
      _latitude = latitude;
      _longitude = longitude;
      _resolvedAddress = null;
      _zonesStale = true;
      _zonesLoaded = false;
      _zones = [];
      _selectedZoneIds.clear();
    });
  }

  Future<void> _resolvePinAndSearch(double latitude, double longitude) async {
    final generation = _zoneSearchGeneration;
    _addressController.text = 'Resolving address…';
    try {
      final result = await ref
          .read(onboardingRepositoryProvider)
          .reverseGeocode(latitude: latitude, longitude: longitude);
      if (!mounted || generation != _zoneSearchGeneration) return;
      setState(() {
        _resolvedAddress = result.address;
        _addressController.text = result.address;
      });
      await _findZones();
    } catch (error) {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() {
          _addressController.text = '';
          _error = _friendly(error);
        });
      }
    }
  }

  Future<void> _moveCamera() async {
    final lat = _latitude;
    final lng = _longitude;
    if (lat != null && lng != null) {
      await _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(lat, lng), 11),
      );
    }
  }

  Future<void> _findZones() async {
    if (_latitude == null || _longitude == null) {
      setState(
        () => _error =
            'Choose a dispatch headquarters before searching for neighborhoods.',
      );
      return;
    }
    final generation = ++_zoneSearchGeneration;
    setState(() {
      _loadingZones = true;
      _error = null;
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
      });
      if (zones.isEmpty) {
        setState(
          () => _error =
              'Google Places found no neighborhood areas within this radius. Increase the radius or move the map pin and search again.',
        );
      }
    } catch (error) {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() => _error = _friendly(error));
      }
    } finally {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() => _loadingZones = false);
      }
    }
  }

  Future<void> _saveAndContinue() async {
    if (_resolvedAddress == null ||
        _addressController.text.trim() != _resolvedAddress) {
      setState(
        () => _error =
            'Resolve the edited headquarters address with Search before saving.',
      );
      return;
    }
    if (_latitude == null || _longitude == null) {
      setState(() => _error = 'Choose your dispatch headquarters on the map.');
      return;
    }
    if (!_zonesLoaded || _zonesStale) {
      setState(
        () => _error =
            'Search nearby neighborhoods again to verify them for this location and radius.',
      );
      return;
    }
    final selected = _zones
        .where((zone) => _selectedZoneIds.contains(zone.placeId))
        .toList();
    if (selected.isEmpty) {
      setState(() => _error = 'Select at least one verified service zone.');
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

  @override
  Widget build(BuildContext context) {
    final hasLocation = _latitude != null && _longitude != null;
    final mapsKeyConfigured = _googleMapsApiKey.isNotEmpty;
    final point = hasLocation ? LatLng(_latitude!, _longitude!) : null;
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
                    'Choose a real dispatch location and verified Google neighborhood areas. No sample zones are preselected.',
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
                          onSubmitted: (_) => _searchAddress(),
                          decoration: InputDecoration(
                            hintText: 'Search an address, city, or place',
                            border: const OutlineInputBorder(),
                            suffixIcon: IconButton(
                              onPressed: _searching ? null : _searchAddress,
                              icon: const Icon(Icons.search),
                    ),
                  ),
                        ),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: _searching ? null : _useCurrentLocation,
                          icon: _searching
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.my_location),
                          label: const Text('Use this device location'),
                    ),
                        const SizedBox(height: 8),
                        if (hasLocation && mapsKeyConfigured)
                          SizedBox(
                            height: 240,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: GoogleMap(
                                initialCameraPosition: CameraPosition(
                                  target: point!,
                                  zoom: 11,
                                ),
                                onMapCreated: (controller) {
                                  _mapController = controller;
                                },
                                onTap: (position) {
                                  _setLocation(
                                    position.latitude,
                                    position.longitude,
                                  );
                                  _addressController.text =
                                      'Resolving address…';
                                  unawaited(
                                    _resolvePinAndSearch(
                                      position.latitude,
                                      position.longitude,
                  ),
                                  );
                                },
                                markers: {
                                  Marker(
                                    markerId: const MarkerId('dispatch-hq'),
                                    position: point,
                                    infoWindow: const InfoWindow(
                                      title: 'Dispatch headquarters',
                                    ),
                                  ),
                                  ..._zones.map(
                                    (zone) => Marker(
                                      markerId: MarkerId(
                                        'zone-${zone.placeId}',
                                      ),
                                      position: LatLng(
                                        zone.latitude,
                                        zone.longitude,
                                      ),
                                      icon:
                                          BitmapDescriptor.defaultMarkerWithHue(
                                            _selectedZoneIds.contains(
                                                  zone.placeId,
                                                )
                                                ? BitmapDescriptor.hueAzure
                                                : BitmapDescriptor.hueOrange,
                                          ),
                                      infoWindow: InfoWindow(
                                        title: zone.name,
                                        snippet:
                                            'Tap to toggle dispatch coverage',
                                      ),
                                      onTap: () => setState(() {
                                        if (_selectedZoneIds.contains(
                                          zone.placeId,
                                        )) {
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
                                    fillColor: AeraColors.accent.withValues(
                                      alpha: 0.12,
                              ),
                                    strokeColor: AeraColors.accent,
                                    strokeWidth: 2,
                              ),
                                },
                                myLocationButtonEnabled: false,
                                mapToolbarEnabled: false,
                                zoomControlsEnabled: true,
                          ),
                        ),
                          )
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
                          child: Text(
                              'Search an address or use device location to place the headquarters pin.',
                              style: AeraTypography.bodySm.copyWith(
                                color: AeraColors.inkSoft,
                    ),
                              textAlign: TextAlign.center,
                  ),
                      ),
                        if (hasLocation) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Pin: ${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)} — tap the map to adjust.',
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
                    divisions: 14,
                    activeColor: AeraColors.accent,
                          onChanged: (value) => setState(() {
                            _zoneSearchGeneration++;
                            _radiusKm = value.round();
                            _zonesStale = true;
                            _zonesLoaded = false;
                            _zones = [];
                            _selectedZoneIds.clear();
                          }),
                          onChangeEnd: (_) => unawaited(_findZones()),
                  ),
                  Text(
                          'Google Places search results are real place records; your selection is saved as active dispatch coverage.',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: _loadingZones || !hasLocation
                              ? null
                              : _findZones,
                          icon: _loadingZones
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.travel_explore),
                          label: Text(
                            _loadingZones
                                ? 'Searching Google Places…'
                                : 'Find neighborhoods',
                  ),
                        ),
                        if (_zones.isNotEmpty) ...[
                  const SizedBox(height: 8),
                          Text(
                            'Select service zones',
                            style: AeraTypography.label.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          ..._zones.map(
                            (zone) => CheckboxListTile(
                              value: _selectedZoneIds.contains(zone.placeId),
                              contentPadding: EdgeInsets.zero,
                              title: Text(zone.name),
                              subtitle: Text(
                                '${zone.latitude.toStringAsFixed(4)}, ${zone.longitude.toStringAsFixed(4)}',
                              ),
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
                        if (_zonesLoaded && _selectedZoneIds.isEmpty)
                          Text(
                            'Select at least one verified service zone to continue.',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.danger,
              ),
            ),
                        if (_zonesStale && _zones.isNotEmpty)
                          Text(
                            'Location or radius changed. Search again before saving.',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.danger,
                            ),
            ),
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
