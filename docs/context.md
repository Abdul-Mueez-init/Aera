# 01 — Product Context

## 1. Vision

Build a premium, fast, mobile-first field-service operating system that lets a small HVAC/service company run the entire customer-to-cash workflow from one place.

The product must feel like a polished commercial product, not a portfolio CRUD demo.

## 2. Target customer

### Primary ICP
Small-to-mid-sized HVAC, appliance repair, plumbing, electrical, cleaning, pest-control, and similar service businesses with:

- 2–25 technicians.
- One office owner/manager or a small dispatch team.
- Repeated inbound service requests.
- Manual scheduling through calls, WhatsApp/SMS, spreadsheets, or paper.
- Quotes/invoices that are often handled separately from scheduling.

### First niche for portfolio/demo
HVAC companies.

Do not broaden the UX language to every possible trade during MVP. Build the product as an HVAC-first solution with a domain model that can generalize later.

## 3. Problem statement

Service businesses lose time and money when customer information, appointments, technician status, job evidence, quoting, invoicing, and follow-up live in disconnected tools.

The product should reduce four failure modes:

1. Missed or forgotten customer requests.
2. Scheduling/dispatch confusion.
3. Poor visibility into work performed in the field.
4. Slow payment collection and weak customer follow-up.

## 4. Product promise

> “From the first service request to the final payment, every job has one source of truth.”

## 5. Core workflow

```text
Lead
  ↓
Customer
  ↓
Quote (optional)
  ↓
Approved
  ↓
Appointment
  ↓
Dispatch
  ↓
Technician starts job
  ↓
Notes / parts / photos
  ↓
Job completed
  ↓
Invoice
  ↓
Payment
  ↓
Review / follow-up
```

## 6. Personas

### Owner
Wants revenue visibility, fewer missed jobs, faster payments, and confidence that technicians are doing the work.

### Dispatcher / Office Manager
Wants a reliable schedule, quick reassignment, customer context, and clear job status.

### Technician
Wants a frictionless mobile workflow with today's jobs, navigation, customer instructions, notes, photos, and completion.

### Customer
Wants clear appointment information, technician status, quote approval, invoices, and service history.

## 7. Non-goals for MVP

Do not build these until the core job lifecycle is stable:

- Full accounting suite.
- Payroll.
- Inventory/warehouse management.
- Complex route optimization.
- Multi-currency accounting.
- Marketplace for technicians.
- Arbitrary plugin marketplace.
- Full web admin portal with every conceivable setting.

## 8. Product principles

### Fast by default
Every important screen should render useful content immediately and progressively enhance secondary content.

### Low cognitive load
A dispatcher should understand today’s workload in seconds.

### Evidence over decoration
Animations and AI must communicate state, reduce uncertainty, or guide an action.

### Backend is a source of truth
Business rules belong server-side. Flutter is a client, not the authority.

### Safe multi-tenancy
A company must never be able to read or mutate another company’s data, even if a client tampers with an ID.

### Recoverable operations
Actions that create money, schedule, or customer-state changes must be idempotent or transaction-safe.

## 9. Portfolio “wow” moments

1. A new request becomes a job in a few taps.
2. The owner drags/reschedules a job and the technician receives the updated assignment.
3. Technician opens the job and instantly sees customer + HVAC problem + notes + location.
4. Technician captures before/after evidence without leaving the job flow.
5. Completing the job generates/updates the invoice workflow.
6. The owner asks AI: “Which jobs are at risk today?” and receives data-backed answers.
7. Customer sees a clean appointment/status experience instead of a generic form.

## 10. Product success criteria

A demo user should be able to complete this end-to-end flow without manual database intervention:

**Create company → create users → create customer → create job → quote → approve quote → schedule → assign technician → technician starts → add note/photo → complete job → issue invoice → record payment → view activity.**

## Document ownership

This file owns the product vision, target customers, business problems, product promise, personas, product principles, success criteria, and MVP non-goals. Detailed requirements belong in `PRD.md`; visual design and screen mapping belong in `design.md`; implementation sequencing belongs in `plan.md`.
