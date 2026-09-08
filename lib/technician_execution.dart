import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class TechnicianJob {
  const TechnicianJob({
    required this.id,
    required this.jobNumber,
    required this.customer,
    required this.issue,
    required this.address,
    required this.status,
    required this.scheduledTime,
    this.note,
    this.parts = const [],
    this.photoCount = 0,
  });

  final String id;
  final int jobNumber;
  final String customer;
  final String issue;
  final String address;
  final String status;
  final String scheduledTime;
  final String? note;
  final List<String> parts;
  final int photoCount;

  TechnicianJob copyWith({
    String? status,
    String? note,
    List<String>? parts,
    int? photoCount,
  }) {
    return TechnicianJob(
      id: id,
      jobNumber: jobNumber,
      customer: customer,
      issue: issue,
      address: address,
      status: status ?? this.status,
      scheduledTime: scheduledTime,
      note: note ?? this.note,
      parts: parts ?? this.parts,
      photoCount: photoCount ?? this.photoCount,
    );
  }
}

abstract interface class TechnicianExecutionApi {
  Future<List<TechnicianJob>> today();
  Future<TechnicianJob> updateStatus(String jobId, String status);
  Future<void> addNote(String jobId, String note);
  Future<void> addPart(String jobId, String part);
  Future<void> uploadPhoto(
    String jobId, {
    required String kind,
    required void Function(double progress) onProgress,
  });
  Future<TechnicianJob> complete(String jobId, String summary);
}

class HttpTechnicianExecutionApi implements TechnicianExecutionApi {
  HttpTechnicianExecutionApi({
    required this.baseUrl,
    required this.accessToken,
  });

  final String baseUrl;
  final String accessToken;

  Map<String, String> get _headers => {
    'Authorization': 'Bearer $accessToken',
    'Content-Type': 'application/json',
  };

