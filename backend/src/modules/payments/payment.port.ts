export interface PaymentRequest {
  amountMinor: bigint;
  currency: string;
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
  reference?: string;
}

export interface PaymentProvider {
  readonly name: string;
  recordPayment(request: PaymentRequest): Promise<{
    providerPaymentId?: string;
  }>;
}

export const manualPaymentProvider: PaymentProvider = {
  name: "manual",
  async recordPayment(_request) {
    void _request;
    return {};
  },
};
