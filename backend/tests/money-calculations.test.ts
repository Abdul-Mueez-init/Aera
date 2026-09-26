import { describe, it, expect } from "vitest";
import {
  multiplyMinorByQuantity,
  calculateLineItemTotal,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
  validateMonetaryCalculations,
  roundMinor,
  decimalStringToMinor,
  minorToDecimalString,
} from "../src/common/money/money.service.js";

describe("Money Calculations - Exact Integer Arithmetic", () => {
  describe("multiplyMinorByQuantity", () => {
    it("should multiply integer quantities correctly", () => {
      expect(multiplyMinorByQuantity(1000n, "2")).toBe(2000n); // 10.00 * 2 = 20.00
      expect(multiplyMinorByQuantity(1000n, "10")).toBe(10000n); // 10.00 * 10 = 100.00
    });

    it("should multiply fractional quantities correctly", () => {
      expect(multiplyMinorByQuantity(1000n, "0.5")).toBe(500n); // 10.00 * 0.5 = 5.00
      expect(multiplyMinorByQuantity(1000n, "1.5")).toBe(1500n); // 10.00 * 1.5 = 15.00
      expect(multiplyMinorByQuantity(1000n, "2.5")).toBe(2500n); // 10.00 * 2.5 = 25.00
    });

    it("should handle small fractional quantities", () => {
      expect(multiplyMinorByQuantity(1000n, "0.1")).toBe(100n); // 10.00 * 0.1 = 1.00
      expect(multiplyMinorByQuantity(1000n, "0.01")).toBe(10n); // 10.00 * 0.01 = 0.10
      expect(multiplyMinorByQuantity(1000n, "0.001")).toBe(1n); // 10.00 * 0.001 = 0.01
    });

    it("should handle edge cases that cause floating-point errors", () => {
      // Classic floating-point problem: 0.1 + 0.2 !== 0.3
      // With exact arithmetic: 10.00 * 0.1 = 1.00, 10.00 * 0.2 = 2.00, sum = 3.00
      const result1 = multiplyMinorByQuantity(1000n, "0.1");
      const result2 = multiplyMinorByQuantity(1000n, "0.2");
      const result3 = multiplyMinorByQuantity(1000n, "0.3");
      expect(result1 + result2).toBe(result3); // Exact arithmetic

      // Another classic: 0.1 + 0.7 !== 0.8 in floating point
      const result4 = multiplyMinorByQuantity(1000n, "0.1");
      const result5 = multiplyMinorByQuantity(1000n, "0.7");
      const result6 = multiplyMinorByQuantity(1000n, "0.8");
      expect(result4 + result5).toBe(result6); // Exact arithmetic
    });

    it("should use banker's rounding for half-cent cases", () => {
      // 10.00 * 0.005 = 0.05 (exact)
      expect(multiplyMinorByQuantity(1000n, "0.005")).toBe(5n);
      
      // 10.00 * 0.015 = 0.15 (exact)
      expect(multiplyMinorByQuantity(1000n, "0.015")).toBe(15n);
    });

    it("should handle large values", () => {
      expect(multiplyMinorByQuantity(100000000n, "1000")).toBe(100000000000n);
      expect(multiplyMinorByQuantity(100000000n, "1.5")).toBe(150000000n);
    });

    it("should handle zero quantity", () => {
      expect(multiplyMinorByQuantity(1000n, "0")).toBe(0n);
    });

    it("should handle zero price", () => {
      expect(multiplyMinorByQuantity(0n, "2.5")).toBe(0n);
    });
  });

  describe("calculateLineItemTotal", () => {
    it("should be an alias for multiplyMinorByQuantity", () => {
      expect(calculateLineItemTotal(1000n, "2.5")).toBe(multiplyMinorByQuantity(1000n, "2.5"));
    });
  });

  describe("calculateSubtotal", () => {
    it("should sum line item totals correctly", () => {
      const items = [
        { unitPriceMinor: 1000n, quantity: "2" }, // 20.00
        { unitPriceMinor: 500n, quantity: "1" },  // 5.00
        { unitPriceMinor: 250n, quantity: "4" },  // 10.00
      ];
      expect(calculateSubtotal(items)).toBe(3500n); // 35.00
    });

    it("should handle fractional quantities in subtotal", () => {
      const items = [
        { unitPriceMinor: 1000n, quantity: "1.5" }, // 15.00
        { unitPriceMinor: 500n, quantity: "0.5" },  // 2.50
      ];
      expect(calculateSubtotal(items)).toBe(1750n); // 17.50
    });

    it("should handle empty items array", () => {
      expect(calculateSubtotal([])).toBe(0n);
    });

    it("should handle single item", () => {
      const items = [{ unitPriceMinor: 1000n, quantity: "3" }];
      expect(calculateSubtotal(items)).toBe(3000n);
    });
  });

  describe("calculateTax", () => {
    it("should calculate tax correctly for common rates", () => {
      expect(calculateTax(10000n, 0)).toBe(0n); // 0% tax
      expect(calculateTax(10000n, 1000)).toBe(1000n); // 10% tax on 100.00 = 10.00
      expect(calculateTax(10000n, 750)).toBe(750n); // 7.5% tax on 100.00 = 7.50
      expect(calculateTax(10000n, 10000)).toBe(10000n); // 100% tax on 100.00 = 100.00
    });

    it("should handle half-cent rounding correctly", () => {
      // 9.99 * 10% = 0.999 -> 1.00
      expect(calculateTax(999n, 1000)).toBe(100n);
      
      // 10.01 * 10% = 1.001 -> 1.00
      expect(calculateTax(1001n, 1000)).toBe(100n);
      
      // 10.00 * 7.5% = 0.75 -> 0.75 (exact)
      expect(calculateTax(1000n, 750)).toBe(75n);
    });

    it("should handle edge cases with half-cent rounding", () => {
      // 1.00 * 5% = 0.05 (exact)
      expect(calculateTax(100n, 500)).toBe(5n);
      
      // 1.00 * 3% = 0.03 (exact)
      expect(calculateTax(100n, 300)).toBe(3n);
      
      // 1.00 * 1% = 0.01 (exact)
      expect(calculateTax(100n, 100)).toBe(1n);
    });

    it("should handle zero tax rate", () => {
      expect(calculateTax(10000n, 0)).toBe(0n);
    });

    it("should handle negative tax rate (returns 0)", () => {
      expect(calculateTax(10000n, -100)).toBe(0n);
    });

    it("should handle large values", () => {
      expect(calculateTax(100000000n, 1000)).toBe(10000000n);
    });
  });

  describe("calculateTotal", () => {
    it("should calculate total correctly", () => {
      expect(calculateTotal(10000n, 1000n, 900n)).toBe(9900n); // 100 - 10 + 9 = 99
      expect(calculateTotal(5000n, 500n, 450n)).toBe(4950n); // 50 - 5 + 4.5 = 49.5
    });

    it("should handle zero discount", () => {
      expect(calculateTotal(10000n, 0n, 1000n)).toBe(11000n);
    });

    it("should handle zero tax", () => {
      expect(calculateTotal(10000n, 1000n, 0n)).toBe(9000n);
    });

    it("should handle zero discount and tax", () => {
      expect(calculateTotal(10000n, 0n, 0n)).toBe(10000n);
    });
  });

  describe("validateMonetaryCalculations", () => {
    it("should pass valid calculations", () => {
      expect(() => validateMonetaryCalculations(10000n, 1000n, 750)).not.toThrow();
      expect(() => validateMonetaryCalculations(10000n, 0n, 0)).not.toThrow();
      expect(() => validateMonetaryCalculations(10000n, 10000n, 10000)).not.toThrow();
    });

    it("should throw on negative discount", () => {
      expect(() => validateMonetaryCalculations(10000n, -100n, 750)).toThrow("Discount cannot be negative");
    });

    it("should throw on discount exceeding subtotal", () => {
      expect(() => validateMonetaryCalculations(10000n, 11000n, 750)).toThrow("Discount cannot exceed subtotal");
    });

    it("should throw on negative tax rate", () => {
      expect(() => validateMonetaryCalculations(10000n, 1000n, -100)).toThrow("Tax rate must be between 0 and 10000");
    });

    it("should throw on tax rate exceeding 100%", () => {
      expect(() => validateMonetaryCalculations(10000n, 1000n, 10001)).toThrow("Tax rate must be between 0 and 10000");
    });
  });

  describe("roundMinor", () => {
    it("should return value unchanged (minor units are already integers)", () => {
      expect(roundMinor(5n, 2)).toBe(5n);
      expect(roundMinor(15n, 2)).toBe(15n);
      expect(roundMinor(25n, 2)).toBe(25n);
    });

    it("should handle different scales", () => {
      expect(roundMinor(12345n, 2)).toBe(12345n);
      expect(roundMinor(12345n, 1)).toBe(12345n);
      expect(roundMinor(12345n, 0)).toBe(12345n);
    });
  });

  describe("decimalStringToMinor", () => {
    it("should convert decimal strings to minor units", () => {
      expect(decimalStringToMinor("10.50", 2)).toBe(1050n);
      expect(decimalStringToMinor("0.99", 2)).toBe(99n);
      expect(decimalStringToMinor("100.00", 2)).toBe(10000n);
      expect(decimalStringToMinor("1", 2)).toBe(100n);
    });

    it("should handle values without decimal part", () => {
      expect(decimalStringToMinor("10", 2)).toBe(1000n);
      expect(decimalStringToMinor("0", 2)).toBe(0n);
    });

    it("should pad fractional part", () => {
      expect(decimalStringToMinor("10.5", 2)).toBe(1050n);
      expect(decimalStringToMinor("10.1", 2)).toBe(1010n);
    });

    it("should truncate excess fractional digits", () => {
      expect(decimalStringToMinor("10.555", 2)).toBe(1055n);
      expect(decimalStringToMinor("10.999", 2)).toBe(1099n);
    });
  });

  describe("minorToDecimalString", () => {
    it("should convert minor units to decimal strings", () => {
      expect(minorToDecimalString(1050n, 2)).toBe("10.50");
      expect(minorToDecimalString(99n, 2)).toBe("0.99");
      expect(minorToDecimalString(10000n, 2)).toBe("100.00");
      expect(minorToDecimalString(100n, 2)).toBe("1.00");
    });

    it("should handle zero", () => {
      expect(minorToDecimalString(0n, 2)).toBe("0.00");
    });

    it("should handle different scales", () => {
      expect(minorToDecimalString(1050n, 2)).toBe("10.50");
      expect(minorToDecimalString(10500n, 3)).toBe("10.500");
    });
  });

  describe("Integration tests - full quote calculation", () => {
    it("should calculate complete quote totals correctly", () => {
      const items = [
        { unitPriceMinor: 10000n, quantity: "2" }, // 200.00
        { unitPriceMinor: 5000n, quantity: "1.5" }, // 75.00
        { unitPriceMinor: 2500n, quantity: "0.5" }, // 12.50
      ];
      
      const subtotalMinor = calculateSubtotal(items); // 287.50
      const discountMinor = 1000n; // 10.00
      const taxableMinor = subtotalMinor - discountMinor; // 277.50
      const taxRateBps = 750; // 7.5%
      const taxMinor = calculateTax(taxableMinor, taxRateBps); // 20.81
      const totalMinor = calculateTotal(subtotalMinor, discountMinor, taxMinor); // 298.31
      
      expect(subtotalMinor).toBe(28750n);
      expect(taxMinor).toBe(2081n);
      expect(totalMinor).toBe(29831n);
    });

    it("should handle fractional quantities that cause floating-point issues", () => {
      const items = [
        { unitPriceMinor: 1000n, quantity: "0.1" }, // 1.00
        { unitPriceMinor: 1000n, quantity: "0.2" }, // 2.00
        { unitPriceMinor: 1000n, quantity: "0.3" }, // 3.00
      ];
      
      const subtotalMinor = calculateSubtotal(items);
      expect(subtotalMinor).toBe(600n); // Exactly 6.00
    });

    it("should handle tax rates that produce half-cent results", () => {
      const subtotalMinor = 999n; // 9.99
      const discountMinor = 0n;
      const taxRateBps = 1000; // 10%
      const taxMinor = calculateTax(subtotalMinor - discountMinor, taxRateBps);
      
      // 9.99 * 10% = 0.999 -> 1.00
      expect(taxMinor).toBe(100n);
    });
  });
});