  @override
  Future<List<TechnicianJob>> today() async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/jobs/today?date=${_today()}'),
      headers: _headers,
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return (data['jobs'] as List<dynamic>)
        .map((item) => _jobFromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<TechnicianJob> updateStatus(String jobId, String status) async {
    return _jobCommand(jobId, 'status', {'status': status});
  }

  @override
  Future<void> addNote(String jobId, String note) async {
    await _post(jobId, 'notes', {'body': note, 'visibility': 'INTERNAL'});
  }

  @override
  Future<void> addPart(String jobId, String part) async {
    await _post(jobId, 'parts', {
      'name': part,
      'quantity': 1,
      'unitPriceMinor': 0,
      'currency': 'USD',
    });
  }

  @override
  Future<void> uploadPhoto(
    String jobId, {
    required String kind,
    required void Function(double progress) onProgress,
  }) async {
    onProgress(0);
    await _post(jobId, 'photos', {
      'objectKey': 'jobs/$jobId/${DateTime.now().millisecondsSinceEpoch}.jpg',
      'mimeType': 'image/jpeg',
      'sizeBytes': 1,
      'kind': kind,
    });
    onProgress(1);
  }

  @override
  Future<TechnicianJob> complete(String jobId, String summary) async {
    return _jobCommand(jobId, 'complete', {'summary': summary});
  }

  Future<TechnicianJob> _jobCommand(
    String jobId,
    String command,
    Map<String, dynamic> payload,
  ) async {
    final body = await _post(jobId, command, payload);
    return _jobFromJson(body['data'] as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> _post(
    String jobId,
    String command,
    Map<String, dynamic> payload,
  ) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/jobs/$jobId/$command'),
      headers: _headers,
      body: jsonEncode(payload),
    );
    _check(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  void _check(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Technician request failed (${response.statusCode})');
    }
  }

  TechnicianJob _jobFromJson(Map<String, dynamic> json) {
    final customer = json['customer'] as Map<String, dynamic>;
    final address = json['serviceAddress'] as Map<String, dynamic>;
    final notes = json['notes'] as List<dynamic>? ?? const [];
    return TechnicianJob(
      id: json['id'] as String,
      jobNumber: json['jobNumber'] as int,
      customer: '${customer['firstName']} ${customer['lastName']}',
      issue: json['problemDescription'] as String,
      address: '${address['line1']}, ${address['city']}',
      status: json['status'] as String,
      scheduledTime:
          (json['scheduledStart'] as String?)?.substring(11, 16) ?? '--:--',
      note: notes.isEmpty
          ? null
          : (notes.first as Map<String, dynamic>)['body'] as String?,
      parts: ((json['parts'] as List<dynamic>?) ?? const [])
          .map((part) => (part as Map<String, dynamic>)['name'] as String)
          .toList(),
      photoCount: (json['photos'] as List<dynamic>?)?.length ?? 0,
    );
  }

  String _today() {
    final now = DateTime.now();
    return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }
}

class DemoTechnicianExecutionApi implements TechnicianExecutionApi {
  var _jobs = <TechnicianJob>[
    const TechnicianJob(
      id: 'job-1042',
      jobNumber: 1042,
      customer: 'Jordan Ellis',
      issue: 'AC not cooling',
      address: '18 Willow Street, Austin',
      status: 'SCHEDULED',
      scheduledTime: '09:30',
    ),
    const TechnicianJob(
      id: 'job-1043',
      jobNumber: 1043,
      customer: 'Northline Bakery',
      issue: 'Preventive maintenance',
      address: '2400 East 5th Street, Austin',
      status: 'SCHEDULED',
      scheduledTime: '11:45',
    ),
  ];

  @override
  Future<List<TechnicianJob>> today() async => _jobs;

  @override
  Future<TechnicianJob> updateStatus(String jobId, String status) async {
    _replace(jobId, (job) => job.copyWith(status: status));
    return _find(jobId);
  }

  @override
  Future<void> addNote(String jobId, String note) async {
    _replace(jobId, (job) => job.copyWith(note: note));
  }

  @override
  Future<void> addPart(String jobId, String part) async {
    _replace(jobId, (job) => job.copyWith(parts: [...job.parts, part]));
  }

  @override
  Future<void> uploadPhoto(
    String jobId, {
    required String kind,
    required void Function(double progress) onProgress,
  }) async {
    for (var step = 1; step <= 4; step++) {
      await Future<void>.delayed(const Duration(milliseconds: 80));
      onProgress(step / 4);
    }
    _replace(jobId, (job) => job.copyWith(photoCount: job.photoCount + 1));
  }

  @override
  Future<TechnicianJob> complete(String jobId, String summary) async {
    _replace(jobId, (job) => job.copyWith(status: 'COMPLETED', note: summary));
    return _find(jobId);
  }

  TechnicianJob _find(String jobId) =>
      _jobs.firstWhere((job) => job.id == jobId);

  void _replace(String jobId, TechnicianJob Function(TechnicianJob) update) {
    _jobs = [for (final job in _jobs) job.id == jobId ? update(job) : job];
  }
}

class TechnicianTodayPage extends StatefulWidget {
  const TechnicianTodayPage({super.key, required this.api});

  final TechnicianExecutionApi api;

  @override
  State<TechnicianTodayPage> createState() => _TechnicianTodayPageState();
}

class _TechnicianTodayPageState extends State<TechnicianTodayPage> {
  late Future<List<TechnicianJob>> _jobs;

  @override
  void initState() {
    super.initState();
    _jobs = widget.api.today();
  }

  void _refresh() {
    setState(() => _jobs = widget.api.today());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Today'),
        actions: [
          IconButton(
            onPressed: _refresh,
            tooltip: 'Refresh jobs',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: FutureBuilder<List<TechnicianJob>>(
        future: _jobs,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Could not load today\'s jobs'));
          }
          final jobs = snapshot.data ?? const <TechnicianJob>[];
          if (jobs.isEmpty) {
            return const Center(child: Text('No assigned jobs today'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            itemCount: jobs.length,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) => _TechnicianJobCard(
              job: jobs[index],
              api: widget.api,
              onChanged: _refresh,
            ),
          );
        },
      ),
    );
  }
}

class _TechnicianJobCard extends StatelessWidget {
  const _TechnicianJobCard({
    required this.job,
    required this.api,
    required this.onChanged,
  });

  final TechnicianJob job;
  final TechnicianExecutionApi api;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final isComplete = job.status == 'COMPLETED';
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  job.scheduledTime,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                Chip(label: Text(_label(job.status))),
              ],
            ),
            const SizedBox(height: 12),
            Text(job.customer, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(job.issue),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.location_on_outlined, size: 18),
                const SizedBox(width: 6),
                Expanded(child: Text(job.address)),
              ],
            ),
            if (job.note != null) ...[
              const SizedBox(height: 12),
              Text(job.note!, style: Theme.of(context).textTheme.bodySmall),
            ],
            if (job.parts.isNotEmpty || job.photoCount > 0) ...[
              const SizedBox(height: 12),
              Text(
                '${job.photoCount} photos  |  ${job.parts.length} parts',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 16),
            if (!isComplete)
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => _openExecution(context),
                  icon: Icon(
                    job.status == 'SCHEDULED'
                        ? Icons.navigation_outlined
                        : Icons.play_arrow,
                  ),
                  label: Text(
                    job.status == 'SCHEDULED' ? 'Mark en route' : 'Start job',
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _openExecution(BuildContext context) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => TechnicianJobPage(job: job, api: api),
      ),
    );
    onChanged();
  }

  String _label(String status) => status.replaceAll('_', ' ');
}

