# Aera Architecture Diagram

## System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[Flutter Mobile App]
        A1[Dashboard]
        A2[Customers]
        A3[Jobs]
        A4[Calendar]
        A5[Quotes]
        A6[Invoices]
        A7[Technician]
        A8[Customer Portal]
    end

    subgraph "API Layer"
        B[Node.js/Express API]
        B1[Authentication]
        B2[Customers Module]
        B3[Jobs Module]
        B4[Scheduling Module]
        B5[Quotes Module]
        B6[Invoices Module]
        B7[Portal Module]
        B8[AI Module]
        B9[Notifications Module]
    end

    subgraph "Business Logic Layer"
        C[Services]
        C1[Auth Service]
        C2[Customer Service]
        C3[Job Service]
        C4[Scheduling Service]
        C5[Quote Service]
        C6[Invoice Service]
        C7[Payment Service]
        C8[AI Gateway Service]
        C9[Notification Service]
    end

    subgraph "Data Access Layer"
        D[Prisma ORM]
        D1[Models]
        D2[Queries]
        D3[Migrations]
    end

    subgraph "Database Layer"
        E[(PostgreSQL)]
        E1[Companies]
        E2[Users]
        E3[Customers]
        E4[Jobs]
        E5[Quotes]
        E6[Invoices]
        E7[Notifications]
    end

    subgraph "External Services"
        F[Supabase]
        F1[PostgreSQL]
        F2[Storage]
        F3[Auth]
        G[AI Provider]
        G1[Gemini API]
        H[Email Service]
        H1[Resend]
        I[SMS Service]
        I1[TextBee]
        J[Push Service]
        J1[FCM]
    end

    A --> B
    A1 --> B2
    A2 --> B2
    A3 --> B3
    A4 --> B4
    A5 --> B5
    A6 --> B6
    A7 --> B3
    A8 --> B7

    B --> C
    B1 --> C1
    B2 --> C2
    B3 --> C3
    B4 --> C4
    B5 --> C5
    B6 --> C6
    B7 --> C2
    B8 --> C8
    B9 --> C9

    C --> D
    C1 --> D
    C2 --> D
    C3 --> D
    C4 --> D
    C5 --> D
    C6 --> D
    C7 --> D
    C8 --> D
    C9 --> D

    D --> E
    D1 --> E1
    D2 --> E2
    D3 --> E3
    D4 --> E4
    D5 --> E5
    D6 --> E6
    D7 --> E7

    C7 --> G
    C8 --> G
    C9 --> H
    C9 --> I
    C9 --> J

    E --> F
    F1 --> E
    C2 --> F2
    B1 --> F3

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#ffebee
    style F fill:#fce4ec
    style G fill:#e0f2f1
    style H fill:#fff3e0
    style I fill:#f1f8e9
    style J fill:#e8eaf6
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant C as Flutter Client
    participant A as API Server
    participant D as Database
    participant S as Supabase Auth

    C->>A: POST /api/v1/auth/login
    A->>D: Verify user credentials
    D-->>A: User data
    A->>A: Generate JWT access token
    A->>A: Generate refresh token
    A->>D: Store refresh session
    A-->>C: Access token + Refresh token

    C->>A: GET /api/v1/auth/me (with Access token)
    A->>A: Validate JWT signature
    A->>A: Check token expiration
    A->>D: Fetch user data
    D-->>A: User data
    A-->>C: User profile

    C->>A: GET /api/v1/customers (with expired Access token)
    A->>A: Detect expired token
    A->>D: Validate refresh session
    D-->>A: Session valid
    A->>A: Generate new access token
    A-->>C: New access token
    C->>A: Retry request with new token
    A-->>C: Customer data
```

## Multi-Tenancy Architecture

```mermaid
graph LR
    subgraph "Request Flow"
        A[HTTP Request]
        B[JWT Token]
        C[Company ID]
        D[Tenant Isolation]
    end

    subgraph "Database Schema"
        E[Company Table]
        F[Company Members]
        G[Customer Table]
        H[Job Table]
        I[Quote Table]
        J[Invoice Table]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    D --> F
    D --> G
    D --> H
    D --> I
    D --> J

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#ffebee
    style F fill:#fce4ec
    style G fill:#e0f2f1
    style H fill:#fff3e0
    style I fill:#f1f8e9
    style J fill:#e8eaf6
