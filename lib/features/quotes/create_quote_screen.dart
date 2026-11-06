import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';
import '../customers/providers/customers_provider.dart';
import 'data/quotes_repository.dart';
import 'providers/quotes_provider.dart';

class _DraftItem {
  _DraftItem({String? description, double quantity = 1, double unitPrice = 0})
    : descriptionController = TextEditingController(text: description),
      quantityController = TextEditingController(
        text: quantity == quantity.roundToDouble()
            ? quantity.toStringAsFixed(0)
            : quantity.toString(),
      ),
      unitPriceController = TextEditingController(
        text: unitPrice == 0 ? '' : unitPrice.toStringAsFixed(2),
      );

  final TextEditingController descriptionController;
  final TextEditingController quantityController;
  final TextEditingController unitPriceController;

  double get quantity => double.tryParse(quantityController.text.trim()) ?? 0;
  double get unitPrice => double.tryParse(unitPriceController.text.trim()) ?? 0;

  /// Inline quantity validation (backend contract): required, > 0, and
  /// at most 2 decimal places — anything else would come back as a
  /// server 422, so it is caught here instead.
  String? get quantityError {
    final raw = quantityController.text.trim();
    if (raw.isEmpty) return 'Enter a quantity';
    final value = double.tryParse(raw);
    if (value == null) return 'Enter a valid quantity';
    if (value <= 0) return 'Quantity must be greater than 0';
    final parts = raw.split('.');
    if (parts.length == 2 && parts[1].length > 2) {
      return 'At most 2 decimal places';
    }
    return null;
  }

  // Note: This preview uses Dart double for display only.
  // The server recomputes the authoritative total using exact BigInt arithmetic
  // in money.service.ts. The preview may show minor rounding differences.
  double get previewTotal => quantity * unitPrice;

  void dispose() {
    descriptionController.dispose();
    quantityController.dispose();
    unitPriceController.dispose();
  }
}

class CreateQuoteScreen extends ConsumerStatefulWidget {
  const CreateQuoteScreen({
    super.key,
    this.initialCustomerId,
    this.initialJobId,
  });

  /// Optional preselection carried from the job detail screen
  /// (`/create-quote?customerId=…&jobId=…`).
  final String? initialCustomerId;
  final String? initialJobId;

  @override
  ConsumerState<CreateQuoteScreen> createState() => _CreateQuoteScreenState();
}

