# Phase H1 — Deterministic Demo Seed Data

## Overview

This document describes the deterministic demo seed data implementation for the Aera application. The seed data script creates consistent, reproducible demo data for testing and demonstration purposes.

## Seed Data Script

**Location:** `backend/src/seed/seed-demo-data.ts`

**Command:**
```bash
pnpm --filter backend seed:demo
```

## Features

### Deterministic Data Generation

The seed data script uses a seeded random number generator to ensure that the same data is generated on every run. This provides:

- **Consistency:** Same data every time the script runs
- **Reproducibility:** Predictable test scenarios
- **Demo reliability:** Consistent demo experience

### Seeded Random Generator

The `SeededRandom` class generates consistent pseudo-random numbers based on a fixed seed string:

```typescript
class SeededRandom {
  constructor(private seed: string) {
    // Initialize with seed
  }

  next(): number {
    // Generate number between 0 and 1
  }

  range(min: number, max: number): number {
    // Generate number in range
  }

  pick<T>(array: T[]): T {
    // Pick random item from array
  }

  date(start: Date, end: Date): Date {
    // Pick random date in range
  }
}
```

## Demo Data Contents

### Company

- **Name:** Aera HVAC Demo
- **Slug:** aera-hvac-demo
- **Timezone:** Asia/Karachi
- **Currency:** PKR

### Users (6 total)

| Email | Name | Role |
|-------|------|------|
| admin@aera.demo | Marcus Thompson | OWNER |
| dispatcher@aera.demo | Sarah Ahmed | DISPATCHER |
| tech1@aera.demo | Ahmed Raza | TECHNICIAN |
| tech2@aera.demo | James Miller | TECHNICIAN |
| tech3@aera.demo | Omar Khan | TECHNICIAN |
| tech4@aera.demo | Bilal Hassan | TECHNICIAN |

**Password:** `Demo123!` (for all users)

### Customers (5 total)

1. **Sarah Khan** - Residential customer in Lahore
2. **Malik Textiles** - Commercial customer with head office
3. **Dr. Ali** - Clinic customer in Gulberg III
4. **Fatima Zahra** - Residential customer in DHA Phase 5
5. **Rashid Enterprises** - Commercial warehouse customer

Each customer has:
- Contact information (email, phone)
- Service address with full details
- Associated jobs, quotes, and invoices

### Jobs (15 total)

**Status Distribution:**
- NEW: 2-3 jobs
- SCHEDULED: 2-3 jobs
- EN_ROUTE: 2-3 jobs
- IN_PROGRESS: 2-3 jobs
- COMPLETED: 4-5 jobs
- CANCELLED: 1-2 jobs

**Job Details:**
- Service types: AC installation, repair, maintenance, audits
- Problem descriptions: Various HVAC issues
- Priority levels: LOW, NORMAL, HIGH, URGENT
- Scheduled dates: ±30 days from current date
- Assigned technicians: Randomly assigned from 4 technicians

### Quotes (8 total)

**Status Distribution:**
- DRAFT: 1-2 quotes
- SENT: 2-3 quotes
- APPROVED: 2-3 quotes
- DECLINED: 1-2 quotes
- EXPIRED: 0-1 quotes

**Quote Details:**
- Currency: PKR
- Amount range: PKR 100-1000
- Tax rate: 0-17%
- Line items: 1-4 items per quote
- Share tokens: Generated for SENT/APPROVED quotes

### Invoices (6 total)

**Status Distribution:**
- DRAFT: 1 invoice
- ISSUED: 1-2 invoices
- PARTIALLY_PAID: 1-2 invoices
- PAID: 1-2 invoices
- VOID: 0-1 invoices
- OVERDUE: 0-1 invoices

**Invoice Details:**
- Currency: PKR
- Amount range: PKR 150-1500
- Tax rate: 0-17%
- Line items: 2-5 items per invoice
- Due dates: ±30 days from current date
- Payments: Created for PAID/PARTIALLY_PAID invoices

### Customer Reviews (5 total)

