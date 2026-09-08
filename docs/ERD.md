# 04 — Entity Relationship Diagram

## Logical model

```mermaid
erDiagram
    User ||--o{ CompanyMember : belongs_to
    Company ||--o{ CompanyMember : has
    Company ||--o{ Customer : owns
    Customer ||--o{ ServiceAddress : has
    Company ||--o{ Job : owns
    Customer ||--o{ Job : requests
    ServiceAddress ||--o{ Job : occurs_at
    User ||--o{ Job : assigned_to
    Job ||--o{ JobStatusHistory : tracks
    Job ||--o{ JobNote : contains
    Job ||--o{ JobPhoto : contains
    Job ||--o{ JobPart : uses
    Company ||--o{ Quote : owns
    Customer ||--o{ Quote : receives
    Job ||--o{ Quote : may_have
    Quote ||--o{ QuoteItem : contains
    Company ||--o{ Invoice : owns
    Customer ||--o{ Invoice : receives
    Job ||--o{ Invoice : generates
    Quote ||--o{ Invoice : source
    Invoice ||--o{ InvoiceItem : contains
    Invoice ||--o{ Payment : receives
    Company ||--o{ Notification : owns
    User ||--o{ Notification : receives
    Company ||--o{ ActivityEvent : records
    User ||--o{ ActivityEvent : performs
    Company ||--o{ RefreshSession : owns
    User ||--o{ RefreshSession : has
    Company ||--o{ AiConversation : owns
    User ||--o{ AiConversation : starts
    AiConversation ||--o{ AiMessage : contains
```

## Core entities

### Company
Tenant boundary. All core business data is owned by one company.

### CompanyMember
Join entity linking users to a company and a role.

### Customer
The person/business requesting service.

### ServiceAddress
A customer can have more than one service location.

### Job
The operational center of the product. Contains problem, priority, status, schedule and assignment.

### Quote
Commercial proposal attached to customer/job.

### Invoice
Money owed after approved/finished work.

### Payment
Immutable financial event representing money received/recorded.

### ActivityEvent
Audit/operational history. Important actions should be append-only.

### RefreshSession
Server-side control plane for refresh-token rotation/revocation.

### AiConversation / AiMessage
Stores user-facing AI interactions. Never use raw LLM text as an authorization source.

## Cardinality rules

- One user can belong to many companies.
- One company has many members.
- One customer belongs to one company.
- One customer can have many service addresses.
- One job belongs to one company and one customer.
- One job can have zero or one active technician assignment in MVP.
- One quote belongs to one company and may attach to one job.
- One invoice belongs to one company and can contain many line items.
- One invoice can have many payment events.

## Audit principle

Important state changes are not overwritten without trace. History records preserve who changed what and when.