```

## Job Lifecycle Flow

```mermaid
stateDiagram-v2
    [*] --> NEW: Job Created
    NEW --> QUOTING: Awaiting Quote
    NEW --> SCHEDULED: Direct Schedule
    QUOTING --> SCHEDULED: Quote Approved
    SCHEDULED --> EN_ROUTE: Technician Dispatched
    EN_ROUTE --> IN_PROGRESS: On Site
    IN_PROGRESS --> WAITING_PARTS: Awaiting Parts
    WAITING_PARTS --> IN_PROGRESS: Parts Arrived
    IN_PROGRESS --> COMPLETED: Job Finished
    COMPLETED --> [*]: Invoice Generated
    NEW --> CANCELLED: Cancelled
    SCHEDULED --> CANCELLED: Cancelled
    EN_ROUTE --> CANCELLED: Cancelled
    IN_PROGRESS --> CANCELLED: Cancelled
```

## Customer-to-Cash Flow

```mermaid
graph TB
    A[Customer Request] --> B[Create Job]
    B --> C[Schedule Job]
    C --> D[Assign Technician]
    D --> E[Technician En Route]
    E --> F[Technician On Site]
    F --> G[Complete Job]
    G --> H{Payment Required?}
    H -->|Yes| I[Create Quote]
    H -->|No| J[Create Invoice]
    I --> K[Send Quote to Customer]
    K --> L{Customer Approval}
    L -->|Approved| J
    L -->|Declined| M[Revise Quote]
    M --> K
    J --> N[Issue Invoice]
    N --> O[Customer Payment]
    O --> P[Record Payment]
    P --> Q[Invoice Paid]
    Q --> R[Close Job]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#ffebee
    style F fill:#fce4ec
    style G fill:#e0f2f1
    style H fill:#fff3e0
    style I fill:#f1f8e9
    style J fill:#e8eaf6
    style K fill:#e1f5ff
    style L fill:#fff4e1
    style M fill:#e8f5e9
    style N fill:#f3e5f5
    style O fill:#ffebee
    style P fill:#fce4ec
    style Q fill:#e0f2f1
    style R fill:#fff3e0
