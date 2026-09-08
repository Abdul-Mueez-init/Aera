# 05 — Database Schema Blueprint

## 1. Schema conventions

- PostgreSQL.
- UUID primary keys.
- `created_at` and `updated_at` for mutable entities.
- UTC timestamps with timezone.
- `deleted_at` only where soft deletion is required.
- Money as integer minor units (`BIGINT`), plus currency code.
- Foreign keys with deliberate `ON DELETE` behavior.
- Unique constraints for natural tenant-scoped identities.
- Explicit indexes for high-frequency filters.

## 2. Proposed tables

### users
```text
id UUID PK
email CITEXT UNIQUE NULLABLE
phone TEXT UNIQUE NULLABLE
password_hash TEXT NULLABLE
first_name TEXT
last_name TEXT
avatar_url TEXT NULLABLE
is_active BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### companies
```text
id UUID PK
name TEXT
slug TEXT UNIQUE
timezone TEXT
default_currency CHAR(3)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### company_members
```text
id UUID PK
company_id UUID FK
user_id UUID FK
role TEXT/ENUM
status TEXT/ENUM
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
UNIQUE(company_id, user_id)
```

### customers
```text
id UUID PK
company_id UUID FK
first_name TEXT
last_name TEXT
email TEXT NULLABLE
phone TEXT NULLABLE
notes TEXT NULLABLE
status TEXT/ENUM
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
deleted_at TIMESTAMPTZ NULLABLE
INDEX(company_id, status)
INDEX(company_id, created_at DESC)
```

### service_addresses
```text
id UUID PK
company_id UUID FK
customer_id UUID FK
label TEXT
line1 TEXT
line2 TEXT NULLABLE
city TEXT
region TEXT NULLABLE
postal_code TEXT NULLABLE
country_code CHAR(2)
lat NUMERIC NULLABLE
lng NUMERIC NULLABLE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### jobs
```text
id UUID PK
company_id UUID FK
customer_id UUID FK
service_address_id UUID FK
assigned_technician_id UUID NULLABLE
job_number BIGINT or tenant-scoped sequence
service_type TEXT
problem_description TEXT
priority TEXT/ENUM
status TEXT/ENUM
scheduled_start TIMESTAMPTZ NULLABLE
scheduled_end TIMESTAMPTZ NULLABLE
started_at TIMESTAMPTZ NULLABLE
completed_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
INDEX(company_id, status, scheduled_start)
INDEX(company_id, assigned_technician_id, scheduled_start)
```

### job_status_history
```text
id UUID PK
company_id UUID FK
job_id UUID FK
actor_user_id UUID FK
from_status TEXT NULLABLE
to_status TEXT
reason TEXT NULLABLE
created_at TIMESTAMPTZ
INDEX(company_id, job_id, created_at DESC)
```

### job_notes
```text
id UUID PK
company_id UUID FK
job_id UUID FK
author_user_id UUID FK
body TEXT
visibility TEXT/ENUM
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### job_photos
```text
id UUID PK
company_id UUID FK
job_id UUID FK
uploaded_by UUID FK
object_key TEXT
thumbnail_key TEXT NULLABLE
mime_type TEXT
size_bytes BIGINT
caption TEXT NULLABLE
created_at TIMESTAMPTZ
```

### job_parts
```text
id UUID PK
company_id UUID FK
job_id UUID FK
name TEXT
quantity NUMERIC
unit_price_minor BIGINT
currency CHAR(3)
created_at TIMESTAMPTZ
```

