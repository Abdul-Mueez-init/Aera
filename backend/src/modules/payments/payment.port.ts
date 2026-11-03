export interface PaymentRequest {
  amountMinor: bigint;
  currency: string;
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
  reference?: string;
  idempotencyKey: string;
}

export interface CheckoutRequest {
  amountMinor: bigint;
  currency: string;
  invoiceId: string;
  idempotencyKey: string;
  returnUrl: string;
}

export interface CheckoutResult {
  providerSessionId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export interface VerifiedWebhook {
  eventId: string;
  type: string;
  providerSessionId?: string;
  paymentId?: string;
  amountMinor?: bigint;
  currency?: string;
}

export interface PaymentProvider {
  readonly name: string;
  recordPayment(request: PaymentRequest): Promise<{
    providerPaymentId?: string;
  }>;
  createCheckout?(request: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhook?(rawBody: Buffer, headers: Record<string, string | undefined>): VerifiedWebhook;
  refund?(paymentId: string, amountMinor: bigint, reason: string): Promise<{
    providerRefundId?: string;
  }>;
}

export const manualPaymentProvider: PaymentProvider = {
  name: "manual",
  async recordPayment(_request) {
    void _request;
    return {};
  },
  async createCheckout(_request) {
    throw new Error("Online checkout is not enabled for the manual provider");
  },
  verifyWebhook() {
    throw new Error("Webhooks are not supported by the manual provider");
  },
  async refund() {
    throw new Error("Provider refunds are not supported by the manual provider");
  },
};
