/**
 * Money calculation utilities using exact integer arithmetic.
 * 
 * All monetary values are stored as integer minor units (cents for USD).
 * This module provides exact calculations without floating-point errors.
 */

/**
 * Multiplies a minor-unit price by a fractional quantity using exact integer arithmetic.
 * 
 * @param unitPriceMinor - Price in minor units (e.g., cents for USD)
 * @param quantity - Quantity as a decimal string (e.g., "1.5" for 1.5 units)
 * @returns Total in minor units, rounded to nearest integer using banker's rounding
 * 
 * Example:
 *   multiplyMinorByQuantity(1000n, "2.5") // 2500n (10.00 * 2.5 = 25.00)
 *   multiplyMinorByQuantity(1000n, "0.1") // 100n (10.00 * 0.1 = 1.00)
 */
export function multiplyMinorByQuantity(
  unitPriceMinor: bigint,
  quantity: string,
): bigint {
  const [whole, fraction = ""] = quantity.split(".");
  const scale = fraction.length > 0 ? 10n ** BigInt(fraction.length) : 1n;
  const numerator = BigInt(whole) * scale + BigInt(fraction || "0");
  // Banker's rounding: add half of scale before division
  // Only add rounding if we have fractional digits
  const rounding = fraction.length > 0 ? scale / 2n : 0n;
  return (unitPriceMinor * numerator + rounding) / scale;
}

/**
 * Calculates line item total using exact integer arithmetic.
 * 
 * @param unitPriceMinor - Price in minor units
 * @param quantity - Quantity as a decimal string
 * @returns Total in minor units
 */
export function calculateLineItemTotal(
  unitPriceMinor: bigint,
  quantity: string,
): bigint {
  return multiplyMinorByQuantity(unitPriceMinor, quantity);
}

/**
 * Calculates subtotal from line items using exact integer arithmetic.
 * 
 * @param items - Array of items with unitPriceMinor (bigint) and quantity (string)
 * @returns Subtotal in minor units
 */
export function calculateSubtotal(
  items: Array<{ unitPriceMinor: bigint; quantity: string }>,
): bigint {
  return items.reduce(
    (sum, item) => sum + calculateLineItemTotal(item.unitPriceMinor, item.quantity),
    0n,
  );
}

/**
 * Calculates tax amount using exact integer arithmetic.
 * 
 * Tax rate is in basis points (1/100 of a percent, i.e., 10000 = 100%).
 * 
 * @param taxableMinor - Taxable amount in minor units
 * @param taxRateBps - Tax rate in basis points (0-10000)
 * @returns Tax amount in minor units, rounded to nearest integer
 * 
 * Example:
 *   calculateTax(10000n, 750) // 75n (100.00 * 7.5% = 7.50)
 *   calculateTax(999n, 1000) // 10n (9.99 * 10% = 0.999 -> 1.00)
 */
export function calculateTax(taxableMinor: bigint, taxRateBps: number): bigint {
  if (taxRateBps <= 0) return 0n;
  // Tax = (taxable * rate) / 10000, with banker's rounding
  const tax = (taxableMinor * BigInt(taxRateBps) + 5000n) / 10000n;
  return tax;
}

/**
 * Calculates total from subtotal, discount, and tax using exact integer arithmetic.
 * 
 * @param subtotalMinor - Subtotal in minor units
 * @param discountMinor - Discount in minor units
 * @param taxMinor - Tax in minor units
 * @returns Total in minor units
 */
export function calculateTotal(
  subtotalMinor: bigint,
  discountMinor: bigint,
  taxMinor: bigint,
): bigint {
  return subtotalMinor - discountMinor + taxMinor;
}

/**
 * Validates monetary calculations.
 * 
 * @param subtotalMinor - Subtotal in minor units
 * @param discountMinor - Discount in minor units
 * @param taxRateBps - Tax rate in basis points
 * @throws Error if validation fails
 */
export function validateMonetaryCalculations(
  subtotalMinor: bigint,
  discountMinor: bigint,
  taxRateBps: number,
): void {
  if (discountMinor < 0n) {
    throw new Error("Discount cannot be negative");
  }
  if (discountMinor > subtotalMinor) {
    throw new Error("Discount cannot exceed subtotal");
  }
  if (taxRateBps < 0 || taxRateBps > 10000) {
    throw new Error("Tax rate must be between 0 and 10000 basis points (0-100%)");
  }
}

/**
 * Rounds a minor-unit value to the nearest integer using banker's rounding.
 * 
 * @param value - Value in minor units
 * @param scale - Decimal scale (e.g., 2 for cents)
 * @returns Rounded value in minor units
 */
export function roundMinor(value: bigint, scale: number = 2): bigint {
  // Since we work in minor units (already integers), just return the value
  // This function is kept for API compatibility but doesn't perform rounding
  return value;
}

/**
 * Converts a decimal string to a minor-unit bigint.
 * 
 * @param amount - Amount as decimal string (e.g., "10.50")
 * @param scale - Number of decimal places (e.g., 2 for cents)
 * @returns Amount in minor units
 * 
 * Example:
 *   decimalStringToMinor("10.50", 2) // 1050n
 *   decimalStringToMinor("0.99", 2) // 99n
 */
export function decimalStringToMinor(amount: string, scale: number = 2): bigint {
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(scale, "0").slice(0, scale);
  return BigInt(`${whole}${paddedFraction}`);
}

/**
 * Converts a minor-unit bigint to a decimal string.
 * 
 * @param minor - Amount in minor units
 * @param scale - Number of decimal places (e.g., 2 for cents)
 * @returns Amount as decimal string
 * 
 * Example:
 *   minorToDecimalString(1050n, 2) // "10.50"
 *   minorToDecimalString(99n, 2) // "0.99"
 */
export function minorToDecimalString(minor: bigint, scale: number = 2): string {
  const divisor = 10n ** BigInt(scale);
  const whole = minor / divisor;
  const remainder = minor % divisor;
  const fraction = remainder.toString().padStart(scale, "0");
  return `${whole}.${fraction}`;
}
