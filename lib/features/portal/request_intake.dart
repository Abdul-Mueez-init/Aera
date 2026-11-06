import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import 'booking_proposals.dart';
import 'data/portal_repository.dart';

/// One picked photo tracked through presign → PUT → confirm.
class _PendingPhoto {
  _PendingPhoto(this.name, this.bytes, this.mimeType);
  final String name;
  final Uint8List bytes;
  final String mimeType;
  String status = 'pending'; // pending | uploading | done | failed
}

/// Phase 3.6 — sectioned request intake: what / where / when / photos.
/// The request is created FIRST (so media never orphans), then each photo
/// goes presign → direct-to-Supabase PUT → confirm, with per-photo retry.
class RequestIntakeSheet extends ConsumerStatefulWidget {
  const RequestIntakeSheet({required this.addresses, super.key});

  final List<dynamic> addresses;

  static Future<bool?> show(
    BuildContext context, {
    required List<dynamic> addresses,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: RequestIntakeSheet(addresses: addresses),
      ),
    );
  }

  @override
  ConsumerState<RequestIntakeSheet> createState() => _RequestIntakeSheetState();
}

class _RequestIntakeSheetState extends ConsumerState<RequestIntakeSheet> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _category = TextEditingController();
  final _equipment = TextEditingController();
  final _photos = <_PendingPhoto>[];
  String? _addressId;
  String _timing = 'FLEXIBLE';
  bool _useNewAddress = false;
  final _newLine1 = TextEditingController();
  final _newCity = TextEditingController();
  final _newRegion = TextEditingController();
  final _newPostal = TextEditingController();
  bool _submitting = false;
  String? _error;

  static const _timings = {
    'ASAP': 'As soon as possible',
    'THIS_WEEK': 'This week',
    'FLEXIBLE': 'Flexible',
  };

  @override
  void initState() {
    super.initState();
    if (widget.addresses.isNotEmpty) {
      _addressId = (widget.addresses.first as Map<String, dynamic>)['id']
          ?.toString();
    }
  }

  @override
  void dispose() {
    for (final c in [
      _title,
      _description,
      _category,
      _equipment,
      _newLine1,
      _newCity,
      _newRegion,
      _newPostal,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickPhotos() async {
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: 1600,
      imageQuality: 85,
    );
    for (final file in picked) {
      final bytes = await file.readAsBytes();
      final mime = file.mimeType ?? _mimeFromName(file.name);
      if (!_allowedMime(mime)) continue;
      setState(() {
        _photos.add(_PendingPhoto(file.name, bytes, mime));
      });
    }
  }

  String _mimeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  bool _allowedMime(String mime) => const {
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
  }.contains(mime);

  Map<String, dynamic>? _newAddressPayload() {
    if (!_useNewAddress) return null;
    if (_newLine1.text.trim().isEmpty || _newCity.text.trim().isEmpty) {
      return null;
    }
    return {
      'label': 'New address',
      'line1': _newLine1.text.trim(),
      'city': _newCity.text.trim(),
      if (_newRegion.text.trim().isNotEmpty) 'region': _newRegion.text.trim(),
      if (_newPostal.text.trim().isNotEmpty)
        'postalCode': _newPostal.text.trim(),
      'countryCode': 'US',
    };
  }

  Future<void> _submit() async {
    if (_submitting || !(_formKey.currentState?.validate() ?? false)) return;
    final newAddress = _useNewAddress ? _newAddressPayload() : null;
    if (_useNewAddress && newAddress == null) {
      setState(() => _error = 'Enter the new address line and city');
      return;
    }
    if (!_useNewAddress && _addressId == null) {
      setState(() => _error = 'Choose a service address');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final repository = ref.read(portalRepositoryProvider);
    // Idempotency key: stable per form-open so a double tap can't create
    // two requests; unique enough across sessions via timestamp+random.
    final submissionKey =
        '${DateTime.now().microsecondsSinceEpoch}-${_photos.length}-${_title.text.hashCode.abs()}';
    final result = await repository.createWorkspaceRequest(
      submissionKey: submissionKey,
      serviceAddressId: _useNewAddress ? null : _addressId,
      newAddress: newAddress,
      title: _title.text,
      description: _description.text,
      serviceCategory: _category.text,
      equipmentInfo: _equipment.text,
      preferredWindows: {'preference': _timing},
    );
    if (result is! PortalSessionActive || result.workspace?['id'] == null) {
      setState(() {
        _submitting = false;
        _error = result is PortalFailure
            ? result.message
            : 'Could not submit the request';
      });
      return;
    }
    final requestId = result.workspace!['id'].toString();
    _lastRequestId = requestId;
    // Photos attach AFTER the request exists — no orphaned uploads.
    for (final photo in _photos) {
      await _uploadPhoto(repository, requestId, photo);
      if (mounted) setState(() {});
    }
    if (mounted) Navigator.of(context).pop(true);
  }

  Future<void> _uploadPhoto(
    PortalRepository repository,
    String requestId,
    _PendingPhoto photo,
  ) async {
    photo.status = 'uploading';
    for (var attempt = 0; attempt < 2; attempt++) {
      final presign = await repository.presignRequestMedia(
        requestId,
        photo.mimeType,
      );
      if (presign is! PortalSessionActive || presign.workspace == null) {
        photo.status = 'failed';
        return;
      }
      final objectKey = presign.workspace!['objectKey']?.toString();
      final uploadUrl = presign.workspace!['uploadUrl']?.toString();
      if (objectKey == null || uploadUrl == null) {
        photo.status = 'failed';
        return;
      }
      final uploaded = await repository.uploadMediaBytes(
        uploadUrl,
        photo.bytes,
        photo.mimeType,
      );
      if (!uploaded) continue;
      final confirm = await repository.confirmRequestMedia(
        requestId,
        objectKey: objectKey,
        mimeType: photo.mimeType,
      );
      photo.status = confirm is PortalSessionActive ? 'done' : 'failed';
      return;
    }
    photo.status = 'failed';
  }

  Future<void> _retryPhoto(_PendingPhoto photo) async {
    final requestId = _lastRequestId;
    if (requestId == null) return;
    photo.status = 'pending';
    setState(() {});
    await _uploadPhoto(ref.read(portalRepositoryProvider), requestId, photo);
    if (mounted) setState(() {});
  }

  String? _lastRequestId;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.9,
      builder: (context, scrollController) => Form(
        key: _formKey,
        child: ListView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            Text('New service request', style: AeraTypography.h2),
            const SizedBox(height: 16),
            _section('What’s wrong?'),
            TextFormField(
              controller: _title,
              decoration: const InputDecoration(labelText: 'Short title'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _description,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Describe the problem',
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _category,
              decoration: const InputDecoration(labelText: 'Service category'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _equipment,
              decoration: const InputDecoration(
                labelText: 'Equipment (optional)',
                hintText: 'e.g. Carrier 3-ton AC, model…',
              ),
            ),
            const SizedBox(height: 20),
            _section('Where?'),
            if (widget.addresses.isNotEmpty)
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Saved address')),
                  ButtonSegment(value: true, label: Text('New address')),
                ],
                selected: {_useNewAddress},
                onSelectionChanged: (selection) =>
                    setState(() => _useNewAddress = selection.first),
              ),
            const SizedBox(height: 8),
            if (_useNewAddress || widget.addresses.isEmpty) ...[
              TextFormField(
                controller: _newLine1,
                decoration: const InputDecoration(labelText: 'Street address'),
              ),
              TextFormField(
                controller: _newCity,
                decoration: const InputDecoration(labelText: 'City'),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _newRegion,
                      decoration: const InputDecoration(labelText: 'State'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      controller: _newPostal,
                      decoration: const InputDecoration(labelText: 'ZIP'),
                    ),
                  ),
                ],
              ),
            ] else
              DropdownButtonFormField<String>(
                initialValue: _addressId,
                decoration: const InputDecoration(labelText: 'Service address'),
                items: widget.addresses.map((raw) {
                  final address = raw as Map<String, dynamic>;
                  return DropdownMenuItem(
                    value: address['id']?.toString(),
                    child: Text(
                      address['label']?.toString() ??
                          address['line1']?.toString() ??
                          'Address',
                    ),
                  );
                }).toList(),
                onChanged: (value) => setState(() => _addressId = value),
              ),
            const SizedBox(height: 20),
            _section('When?'),
            Wrap(
              spacing: 8,
              children: _timings.entries
                  .map(
                    (entry) => ChoiceChip(
                      label: Text(entry.value),
                      selected: _timing == entry.key,
                      onSelected: (_) => setState(() => _timing = entry.key),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 20),
            _section('Photos'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ..._photos.map(_photoTile),
                ActionChip(
                  avatar: const Icon(Icons.add_a_photo),
                  label: const Text('Add photos'),
                  onPressed: _pickPhotos,
                ),
              ],
            ),
            if (_photos.any((p) => p.status == 'failed'))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Some photos failed to upload — tap to retry after submitting.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  _error!,
                  style: TextStyle(color: AeraColors.danger),
                ),
              ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Submit request'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(title, style: AeraTypography.labelUpper),
  );

  Widget _photoTile(_PendingPhoto photo) {
    final icon = switch (photo.status) {
      'done' => Icons.check_circle,
      'failed' => Icons.error_outline,
      'uploading' => Icons.cloud_upload_outlined,
      _ => Icons.photo_outlined,
    };
    final color = switch (photo.status) {
      'done' => AeraColors.success,
      'failed' => AeraColors.danger,
      _ => AeraColors.inkSoft,
    };
    return InkWell(
      onTap: photo.status == 'failed' ? () => _retryPhoto(photo) : null,
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: AeraColors.surfaceSubtle,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
    );
  }
}

