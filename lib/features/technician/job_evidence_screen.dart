import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';
import '../jobs/providers/jobs_provider.dart';
import 'data/technician_repository.dart';
import 'providers/technician_provider.dart';

enum _EvidenceKind { before, after, other }

extension on _EvidenceKind {
  String get apiValue => switch (this) {
    _EvidenceKind.before => 'BEFORE',
    _EvidenceKind.after => 'AFTER',
    _EvidenceKind.other => 'OTHER',
  };

  String get label => switch (this) {
    _EvidenceKind.before => 'Before',
    _EvidenceKind.after => 'After',
    _EvidenceKind.other => 'Other',
  };
}

class JobEvidenceScreen extends ConsumerStatefulWidget {
  const JobEvidenceScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<JobEvidenceScreen> createState() => _JobEvidenceScreenState();
}

class _JobEvidenceScreenState extends ConsumerState<JobEvidenceScreen> {
  final _picker = ImagePicker();
  final _captionController = TextEditingController();
  _EvidenceKind _kind = _EvidenceKind.before;

  XFile? _picked;
  Uint8List? _pickedBytes;
  bool _uploading = false;
  String? _error;

  @override
  void dispose() {
    _captionController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    final file = await _picker.pickImage(
      source: source,
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _picked = file;
      _pickedBytes = bytes;
      _error = null;
    });
  }

  Future<void> _upload() async {
    final file = _picked;
    final bytes = _pickedBytes;
    if (file == null || bytes == null) return;

    final mimeType = mimeTypeForImagePath(file.path);
    if (mimeType == null) {
      setState(
        () => _error = 'Unsupported image format. Use JPEG, PNG, or WebP.',
      );
      return;
    }

    setState(() {
      _uploading = true;
      _error = null;
    });

    try {
      final repo = ref.read(technicianRepositoryProvider);
      final presigned = await repo.presignPhoto(widget.jobId, mimeType);
      await repo.uploadPhotoBytes(
        uploadUrl: presigned.uploadUrl,
        bytes: bytes,
        mimeType: mimeType,
      );
      await repo.confirmPhoto(
        widget.jobId,
        objectKey: presigned.objectKey,
        mimeType: mimeType,
        sizeBytes: bytes.length,
        kind: _kind.apiValue,
        caption: _captionController.text,
      );

      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(technicianTodayProvider);

      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Photo uploaded')));
        setState(() {
          _picked = null;
          _pickedBytes = null;
          _captionController.clear();
        });
      }
    } catch (e) {
      setState(() {
        _error = e is ApiException
            ? e.message
            : 'Upload failed. Check your connection and try again.';
      });
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Job Evidence', subtitle: 'Photo Upload'),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  if (_pickedBytes != null)
                    ClipRRect(
                      borderRadius: AeraRadii.borderMd,
                      child: Image.memory(
                        _pickedBytes!,
                        height: 220,
                        width: double.infinity,
                        fit: BoxFit.cover,
                      ),
                    )
                  else
                    Container(
                      height: 180,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: AeraColors.surfaceSubtle,
                        borderRadius: AeraRadii.borderMd,
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.image_outlined,
                          size: 40,
                          color: AeraColors.outline,
                        ),
                      ),
                    ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: AeraButton(
                          text: 'Camera',
                          variant: AeraButtonVariant.secondary,
                          icon: const Icon(
                            Icons.camera_alt,
                            size: 18,
                            color: AeraColors.ink,
                          ),
                          onPressed: _uploading
                              ? null
                              : () => _pickImage(ImageSource.camera),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: AeraButton(
                          text: 'Gallery',
                          variant: AeraButtonVariant.outline,
                          icon: const Icon(
                            Icons.photo_library_outlined,
                            size: 18,
                            color: AeraColors.ink,
                          ),
                          onPressed: _uploading
                              ? null
                              : () => _pickImage(ImageSource.gallery),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Photo type',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: _EvidenceKind.values
                        .map(
                          (kind) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _KindChip(
                              label: kind.label,
                              isSelected: _kind == kind,
                              onTap: () => setState(() => _kind = kind),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Caption (optional)',
                    hintText: 'e.g. Corroded capacitor before replacement',
                    controller: _captionController,
                    maxLines: 2,
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
              ),
            ],
            const SizedBox(height: 20),
            AeraButton(
              text: _uploading ? 'Uploading…' : 'Upload Photo',
              isLoading: _uploading,
              onPressed: (_pickedBytes == null || _uploading) ? null : _upload,
            ),
            const SizedBox(height: 10),
            AeraButton(
              text: 'Done',
              variant: AeraButtonVariant.outline,
              onPressed: () => context.pop(),
            ),
          ],
        ),
      ),
    );
  }
}

class _KindChip extends StatelessWidget {
  const _KindChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: AeraRadii.borderFull,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.accent : AeraColors.surface,
          borderRadius: AeraRadii.borderFull,
          border: Border.all(
            color: isSelected ? Colors.transparent : AeraColors.line,
          ),
        ),
        child: Text(
          label,
          style: AeraTypography.label.copyWith(
            color: isSelected ? Colors.white : AeraColors.ink,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