- Rating: 3-5 stars
- Comments: Professional feedback
- Linked to completed jobs

## Usage

### Running the Seed Script

**Prerequisites:**
1. Database must be migrated (`pnpm --filter backend prisma:migrate:deploy`)
2. Environment variables must be configured (`backend/.env`)
3. Run in development environment

**Command:**
```bash
pnpm --filter backend seed:demo
```

**Expected Output:**
```
🌱 Starting demo data seed...
🧹 Cleaning existing demo data...
✅ Cleaned existing data
🏢 Creating company...
✅ Created company: Aera HVAC Demo
👥 Creating users...
✅ Created user: Marcus Thompson (OWNER)
✅ Created user: Sarah Ahmed (DISPATCHER)
✅ Created user: Ahmed Raza (TECHNICIAN)
✅ Created user: James Miller (TECHNICIAN)
✅ Created user: Omar Khan (TECHNICIAN)
✅ Created user: Bilal Hassan (TECHNICIAN)
👤 Creating customers...
✅ Created customer: Sarah Khan
✅ Created customer: Malik Textiles
✅ Created customer: Dr. Ali
✅ Created customer: Fatima Zahra
✅ Created customer: Rashid Enterprises
🔧 Creating jobs...
✅ Created job #JOB-1: AC Not Cooling · 4-Ton Split (COMPLETED)
...
📄 Creating quotes...
✅ Created quote: PKR 25000.00 (APPROVED)
...
💰 Creating invoices...
✅ Created invoice INV-0001: PKR 45000.00 (PAID)
...
⭐ Creating customer reviews...
✅ Created review: 5 stars

🎉 Demo data seed completed successfully!

📊 Summary:
   - Company: Aera HVAC Demo
   - Users: 6
   - Customers: 5
   - Jobs: 15
   - Quotes: 8
   - Invoices: 6

🔐 Demo Credentials:
   Email: admin@aera.demo
   Password: Demo123!

⚠️  Warning: This is demo data. Do not use in production!
```

### Resetting Demo Data

To reset the demo data (clean and re-seed):

```bash
pnpm --filter backend seed:demo
```

The script automatically cleans existing demo data before creating new data.

## Integration with Clean Checkout Setup

The seed data script can be integrated into the clean checkout setup process:

**Updated Setup Steps:**

1. Clone repository
2. Install dependencies
3. Configure environment
4. Run database migration
5. **Run demo seed data** (new step)
6. Generate Prisma client
7. Run quality checks

**Documentation Update:**

Add to `docs/phase_G5_clean_checkout_setup.md`:

```markdown
### Step 5: Seed Demo Data (Optional)

For demo/testing purposes, seed the database with deterministic demo data:

```bash
pnpm --filter backend seed:demo
```

This creates:
- 1 demo company
- 6 demo users (1 admin, 1 dispatcher, 4 technicians)
- 5 demo customers
- 15 demo jobs (various statuses)
- 8 demo quotes (various statuses)
- 6 demo invoices (various statuses)
- 5 customer reviews

**Demo Credentials:**
- Email: admin@aera.demo
- Password: Demo123!

**Note:** Skip this step for production deployments.
```

## Customization

### Adding More Data

To add more demo data, modify the constants in the seed script:

```typescript
// Add more customers
const CUSTOMERS = [
  // ... existing customers
  {
    firstName: 'New',
    lastName: 'Customer',
    email: 'new@example.com',
    phone: '+92 300 0000000',
    address: { /* ... */ },
  },
];

// Increase job count
for (let i = 0; i < 25; i++) { // Changed from 15 to 25
  // ... create jobs
}
```

### Changing Data Distribution

To change the distribution of statuses or other properties:

```typescript
// Change job status distribution
const jobStatuses = [
  'NEW', 'NEW', 'NEW', // More NEW jobs
  'SCHEDULED', 'SCHEDULED',
  'EN_ROUTE',
  'IN_PROGRESS',
  'COMPLETED', 'COMPLETED', // More COMPLETED jobs
  'CANCELLED',
];
```

