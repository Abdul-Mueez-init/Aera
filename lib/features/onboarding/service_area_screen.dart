import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
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
  static const _maxCustomZones = 10;
  static const _tileUrl = String.fromEnvironment(
    'MAP_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  final _addressController = TextEditingController();
  final _customZoneController = TextEditingController();
  final _focusNode = FocusNode();
  MapController? _mapController;
  bool _mapReady = false;

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
    _focusNode.addListener(_onAddressUnfocus);
  }

  @override
  void dispose() {
    _addressController.dispose();
    _customZoneController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final profile = await ref.read(onboardingRepositoryProvider).getProfile();
      if (!mounted) return;
      final discovered = profile.serviceZones
          .where((zone) => !zone.isCustom && zone.placeId.startsWith('osm:'))
          .toList();
      final legacyGoogleZones = profile.serviceZones
          .where((zone) => !zone.isCustom && !zone.placeId.startsWith('osm:'))
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
        // Treat legacy Google place IDs as custom areas
        for (final zone in legacyGoogleZones) {
          if (!_customZones.contains(zone.name)) {
            _customZones.add(zone.name);
          }
        }
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

  /// Pin placed by GPS or map tap: move the camera, reverse-geocode
  /// the pin into the address field, then load neighborhoods automatically.
  Future<void> _placePin(double latitude, double longitude) async {
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
    _moveCamera();
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

  void _onAddressUnfocus() {
    final text = _addressController.text.trim();
    if (text.length >= 4 && text != _resolvedAddress && !_searching) {
      _searchAddress();
    }
  }

  Future<void> _searchAddress() async {
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
      _moveCamera();
      await _findZones();
    } catch (error) {
      if (mounted && generation == _zoneSearchGeneration) {
        setState(() => _error = _friendly(error));
      }
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _moveCamera() {
    final lat = _latitude;
    final lng = _longitude;
    if (lat != null && lng != null && _mapReady) {
      _mapController?.move(LatLng(lat, lng), 12);
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
        child: FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: point,
            initialZoom: 12,
            onTap: (_, p) {
            _placePin(p.latitude, p.longitude);
          },
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
            ),
            onMapReady: () {
              setState(() => _mapReady = true);
            },
          ),
          children: [
            TileLayer(
              urlTemplate: _tileUrl,
              userAgentPackageName: 'com.example.aera',
            ),
            CircleLayer(
              circles: [
                CircleMarker(
                  point: point,
                  radius: _radiusKm * 1000,
                  useRadiusInMeter: true,
                  color: AeraColors.accent.withValues(alpha: 0.12),
                  borderColor: AeraColors.accent,
                  borderStrokeWidth: 2,
                ),
              ],
            ),
            MarkerLayer(
              markers: [
                // Headquarters marker
                Marker(
                  point: point,
                  width: 40,
                  height: 40,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AeraColors.accent,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.3),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.location_on,
                      color: Colors.white,
                      size: 24,
                    ),
                  ),
                ),
                // Zone markers
                ..._zones.map(
                  (zone) => Marker(
                    point: LatLng(zone.latitude, zone.longitude),
                    width: 36,
                    height: 36,
                    child: GestureDetector(
                      onTap: () => setState(() {
                        if (_selectedZoneIds.contains(zone.placeId)) {
                          _selectedZoneIds.remove(zone.placeId);
                        } else {
                          _selectedZoneIds.add(zone.placeId);
                        }
                      }),
                      child: Container(
                        decoration: BoxDecoration(
                          color: _selectedZoneIds.contains(zone.placeId)
                              ? AeraColors.accent
                              : Colors.orange,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white,
                            width: _selectedZoneIds.contains(zone.placeId)
                                ? 3
                                : 2,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.2),
                              blurRadius: 3,
                              offset: const Offset(0, 1),
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.place,
                          color: Colors.white,
                          size: _selectedZoneIds.contains(zone.placeId)
                              ? 20
                              : 18,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const RichAttributionWidget(
              attributions: [
                TextSourceAttribution(
                  'OpenStreetMap contributors',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasLocation = _latitude != null && _longitude != null;
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
                          focusNode: _focusNode,
                          textInputAction: TextInputAction.search,
                          onSubmitted: (_) => _searchAddress(),
                          onChanged: (_) => setState(() {}),
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
                        if (hasLocation)
                          _buildMap(point!)
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
                            'Pin: ${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)} — tap the map to move the pin.',
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
                              _findZones();
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
                          // AeraCard paints an opaque DecoratedBox; ListTile
                          // needs a Material between it and the card so its
                          // background and ink splashes remain visible.
                          Material(
                            type: MaterialType.transparency,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                ..._zones.map(
                                  (zone) => CheckboxListTile(
                                    value: _selectedZoneIds.contains(
                                      zone.placeId,
                                    ),
                                    contentPadding: EdgeInsets.zero,
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
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
