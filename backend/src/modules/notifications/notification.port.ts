export interface NotificationEvent {
  type:
    | "JOB_SCHEDULED"
    | "JOB_RESCHEDULED"
    | "JOB_ASSIGNED"
    | "QUOTE_SENT"
    | "QUOTE_APPROVED"
    | "QUOTE_DECLINED"
    | "INVOICE_ISSUED";
  companyId: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  recipientUserId?: string;
}

export interface NotificationPublisher {
  publish(event: NotificationEvent): Promise<void>;
}

export const notificationPublisher: NotificationPublisher = {
  async publish(_event: NotificationEvent): Promise<void> {
    // Deliberately non-blocking until a push/email adapter is configured.
    void _event;
  },
};