### quotes
```text
id UUID PK
company_id UUID FK
customer_id UUID FK
job_id UUID NULLABLE
status TEXT/ENUM
subtotal_minor BIGINT
discount_minor BIGINT
tax_minor BIGINT
tax_rate_bps INT
total_minor BIGINT
currency CHAR(3)
expires_at TIMESTAMPTZ NULLABLE
sent_at TIMESTAMPTZ NULLABLE
approved_at TIMESTAMPTZ NULLABLE
declined_at TIMESTAMPTZ NULLABLE
share_token TEXT UNIQUE NULLABLE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### quote_items
```text
id UUID PK
company_id UUID FK
quote_id UUID FK
description TEXT
quantity NUMERIC
unit_price_minor BIGINT
total_minor BIGINT
sort_order INT
```

### quote_approval_events
```text
id UUID PK
company_id UUID FK
quote_id UUID FK
actor_user_id UUID NULLABLE
action TEXT/ENUM
source TEXT
created_at TIMESTAMPTZ
INDEX(company_id, quote_id, created_at DESC)
```

### invoices
```text
id UUID PK
company_id UUID FK
customer_id UUID FK
job_id UUID NULLABLE
quote_id UUID NULLABLE
invoice_number TEXT
status TEXT/ENUM
subtotal_minor BIGINT
discount_minor BIGINT
tax_minor BIGINT
total_minor BIGINT
amount_paid_minor BIGINT
balance_due_minor BIGINT
currency CHAR(3)
due_at TIMESTAMPTZ NULLABLE
issued_at TIMESTAMPTZ NULLABLE
paid_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
UNIQUE(company_id, invoice_number)
UNIQUE(company_id, job_id)
INDEX(company_id, status, due_at)
```

### invoice_items
```text
id UUID PK
company_id UUID FK
invoice_id UUID FK
description TEXT
quantity NUMERIC
unit_price_minor BIGINT
total_minor BIGINT
sort_order INT
```

### payments
```text
id UUID PK
company_id UUID FK
invoice_id UUID FK
amount_minor BIGINT
currency CHAR(3)
method TEXT/ENUM
provider TEXT NULLABLE
provider_payment_id TEXT NULLABLE
reference TEXT NULLABLE
received_at TIMESTAMPTZ
created_by UUID FK NULLABLE
idempotency_key TEXT
created_at TIMESTAMPTZ
UNIQUE(company_id, idempotency_key)
INDEX(company_id, invoice_id, received_at DESC)
```

### customer_portal_tokens
```text
id UUID PK
company_id UUID FK
customer_id UUID FK
created_by UUID NULLABLE FK
token TEXT UNIQUE
expires_at TIMESTAMPTZ
revoked_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ
INDEX(company_id, customer_id, revoked_at, expires_at)
```

### notifications
```text
id UUID PK
company_id UUID FK
recipient_user_id UUID FK
type TEXT
payload JSONB
read_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ
INDEX(recipient_user_id, read_at, created_at DESC)
```

### activity_events
```text
id UUID PK
company_id UUID FK
actor_user_id UUID NULLABLE
entity_type TEXT
entity_id UUID
action TEXT
metadata JSONB
created_at TIMESTAMPTZ
INDEX(company_id, created_at DESC)
INDEX(company_id, entity_type, entity_id, created_at DESC)
```

### refresh_sessions
```text
id UUID PK
company_id UUID FK
user_id UUID FK
token_hash TEXT UNIQUE
expires_at TIMESTAMPTZ
revoked_at TIMESTAMPTZ NULLABLE
replaced_by_session_id UUID NULLABLE
created_at TIMESTAMPTZ
last_used_at TIMESTAMPTZ NULLABLE
INDEX(user_id, revoked_at, expires_at)
```

### ai_conversations
```text
id UUID PK
company_id UUID FK
user_id UUID FK
title TEXT NULLABLE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### ai_messages
```text
id UUID PK
conversation_id UUID FK
role TEXT/ENUM
content TEXT
metadata JSONB NULLABLE
created_at TIMESTAMPTZ
INDEX(conversation_id, created_at)
```

## 3. Data integrity

Prefer database constraints for invariants that PostgreSQL can enforce cheaply, and service-layer validation for workflow rules.

Examples:

- `amount_paid_minor >= 0`.
- `balance_due_minor >= 0`.
- `total_minor = subtotal_minor - discount_minor + tax_minor` verified by service logic and tests.
- Membership uniqueness per company/user.
- Invoice number uniqueness per tenant.

## 4. Tenant isolation

Every tenant-scoped table contains `company_id` even when it can be inferred through a parent. This makes authorization queries explicit and reduces accidental unscoped access.

The service layer must require `companyId` on every tenant-scoped operation.

## 5. Prisma model strategy

Generate Prisma models from the schema, but do not allow Prisma convenience to replace domain rules. Repository helpers should make the safe query shape the default.

Example conceptual repository API:

```ts
jobs.findById({ companyId, jobId })
jobs.list({ companyId, filters })
jobs.updateStatus({ companyId, jobId, actorId, toStatus })
```

Avoid:

```ts
prisma.job.findUnique({ where: { id } })
```

when the operation requires tenant scoping and authorization.