```

## Data Model Relationships

```mermaid
erDiagram
    Company ||--o{ CompanyMember : has
    Company ||--o{ Customer : has
    Company ||--o{ Job : has
    Company ||--o{ Quote : has
    Company ||--o{ Invoice : has
    Company ||--o{ User : has

    User ||--o{ CompanyMember : belongs_to
    User ||--o{ Job : assigned_to
    User ||--o{ JobStatusHistory : creates
    User ||--o{ JobNote : creates
    User ||--o{ JobPhoto : uploads
    User ||--o{ Invoice : creates
    User ||--o{ Payment : creates

    Customer ||--o{ ServiceAddress : has
    Customer ||--o{ Job : has
    Customer ||--o{ Quote : has
    Customer ||--o{ Invoice : has
    Customer ||--o{ CustomerReview : has
    Customer ||--o{ CustomerPortalToken : has

    ServiceAddress ||--o{ Job : used_by

    Job ||--o{ JobStatusHistory : has
    Job ||--o{ JobNote : has
    Job ||--o{ JobPhoto : has
    Job ||--o{ JobPart : has
    Job ||--o{ Quote : has
    Job ||--o{ Invoice : has
    Job ||--o{ CustomerReview : has

    Quote ||--o{ QuoteItem : has
    Quote ||--o{ QuoteApprovalEvent : has
    Quote ||--o{ Invoice : converts_to

    Invoice ||--o{ InvoiceItem : has
    Invoice ||--o{ Payment : has
```

## API Layer Architecture

```mermaid
graph TB
    subgraph "Express Server"
        A[app.ts]
        B[Routes]
        C[Middleware]
        D[Controllers]
        E[Services]
        F[Repositories]
    end

    subgraph "Route Modules"
        B1[auth.routes.ts]
        B2[customers.routes.ts]
        B3[jobs.routes.ts]
        B4[scheduling.routes.ts]
        B5[quotes.routes.ts]
        B6[invoices.routes.ts]
        B7[portal.routes.ts]
        B8[ai.routes.ts]
        B9[notifications.routes.ts]
    end

    subgraph "Middleware"
        C1[auth.middleware.ts]
        C2[rateLimit.ts]
        C3[errorHandler]
    end

    subgraph "Services"
        E1[auth.service.ts]
        E2[customer.service.ts]
        E3[job.service.ts]
        E4[scheduling.service.ts]
        E5[quote.service.ts]
        E6[invoice.service.ts]
        E7[ai.service.ts]
        E8[notification.service.ts]
    end

    A --> B
    B --> B1
    B --> B2
    B --> B3
    B --> B4
    B --> B5
    B --> B6
    B --> B7
    B --> B8
    B --> B9

    B --> C
    C --> C1
    C --> C2
    C --> C3

    B --> D
    D --> E
    E --> E1
    E --> E2
    E --> E3
    E --> E4
    E --> E5
    E --> E6
    E --> E7
    E --> E8

    E --> F
    F --> G[Prisma Client]
    G --> H[(PostgreSQL)]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#ffebee
    style F fill:#fce4ec
    style G fill:#e0f2f1
    style H fill:#fff3e0
```

## Flutter App Architecture

```mermaid
graph TB
    subgraph "Flutter App"
        A[main.dart]
        B[App Scaffold]
        C[Router]
        D[Providers]
        E[Features]
    end

    subgraph "Features"
        E1[Dashboard]
        E2[Customers]
        E3[Jobs]
        E4[Calendar]
        E5[Quotes]
        E6[Invoices]
        E7[Technician]
        E8[Portal]
        E9[Auth]
        E10[Settings]
    end

    subgraph "Feature Structure"
        F1[Screen]
        F2[Provider]
        F3[Repository]
        F4[Widgets]
    end

    A --> B
    B --> C
    B --> D
    D --> E
    E --> E1
    E --> E2
    E --> E3
    E --> E4
    E --> E5
    E --> E6
    E --> E7
    E --> E8
    E --> E9
    E --> E10

    E1 --> F1
    E1 --> F2
    E1 --> F3
    E1 --> F4

    F3 --> G[API Client]
    G --> H[Node.js API]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#ffebee
    style F fill:#fce4ec
    style G fill:#e0f2f1
    style H fill:#fff3e0
```

## Security Architecture

```mermaid
graph TB
    subgraph "Security Layers"
        A[Authentication]
        B[Authorization]
        C[Tenant Isolation]
        D[Data Validation]
        E[Rate Limiting]
    end

    subgraph "Authentication"
        A1[JWT Tokens]
        A2[Refresh Tokens]
        A3[Password Hashing]
        A4[Token Expiration]
    end

    subgraph "Authorization"
        B1[Role-Based Access]
        B2[Function-Level Policies]
        B3[Route Guards]
        B4[Membership Validation]
    end

    subgraph "Tenant Isolation"
        C1[Company Scoping]
        C2[Query Filters]
        C3[Cross-Company Prevention]
        C4[Membership Status Checks]
    end

    subgraph "Data Validation"
        D1[Zod Schemas]
        D2[Input Sanitization]
        D3[Output Validation]
        D4[SQL Injection Prevention]
    end

    subgraph "Rate Limiting"
        E1[Request Throttling]
        E2[IP-based Limits]
        E3[User-based Limits]
        E4[Endpoint-specific Limits]
    end

    A --> A1
    A --> A2
    A --> A3
    A --> A4

    B --> B1
    B --> B2
    B --> B3
    B --> B4

    C --> C1
    C --> C2
    C --> C3
    C --> C4

    D --> D1
    D --> D2
    D --> D3
    D --> D4

    E --> E1
    E --> E2
    E --> E3
    E --> E4

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#ffebee
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        A[Local Machine]
        A1[Flutter App]
        A2[Node.js API]
        A3[Supabase Dev]
    end

    subgraph "Staging"
        B[Staging Server]
        B1[Flutter Build]
        B2[Node.js API]
        B3[Supabase Staging]
    end

    subgraph "Production"
        C[Production Server]
        C1[Flutter Release]
        C2[Node.js API]
        C3[Supabase Production]
    end

    A --> B
    B --> C

    A1 --> A2
    A2 --> A3

    B1 --> B2
    B2 --> B3

    C1 --> C2
    C2 --> C3

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
```

## Technology Stack

```mermaid
graph LR
    subgraph "Frontend"
        A[Flutter]
        A1[Dart]
        A2[Riverpod]
        A3[Go Router]
    end

    subgraph "Backend"
        B[Node.js]
        B1[Express]
        B2[TypeScript]
        B3[Prisma]
    end

    subgraph "Database"
        C[PostgreSQL]
        C1[Supabase]
    end

    subgraph "Infrastructure"
        D[Git]
        D1[GitHub]
        D2[CI/CD]
    end

    A --> B
    B --> C
    D --> A
    D --> B

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
```

## Notes

- All diagrams use Mermaid syntax
- Render with Mermaid-compatible viewers (GitHub, VS Code, etc.)
- For interactive viewing, use Mermaid Live Editor: https://mermaid.live/
- Diagrams reflect the current architecture as of Phase H1