class TechnicianJobPage extends StatefulWidget {
  const TechnicianJobPage({super.key, required this.job, required this.api});

  final TechnicianJob job;
  final TechnicianExecutionApi api;

  @override
  State<TechnicianJobPage> createState() => _TechnicianJobPageState();
}

class _TechnicianJobPageState extends State<TechnicianJobPage> {
  late TechnicianJob _job;
  final _noteController = TextEditingController();
  final _partController = TextEditingController();
  final _summaryController = TextEditingController();
  double? _uploadProgress;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _job = widget.job;
  }

  @override
  void dispose() {
    _noteController.dispose();
    _partController.dispose();
    _summaryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active =
        _job.status == 'IN_PROGRESS' || _job.status == 'WAITING_PARTS';
    return Scaffold(
      appBar: AppBar(title: Text('Job #${_job.jobNumber}')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Text(_job.customer, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(_job.issue),
          const SizedBox(height: 16),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.location_on_outlined),
            title: Text(_job.address),
            subtitle: const Text('Service location'),
          ),
          const SizedBox(height: 16),
          if (_job.status == 'SCHEDULED' || _job.status == 'EN_ROUTE')
            FilledButton.icon(
              onPressed: _busy
                  ? null
                  : () => _setStatus(
                      _job.status == 'SCHEDULED' ? 'EN_ROUTE' : 'IN_PROGRESS',
                    ),
              icon: Icon(
                _job.status == 'SCHEDULED'
                    ? Icons.navigation_outlined
                    : Icons.play_arrow,
              ),
              label: Text(
                _job.status == 'SCHEDULED' ? 'Mark en route' : 'Start job',
              ),
            ),
          if (active) ...[
            _SectionTitle(title: 'Field notes'),
            TextField(
              controller: _noteController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'What did you find?',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : _saveNote,
              icon: const Icon(Icons.note_add_outlined),
              label: const Text('Save note'),
            ),
            const SizedBox(height: 20),
            _SectionTitle(title: 'Evidence'),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _uploadPhoto('BEFORE'),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Add before photo'),
            ),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _uploadPhoto('AFTER'),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Add after photo'),
            ),
            if (_uploadProgress != null)
              LinearProgressIndicator(value: _uploadProgress),
            const SizedBox(height: 20),
            _SectionTitle(title: 'Parts used'),
            TextField(
              controller: _partController,
              decoration: const InputDecoration(
                labelText: 'Part name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : _savePart,
              icon: const Icon(Icons.add_box_outlined),
              label: const Text('Add part'),
            ),
            const SizedBox(height: 20),
            _SectionTitle(title: 'Completion'),
            TextField(
              controller: _summaryController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Completion summary',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: _busy ? null : _complete,
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Complete job'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _setStatus(String status) async {
    await _run(
      () async => _job = await widget.api.updateStatus(_job.id, status),
    );
  }

  Future<void> _saveNote() async {
    final note = _noteController.text.trim();
    if (note.isEmpty) return;
    await _run(() => widget.api.addNote(_job.id, note));
    if (mounted) {
      setState(() => _job = _job.copyWith(note: note));
    }
  }

  Future<void> _savePart() async {
    final part = _partController.text.trim();
    if (part.isEmpty) return;
    await _run(() => widget.api.addPart(_job.id, part));
    if (mounted) {
      setState(() => _job = _job.copyWith(parts: [..._job.parts, part]));
    }
    _partController.clear();
  }

  Future<void> _uploadPhoto(String kind) async {
    if (mounted) setState(() => _uploadProgress = 0);
    await _run(
      () => widget.api.uploadPhoto(
        _job.id,
        kind: kind,
        onProgress: (progress) {
          if (mounted) setState(() => _uploadProgress = progress);
        },
      ),
    );
    if (mounted) {
      setState(() => _job = _job.copyWith(photoCount: _job.photoCount + 1));
    }
  }

  Future<void> _complete() async {
    final summary = _summaryController.text.trim();
    if (summary.isEmpty) return;
    await _run(() async {
      _job = await widget.api.complete(_job.id, summary);
      if (mounted) Navigator.of(context).pop();
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(title, style: Theme.of(context).textTheme.titleMedium),
  );
}