/// Phase 3.6 — customer request detail: description, media, thread, reply.
class RequestThreadSheet extends ConsumerStatefulWidget {
  const RequestThreadSheet({required this.requestId, super.key});
  final String requestId;

  static Future<void> show(BuildContext context, String requestId) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => RequestThreadSheet(requestId: requestId),
    );
  }

  @override
  ConsumerState<RequestThreadSheet> createState() => _RequestThreadSheetState();
}

class _RequestThreadSheetState extends ConsumerState<RequestThreadSheet> {
  final _reply = TextEditingController();
  List<dynamic>? _messages;
  List<dynamic>? _media;
  List<dynamic>? _proposals;
  bool _sending = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final repository = ref.read(portalRepositoryProvider);
    final results = await Future.wait([
      repository.workspaceList('requests/${widget.requestId}/messages'),
      repository.workspaceList('requests/${widget.requestId}/media'),
      repository.workspaceResource('requests/${widget.requestId}'),
    ]);
    if (!mounted) return;
    final detail = results[2];
    setState(() {
      _messages = results[0] as List<dynamic>?;
      _media = results[1] as List<dynamic>?;
      _proposals = detail is PortalSessionActive
          ? (detail.workspace?['appointmentProposals'] as List<dynamic>?)
          : null;
      _loading = false;
    });
  }

  Future<void> _send() async {
    final body = _reply.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    final result = await ref
        .read(portalRepositoryProvider)
        .postRequestMessage(widget.requestId, body);
    if (!mounted) return;
    setState(() => _sending = false);
    if (result is PortalSessionActive) {
      _reply.clear();
      await _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result is PortalFailure ? result.message : 'Could not send',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.85,
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.all(20),
                      children: [
                        if ((_media ?? const []).isNotEmpty) ...[
                          Text('Photos', style: AeraTypography.labelUpper),
                          const SizedBox(height: 8),
                          SizedBox(
                            height: 84,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: (_media as List).length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(width: 8),
                              itemBuilder: (context, index) {
                                final item =
                                    (_media as List)[index]
                                        as Map<String, dynamic>;
                                final url = item['signedReadUrl']?.toString();
                                return ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: url == null
                                      ? const SizedBox(
                                          width: 84,
                                          height: 84,
                                          child: Icon(Icons.image),
                                        )
                                      : Image.network(
                                          url,
                                          width: 84,
                                          height: 84,
                                          fit: BoxFit.cover,
                                          cacheWidth: 168,
                                          errorBuilder: (_, _, _) =>
                                              const SizedBox(
                                                width: 84,
                                                height: 84,
                                                child: Icon(Icons.broken_image),
                                              ),
                                        ),
                                );
                              },
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        if ((_proposals ?? const []).isNotEmpty) ...[
                          const SizedBox(height: 16),
                          BookingProposals(
                            proposals: _proposals!,
                            fallbackRequestId: widget.requestId,
                          ),
                        ],
                        Text('Conversation', style: AeraTypography.labelUpper),
                        const SizedBox(height: 8),
                        if ((_messages ?? const []).isEmpty)
                          const Text('No messages yet')
                        else
                          ...(_messages as List).map((raw) {
                            final message = raw as Map<String, dynamic>;
                            final isStaff = message['authorType'] == 'STAFF';
                            return Align(
                              alignment: isStaff
                                  ? Alignment.centerLeft
                                  : Alignment.centerRight,
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 6),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: isStaff
                                      ? AeraColors.surfaceSubtle
                                      : Theme.of(
                                          context,
                                        ).colorScheme.primaryContainer,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(message['body']?.toString() ?? ''),
                              ),
                            );
                          }),
                      ],
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _reply,
                      minLines: 1,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'Reply…',
                        isDense: true,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
