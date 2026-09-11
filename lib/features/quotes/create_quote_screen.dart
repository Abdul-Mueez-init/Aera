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
  // Preview only — the server recomputes and returns the authoritative
  // total. Never treat this as truth.
  double get previewTotal => quantity * unitPrice;

  void dispose() {
    descriptionController.dispose();
    quantityController.dispose();
    unitPriceController.dispose();
  }
}

class CreateQuoteScreen extends ConsumerStatefulWidget {
  const CreateQuoteScreen({super.key});

  @override
  ConsumerState<CreateQuoteScreen> createState() => _CreateQuoteScreenState();
}

class _CreateQuoteScreenState extends ConsumerState<CreateQuoteScreen> {
  String? _customerId;
  String? _jobId;
  String _currency = 'USD';
  final _currencyController = TextEditingController(text: 'USD');
  final _discountController = TextEditingController(text: '0');
  final _taxRateController = TextEditingController(text: '0');
  final List<_DraftItem> _items = [_DraftItem()];
  bool _saving = false;

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

  double get _previewSubtotal =>
      _items.fold(0, (sum, it) => sum + it.previewTotal);
  double get _previewDiscount =>
      double.tryParse(_discountController.text.trim()) ?? 0;
  double get _previewTaxRatePct =>
      double.tryParse(_taxRateController.text.trim()) ?? 0;
  double get _previewTaxable => _previewSubtotal - _previewDiscount;
  double get _previewTax => _previewTaxable * (_previewTaxRatePct / 100);
  double get _previewTotal => _previewTaxable + _previewTax;

  Future<void> _submit() async {
    if (_customerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a customer for this quote')),
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
              currency: _currency,
              discountMinor: (_previewDiscount * 100).round(),
              taxRateBps: (_previewTaxRatePct * 100).round(),
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
    final customersAsync = ref.watch(customersListProvider);
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
                        initialValue: customerId,
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
                              initialValue: _jobId,
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
                              'Line total (preview)',
                              style: AeraTypography.bodySm.copyWith(
                                fontSize: 12,
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
                        'Total (preview)',
                        style: AeraTypography.h2.copyWith(fontSize: 17),
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