### Different Currency/Locale

To use a different currency or locale:

```typescript
const COMPANY_DATA = {
  name: 'Aera HVAC Demo',
  slug: 'aera-hvac-demo',
  timezone: 'America/New_York', // Changed timezone
  defaultCurrency: 'USD', // Changed currency
};

// Update quote/invoice amounts
const subtotalMinor = Math.floor(quoteRng.range(100, 1000) * 100); // USD
```

## Security Considerations

### Demo Credentials

The seed data script creates demo accounts with a fixed password:

- **Email:** admin@aera.demo
- **Password:** Demo123!

**Important:**
- These credentials are for demo/testing only
- Never use these credentials in production
- Change passwords immediately in production
- Remove demo data before production deployment

### Data Cleanup

The script automatically cleans existing demo data before seeding. However:

- Always backup production data before running seed scripts
- Never run seed scripts in production environments
- Use environment-specific databases for demo data

## Testing

### Verification

After running the seed script, verify the data:

```bash
# Connect to database
psql $DATABASE_URL

# Verify company
SELECT * FROM companies WHERE slug = 'aera-hvac-demo';

# Verify users
SELECT u.email, u.firstName, u.lastName, cm.role
FROM users u
JOIN company_members cm ON u.id = cm.userId
JOIN companies c ON cm.companyId = c.id
WHERE c.slug = 'aera-hvac-demo';

# Verify jobs
SELECT jobNumber, status, scheduledStart
FROM jobs
WHERE companyId = (SELECT id FROM companies WHERE slug = 'aera-hvac-demo')
ORDER BY jobNumber;
```

### Integration Tests

The seed data can be used for integration tests:

```typescript
// Before running tests
await exec('pnpm --filter backend seed:demo');

// Run tests
await exec('pnpm --filter backend test');

// Clean up after tests
await exec('pnpm --filter backend prisma migrate reset');
```

## Troubleshooting

### Common Issues

**Issue:** "Relation constraint violation"
- **Cause:** Old data exists in database
- **Solution:** The script automatically cleans data, but you can manually reset:
  ```bash
  pnpm --filter backend prisma migrate reset
  ```

**Issue:** "Job number conflict"
- **Cause:** Company counter not reset
- **Solution:** The script uses the job service to get next numbers, which handles counters automatically

**Issue:** "User already exists"
- **Cause:** Users from previous seed run
- **Solution:** The script deletes all users before creating new ones

## Future Enhancements

### Potential Improvements

1. **Environment-specific seeds**
   - Development seed (comprehensive)
   - Staging seed (limited)
   - Production seed (empty)

2. **Configurable data volumes**
   - Command-line flags for data volume
   - `--jobs 50` for 50 jobs
   - `--customers 20` for 20 customers

3. **Realistic time-series data**
   - Jobs spread over longer periods
   - More realistic scheduling patterns
   - Seasonal variations

4. **Custom seed files**
   - JSON/YAML seed files
   - Custom data import
   - Data migration tools

5. **Seed data versioning**
   - Track seed data versions
   - Migration scripts for seed data
   - Rollback capabilities

## Conclusion

The deterministic demo seed data script provides a reliable way to create consistent demo data for testing and demonstration. The seeded random generator ensures reproducibility, while the comprehensive data set covers all major features of the Aera application.

**Key Benefits:**
- ✅ Deterministic and reproducible
- ✅ Comprehensive coverage of features
- ✅ Easy to reset and regenerate
- ✅ Suitable for testing and demos
- ✅ Well-documented and maintainable

**Next Steps:**
1. Integrate into clean checkout setup documentation
2. Add to CI/CD pipeline for test environments
3. Create environment-specific seed configurations
4. Add validation scripts to verify seed data

## Related Documentation

- **Phase H1 Hardening Completion:** Overall hardening checklist
- **Phase G5 Clean Checkout Setup:** Setup verification
- **Phase G2 Customer-to-Cash Test:** Integration testing
- **Prisma Schema:** Database schema reference