class _CreateQuoteScreenState extends ConsumerState<CreateQuoteScreen> {
  String? _customerId;
  String? _jobId;
  String? _basisJobId;
  String _kind = 'GENERAL';
  static const _quoteKinds = [
    'GENERAL',
    'INSPECTION',
    'REPAIR',
    'INSTALLATION',
    'CHANGE_ORDER',
  ];
  String _currency = 'USD';
  String? _depositType;
  final _depositValueController = TextEditingController(text: '0');
  final _currencyController = TextEditingController(text: 'USD');
  final _discountController = TextEditingController(text: '0');
  final _taxRateController = TextEditingController(text: '0');
  final List<_DraftItem> _items = [_DraftItem()];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _customerId = widget.initialCustomerId;
    _jobId = widget.initialJobId;
  }

  @override
  void dispose() {
    _currencyController.dispose();
    _discountController.dispose();
    _taxRateController.dispose();
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  // Note: These preview calculations use Dart double for display only.
  // The server recomputes the authoritative total using exact BigInt arithmetic
  // in money.service.ts. The preview may show minor rounding differences.
  double get _previewSubtotal =>
      _items.fold(0, (sum, it) => sum + it.previewTotal);
  double get _previewDiscount =>
      double.tryParse(_discountController.text.trim()) ?? 0;
  double get _previewTaxRatePct =>
      double.tryParse(_taxRateController.text.trim()) ?? 0;
  double get _previewTaxable => _previewSubtotal - _previewDiscount;
  double get _previewTax => _previewTaxable * (_previewTaxRatePct / 100);
  double get _previewTotal => _previewTaxable + _previewTax;

  num? _depositValueForInput() {
    if (_depositType == null) return null;
    final raw = double.tryParse(_depositValueController.text.trim()) ?? 0;
    if (_depositType == 'FIXED') return (raw * 100).round();
    // PERCENT: UI collects percent (e.g. 25), backend expects basis points.
    return (raw * 100).round();
  }

  Future<void> _submit() async {
    if (_customerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a customer for this quote')),
      );
      return;
    }

    if (_items.any(
      (it) =>
          it.descriptionController.text.trim().isNotEmpty &&
          it.quantityError != null,
    )) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Fix the quantity errors — quantities must be greater than 0 '
            'with at most 2 decimal places',
          ),
        ),
      );
      return;
    }

    final validItems = _items
        .where(
          (it) =>
              it.descriptionController.text.trim().isNotEmpty &&
              it.quantity > 0,
        )
        .toList();
    if (validItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Add at least one line item with a description and quantity',
          ),
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final quote = await ref
          .read(quotesRepositoryProvider)
          .createQuote(
            CreateQuoteInput(
              customerId: _customerId!,
              jobId: _jobId,
              basisJobId: _basisJobId,
              kind: _kind,
              currency: _currency,
              discountMinor: (_previewDiscount * 100).round(),
              taxRateBps: (_previewTaxRatePct * 100).round(),
              depositType: _depositType,
              // FIXED is minor units; PERCENT is basis points — the UI
              // collects a percent and converts to bps below.
              depositValue: _depositValueForInput(),
              items: validItems
                  .map(
                    (it) => CreateQuoteItemInput(
                      description: it.descriptionController.text,
                      quantity: it.quantity,
                      unitPriceMinor: (it.unitPrice * 100).round(),
                    ),
                  )
                  .toList(),
            ),
          );

      ref.invalidate(quotesListProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Quote created as a draft')),
        );
        context.pushReplacement('/quotes/${quote.id}');
      }
    } catch (e) {
      if (mounted) {
        final message = e is ApiException
            ? e.message
            : 'Could not create quote. Please try again.';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Dedicated picker provider — NOT the shared customersListProvider,
    // whose search/page state belongs to the Customers tab.
    final customersAsync = ref.watch(pickerCustomersProvider);
    final customerId = _customerId;

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Draft Quote',
        subtitle: 'New Estimate',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Customer + optional job
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'CUSTOMER',
                    style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                  ),
                  const SizedBox(height: 10),
                  AeraTextField(
                    label: 'Search customers',
                    hintText: 'Type a name to filter…',
                    onChanged: (value) =>
                        ref.read(pickerCustomersSearchProvider.notifier).state =
                            value.trim(),
                  ),
                  const SizedBox(height: 10),
                  customersAsync.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Center(
                        child: SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                    error: (error, _) => Text(
                      error is ApiException
                          ? error.message
                          : 'Could not load customers',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
                    data: (page) {
                      if (page.items.isEmpty) {
                        return Text(
                          'No customers yet — add one first',
                          style: AeraTypography.bodySm,
                        );
                      }
                      return DropdownButtonFormField<String>(
                        // A preselected customer outside the loaded page
                        // must not crash the dropdown: only use the value
                        // when it matches a loaded item.
                        initialValue: page.items.any((c) => c.id == customerId)
                            ? customerId
                            : null,
                        isExpanded: true,
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: AeraColors.surface,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: AeraRadii.borderMd,
                            borderSide: const BorderSide(
                              color: AeraColors.line,
                            ),
                          ),
                          hintText: 'Select a customer',
                        ),
                        items: page.items
                            .map(
                              (c) => DropdownMenuItem(
                                value: c.id,
                                child: Text(
                                  c.fullName,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          setState(() {
                            _customerId = value;
                            _jobId = null;
                            _basisJobId = null;
                          });
                        },
                      );
                    },
                  ),
                  if (customerId != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      'ATTACH TO JOB (OPTIONAL)',
                      style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                    ),
                    const SizedBox(height: 10),
                    Consumer(
                      builder: (context, ref, _) {
                        final jobsAsync = ref.watch(
                          customerJobsProvider(customerId),
                        );
                        return jobsAsync.when(
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                          error: (error, _) => Text(
                            error is ApiException
                                ? error.message
                                : 'Could not load jobs',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.danger,
                            ),
                          ),
                          data: (page) {
                            // A quote's job must remain active (not
                            // COMPLETED/CANCELLED) per quote.service.ts
                            // assertQuoteReferences.
                            final eligible = page.items
                                .where(
                                  (j) =>
                                      j.status != 'COMPLETED' &&
                                      j.status != 'CANCELLED',
                                )
                                .toList();
                            if (eligible.isEmpty) {
                              return Text(
                                'No active jobs for this customer',
                                style: AeraTypography.bodySm,
                              );
                            }
                            return DropdownButtonFormField<String>(
                              // Only preselect when the job is actually in
                              // the eligible list (a completed/cancelled job
                              // passed in from job detail is filtered out).
                              initialValue: eligible.any((j) => j.id == _jobId)
                                  ? _jobId
                                  : null,
                              isExpanded: true,
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: AeraColors.surface,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: AeraRadii.borderMd,
                                  borderSide: const BorderSide(
                                    color: AeraColors.line,
                                  ),
                                ),
                                hintText: 'No job — standalone quote',
                              ),
                              items: eligible
                                  .map(
                                    (j) => DropdownMenuItem(
                                      value: j.id,
                                      child: Text(
                                        '#${j.jobNumber} · ${j.serviceType}',
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  )
                                  .toList(),
                              onChanged: (value) =>
                                  setState(() => _jobId = value),
                            );
                          },
                        );
                      },
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'QUOTE TYPE',
                      style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _quoteKinds.contains(_kind) ? _kind : null,
                      isExpanded: true,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AeraColors.surface,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: AeraRadii.borderMd,
                          borderSide: const BorderSide(color: AeraColors.line),
                        ),
                      ),
                      items: _quoteKinds
                          .map(
                            (k) => DropdownMenuItem(
                              value: k,
                              child: Text(k.replaceAll('_', ' ')),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => _kind = value ?? 'GENERAL'),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'BASIS JOB (OPTIONAL)',
                      style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'e.g. the completed diagnostic this repair quote follows',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.inkSoft,
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Consumer(
                      builder: (context, ref, _) {
                        final jobsAsync = ref.watch(
                          customerJobsProvider(customerId),
                        );
                        return jobsAsync.when(
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                          error: (error, _) => Text(
                            error is ApiException
                                ? error.message
                                : 'Could not load jobs',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.danger,
                            ),
                          ),
                          data: (page) {
                            // Basis jobs are typically completed work the
                            // new quote builds on (e.g. a finished
                            // diagnostic). Backend only requires same
                            // customer ownership.
                            final basisEligible = page.items
                                .where((j) => j.status == 'COMPLETED')
                                .toList();
                            if (basisEligible.isEmpty) {
                              return Text(
                                'No completed jobs for this customer',
                                style: AeraTypography.bodySm,
                              );
                            }
                            return DropdownButtonFormField<String>(
                              initialValue:
                                  basisEligible.any((j) => j.id == _basisJobId)
                                  ? _basisJobId
                                  : null,
                              isExpanded: true,
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: AeraColors.surface,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: AeraRadii.borderMd,
                                  borderSide: const BorderSide(
                                    color: AeraColors.line,
                                  ),
                                ),
                                hintText: 'None',
                              ),
                              items: basisEligible
                                  .map(
                                    (j) => DropdownMenuItem(
                                      value: j.id,
                                      child: Text(
                                        '#${j.jobNumber} · ${j.serviceType}',
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  )
                                  .toList(),
                              onChanged: (value) =>
                                  setState(() => _basisJobId = value),
                            );
                          },
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Line items
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Line Items (${_items.length})',
                  style: AeraTypography.h3.copyWith(fontSize: 15),
                ),
                TextButton.icon(
                  onPressed: () => setState(() => _items.add(_DraftItem())),
                  icon: const Icon(
                    Icons.add,
                    size: 16,
                    color: AeraColors.accent,
                  ),
                  label: Text(
                    'Add Item',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.accent,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            for (final item in _items)
              Padding(
                key: ValueKey(item.descriptionController),
                padding: const EdgeInsets.only(bottom: 10),
                child: AeraCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: AeraTextField(
                              label: 'Description',
                              hintText: 'e.g. Compressor replacement',
                              controller: item.descriptionController,
                            ),
                          ),
                          if (_items.length > 1)
                            IconButton(
                              icon: const Icon(
                                Icons.delete_outline,
                                size: 20,
                                color: AeraColors.outline,
                              ),
                              onPressed: () => setState(() {
                                _items.remove(item);
                                item.dispose();
                              }),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: AeraTextField(
                              label: 'Quantity',
                              controller: item.quantityController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                  ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: AeraTextField(
                              label: 'Unit price',
                              hintText: '0.00',
                              controller: item.unitPriceController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                  ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        ],
                      ),
                      if (item.quantityError != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          item.quantityError!,
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.danger,
                            fontSize: 12,
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: AeraColors.surfaceSubtle,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Line total (approximate)',
                              style: AeraTypography.bodySm.copyWith(
                                fontSize: 12,
                                color: AeraColors.inkSoft,
                                fontStyle: FontStyle.italic,
                              ),
                            ),
                            Text(
                              '$_currency ${item.previewTotal.toStringAsFixed(2)}',
                              style: AeraTypography.h3.copyWith(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 10),

            // Currency / discount / tax
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: AeraTextField(
                          label: 'Currency',
                          hintText: 'USD',
                          controller: _currencyController,
                          onChanged: (val) {
                            _currency = val.trim().toUpperCase();
                            setState(() {});
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: AeraTextField(
                          label: 'Discount (flat amount)',
                          hintText: '0.00',
                          controller: _discountController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AeraTextField(
                    label: 'Tax rate (%)',
                    hintText: '0.00',
                    controller: _taxRateController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _depositType,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: 'Deposit required (optional)',
                      filled: true,
                      fillColor: AeraColors.surface,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: AeraRadii.borderMd,
                        borderSide:
                            const BorderSide(color: AeraColors.line),
                      ),
                    ),
                    items: const [
                      DropdownMenuItem(value: null, child: Text('None')),
                      DropdownMenuItem(
                        value: 'FIXED',
                        child: Text('Fixed amount'),
                      ),
                      DropdownMenuItem(
                        value: 'PERCENT',
                        child: Text('Percent of total'),
                      ),
                    ],
                    onChanged: (v) =>
                        setState(() => _depositType = v),
                  ),
                  if (_depositType != null) ...[
                    const SizedBox(height: 10),
                    AeraTextField(
                      label: _depositType == 'FIXED'
                          ? 'Deposit amount (\$)'
                          : 'Deposit percent (%)',
                      hintText: _depositType == 'FIXED' ? '0.00' : '25',
                      controller: _depositValueController,
                      keyboardType:
                          const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Preview summary — server recomputes the authoritative totals
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _calcRow(
                    'Subtotal (preview)',
                    '$_currency ${_previewSubtotal.toStringAsFixed(2)}',
                  ),
                  const SizedBox(height: 8),
                  _calcRow(
                    'Discount (preview)',
                    '-$_currency ${_previewDiscount.toStringAsFixed(2)}',
                  ),
                  const SizedBox(height: 8),
                  _calcRow(
                    'Tax (preview)',
                    '$_currency ${_previewTax.toStringAsFixed(2)}',
                  ),
                  const SizedBox(height: 12),
                  const Divider(color: AeraColors.line),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Total (approximate)',
                        style: AeraTypography.h2.copyWith(
                          fontSize: 17,
                          color: AeraColors.inkSoft,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                      Text(
                        '$_currency ${_previewTotal.toStringAsFixed(2)}',
                        style: AeraTypography.money.copyWith(
                          fontSize: 22,
                          color: AeraColors.accent,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Final totals are computed and confirmed by the server on save.',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.outline,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            AeraButton(
              text: 'Save Draft Quote',
              icon: const Icon(
                Icons.save_outlined,
                size: 18,
                color: Colors.white,
              ),
              isLoading: _saving,
              onPressed: _saving ? null : _submit,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _calcRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
        ),
        Text(
          value,
          style: AeraTypography.bodyMedium.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
