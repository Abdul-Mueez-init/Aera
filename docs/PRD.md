# 02 — Product Requirements Document (PRD)

## 1. Product summary

Aera is a multi-tenant SaaS application for field-service businesses. Flutter provides the primary mobile experience. A custom Node.js/TypeScript REST API owns authentication, authorization, business rules, persistence, automation and integrations.

## 2. User stories

### Owner / manager
- I can create my company and invite team members.
- I can see today’s schedule and workload.
- I can create and edit customers.
- I can create a service job and assign a technician.
- I can send a quote and see whether it is approved.
- I can see job progress and evidence.
- I can issue an invoice and record a payment.
- I can search customer/job history.
- I can ask operational questions through AI.

### Dispatcher
- I can view the schedule by day.
- I can assign/reassign technicians.
- I can identify overdue or unassigned jobs.
- I can reschedule without losing job history.

### Technician
- I can see today’s assigned jobs.
- I can open a job and navigate to the customer.
- I can change job status.
- I can add notes.
- I can upload photos.
- I can log parts used.
- I can complete a job with a completion summary.

### Customer
- I can view my appointment details.
- I can review/approve a quote.
- I can see technician/service status when enabled.
- I can view invoices and payment state.
- I can leave a review after completed work.

## 3. Feature requirements

### A. Authentication & onboarding
MVP:
- Register/login.
- Secure password hashing.
- Access token + rotating refresh token.
- Logout/revoke session.
- Current-user endpoint.
- Company creation.
- Team invitations.
- Roles: owner, dispatcher, technician.

Acceptance:
- Invalid/expired tokens are rejected.
- Passwords are never stored in plaintext.
- Membership determines company context server-side.

### B. Customers
MVP:
- Create/read/update/archive customer.
- Multiple service addresses.
- Contact preferences.
- Search by name/phone/email.
- Customer detail includes recent jobs/invoices.

### C. Jobs
MVP:
- Create job.
- Assign customer/address.
- Job type/problem description.
- Priority.
- Status history.
- Assign technician.
- Schedule/reschedule.
- Internal notes.
- Customer-visible notes.

Suggested statuses:
`NEW`, `QUOTING`, `SCHEDULED`, `EN_ROUTE`, `IN_PROGRESS`, `WAITING_PARTS`, `COMPLETED`, `CANCELLED`.

### D. Quotes
MVP:
- Create quote with line items.
- Tax/discount support.
- Send/share quote.
- Customer approval/decline.
- Approval timestamp and actor.
- Approved quote can convert to/activate a job workflow.

### E. Technician execution
MVP:
- Today view.
- Job start/stop.
- Notes.
- Photo upload.
- Parts used.
- Completion summary.
- Offline draft capture for notes/photos, with sync queue as a V1 feature.

### F. Invoices & payments
MVP:
- Generate invoice from completed work/quote.
- Invoice line items.
- Status: `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`, `OVERDUE`.
- Record payment.
- Payment audit record.
- Customer invoice view.

Payment gateway integration should be abstracted behind a provider interface so Stripe or a region-specific processor can be added without rewriting billing logic.

### G. Notifications
MVP:
- Appointment created/changed.
- Technician assigned.
- Quote approval/decline.
- Invoice issued.
- Job completed.

Channels:
- Push notification first.
- Email/SMS provider behind an adapter.

### H. AI Job Assistant
V1, after the data model is stable.

Capabilities:
- Summarize customer/job history.
- Explain the reason a job is flagged at risk.
- Answer metrics questions using server-authorized data.
- Suggest operational actions.

Hard rule: LLM output must never directly mutate production records. Tool calls must go through typed, server-side commands with authorization and validation.

## 4. Dashboard metrics

MVP:
- Today’s jobs.
- Jobs by status.
- Unassigned jobs.
- Outstanding invoices.
- Revenue collected this month.

V1:
- Quote conversion.
- Average job duration.
- Technician utilization.
- Repeat customer rate.
- Aging invoices.

## 5. Key screens

### Owner/dispatcher
- Login.
- Company setup.
- Home dashboard.
- Schedule.
- Jobs list.
- Job detail.
- Customers.
- Customer detail.
- Quote editor.
- Invoice detail.
- Team.
- Notifications.
- AI assistant.
- Settings.

### Technician
- Today.
- Job detail.
- Start job.
- Job execution.
- Add note.
- Add photo.
- Parts.
- Complete job.

### Customer portal
- Appointment.
- Quote.
- Invoice.
- Service history.
- Review.

## 6. Prioritization

### P0 — mandatory
Auth, tenancy, customers, jobs, assignments, schedule, technician execution, photos, invoices, activity/audit trail.

### P1 — premium differentiation
Quotes, customer approvals, push notifications, customer portal, AI operational assistant.

### P2 — growth
Payments, analytics, recurring maintenance plans, route optimization, inventory, richer integrations.

## 7. Critical business invariants

- Every business record belongs to exactly one company.
- Every employee action is checked against current company membership and role.
- A technician can only modify jobs assigned to them or actions explicitly permitted by role.
- Invoice totals are computed/validated server-side.
- Payment totals cannot make an invoice negative or overpaid without explicit business logic.
- Job status transitions are validated; clients cannot jump to arbitrary states.
- Destructive operations are soft-delete/archive where auditability matters.
- Money is stored as integer minor units, never floating point.

## Requirement ownership

This file owns user stories, functional requirements, acceptance criteria, business invariants, prioritization, and MVP behavior. It does not own database table definitions, architecture decisions, visual tokens, or coding workflow rules.
