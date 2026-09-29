# Phase G5 — Query Plan Review for Important Endpoints

## Overview

This document provides a query plan review for important list/dashboard endpoints in the Aera backend. Query plan analysis helps identify performance bottlenecks, missing indexes, and inefficient query patterns.

## Important Endpoints Reviewed

### 1. Customers List Endpoint
**Endpoint:** `GET /api/v1/customers`
**Purpose:** Retrieve paginated list of customers for a company

**Query Pattern:**
```sql
SELECT * FROM "Customer"
WHERE "companyId" = $1
ORDER BY "createdAt" DESC
LIMIT $2 OFFSET $3
```

**Performance Considerations:**
- ✅ Filter by `companyId` - should have index
- ✅ ORDER BY `createdAt` DESC - should leverage index
- ⚠️ Pagination with OFFSET can be slow for large offsets
- ✅ Tenant-scoped query ensures data isolation

**Recommended Indexes:**
```sql
CREATE INDEX IF NOT EXISTS "Customer_companyId_createdAt_idx" 
ON "Customer"("companyId", "createdAt" DESC);
```

**Query Plan Analysis:**
- Index Scan on `Customer_companyId_createdAt_idx` (expected)
- Filter: `companyId = $1`
- Sort: `createdAt DESC` (handled by index)
- Limit/Offset: applied after scan

### 2. Jobs List Endpoint
**Endpoint:** `GET /api/v1/jobs`
**Purpose:** Retrieve paginated list of jobs for a company

**Query Pattern:**
```sql
SELECT j.*, 
       c."firstName", c."lastName",
       sa."line1", sa."city"
FROM "Job" j
LEFT JOIN "Customer" c ON j."customerId" = c.id
LEFT JOIN "ServiceAddress" sa ON j."serviceAddressId" = sa.id
WHERE j."companyId" = $1
ORDER BY j."createdAt" DESC
LIMIT $2 OFFSET $3
```

**Performance Considerations:**
- ✅ Filter by `companyId` - should have index
- ✅ ORDER BY `createdAt` DESC - should leverage index
- ⚠️ JOINs with Customer and ServiceAddress tables
- ⚠️ Pagination with OFFSET can be slow for large offsets
- ✅ Tenant-scoped query ensures data isolation

**Recommended Indexes:**
```sql
CREATE INDEX IF NOT EXISTS "Job_companyId_createdAt_idx" 
ON "Job"("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Job_customerId_idx" 
ON "Job"("customerId");

CREATE INDEX IF NOT EXISTS "Job_serviceAddressId_idx" 
ON "Job"("serviceAddressId");
```

**Query Plan Analysis:**
- Index Scan on `Job_companyId_createdAt_idx` (expected)
- Nested Loop Joins to Customer and ServiceAddress
- Filter: `companyId = $1`
- Sort: `createdAt DESC` (handled by index)
- Limit/Offset: applied after scan

### 3. Dashboard Summary Endpoint
**Endpoint:** `GET /api/v1/dashboard/summary`
**Purpose:** Retrieve KPIs and summary metrics for a company

**Query Pattern:**
```sql
-- Job counts by status
SELECT "status", COUNT(*) 
FROM "Job" 
WHERE "companyId" = $1
GROUP BY "status";

-- Revenue metrics
SELECT SUM("totalMinor") 
FROM "Invoice" 
WHERE "companyId" = $1 AND "status" = 'PAID';

-- Active technicians count
SELECT COUNT(DISTINCT "assignedTechnicianId")
FROM "Job"
WHERE "companyId" = $1 AND "status" IN ('IN_PROGRESS', 'EN_ROUTE');
```

**Performance Considerations:**
- ✅ All queries filtered by `companyId`
- ✅ GROUP BY on indexed columns
- ⚠️ Multiple sequential queries - could be optimized with a single query
- ✅ COUNT operations are efficient with proper indexes

**Recommended Indexes:**
```sql
CREATE INDEX IF NOT EXISTS "Job_companyId_status_idx" 
ON "Job"("companyId", "status");

CREATE INDEX IF NOT EXISTS "Job_companyId_assignedTechnicianId_idx" 
ON "Job"("companyId", "assignedTechnicianId");

CREATE INDEX IF NOT EXISTS "Invoice_companyId_status_idx" 
ON "Invoice"("companyId", "status");
```

**Query Plan Analysis:**
- Index Scan on `Job_companyId_status_idx` for status grouping
- Index Scan on `Invoice_companyId_status_idx` for revenue
- Index Scan on `Job_companyId_assignedTechnicianId_idx` for technician count
- Aggregate operations (COUNT, SUM) are efficient

### 4. Schedule Endpoint
**Endpoint:** `GET /api/v1/schedule?date=YYYY-MM-DD`
**Purpose:** Retrieve scheduled jobs for a specific date

**Query Pattern:**
```sql
SELECT j.*, 
       u."firstName", u."lastName" as technicianName
FROM "Job" j
LEFT JOIN "User" u ON j."assignedTechnicianId" = u.id
WHERE j."companyId" = $1
  AND j."scheduledStart" >= $2::date
  AND j."scheduledStart" < ($2::date + interval '1 day')
ORDER BY j."scheduledStart" ASC
```

**Performance Considerations:**
- ✅ Filter by `companyId` and date range
- ✅ ORDER BY `scheduledStart` ASC
- ⚠️ Date range filter on `scheduledStart` timestamp
- ✅ JOIN with User table for technician info

**Recommended Indexes:**
```sql
CREATE INDEX IF NOT EXISTS "Job_companyId_scheduledStart_idx" 
ON "Job"("companyId", "scheduledStart");

CREATE INDEX IF NOT EXISTS "Job_assignedTechnicianId_idx" 
ON "Job"("assignedTechnicianId");
```

**Query Plan Analysis:**
- Index Scan on `Job_companyId_scheduledStart_idx` (expected)
- Filter: `companyId = $1` AND date range on `scheduledStart`
- Sort: `scheduledStart ASC` (handled by index)
- Nested Loop Join to User table

### 5. Quotes List Endpoint
**Endpoint:** `GET /api/v1/quotes`
**Purpose:** Retrieve paginated list of quotes for a company

**Query Pattern:**
```sql
SELECT q.*, 
       c."firstName", c."lastName",
       j."jobNumber"
FROM "Quote" q
LEFT JOIN "Customer" c ON q."customerId" = c.id
LEFT JOIN "Job" j ON q."jobId" = j.id
WHERE q."companyId" = $1
ORDER BY q."createdAt" DESC
LIMIT $2 OFFSET $3
```

**Performance Considerations:**
- ✅ Filter by `companyId` - should have index
- ✅ ORDER BY `createdAt` DESC - should leverage index
- ⚠️ JOINs with Customer and Job tables
- ⚠️ Pagination with OFFSET can be slow for large offsets

**Recommended Indexes:**
```sql
CREATE INDEX IF NOT EXISTS "Quote_companyId_createdAt_idx" 
ON "Quote"("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Quote_customerId_idx" 
ON "Quote"("customerId");

CREATE INDEX IF NOT EXISTS "Quote_jobId_idx" 
ON "Quote"("jobId");
```

**Query Plan Analysis:**
- Index Scan on `Quote_companyId_createdAt_idx` (expected)
- Nested Loop Joins to Customer and Job
- Filter: `companyId = $1`
- Sort: `createdAt DESC` (handled by index)
- Limit/Offset: applied after scan

### 6. Invoices List Endpoint
**Endpoint:** `GET /api/v1/invoices`
**Purpose:** Retrieve paginated list of invoices for a company

**Query Pattern:**
```sql
SELECT i.*, 
       c."firstName", c."lastName",
       j."jobNumber"
FROM "Invoice" i
LEFT JOIN "Customer" c ON i."customerId" = c.id
LEFT JOIN "Job" j ON i."jobId" = j.id
WHERE i."companyId" = $1
ORDER BY i."createdAt" DESC
LIMIT $2 OFFSET $3
```

**Performance Considerations:**
- ✅ Filter by `companyId` - should have index
- ✅ ORDER BY `createdAt` DESC - should leverage index
- ⚠️ JOINs with Customer and Job tables
- ⚠️ Pagination with OFFSET can be slow for large offsets

**Recommended Indexes:**
```sql
CREATE INDEX IF NOT EXISTS "Invoice_companyId_createdAt_idx" 
ON "Invoice"("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Invoice_customerId_idx" 
ON "Invoice"("customerId");

CREATE INDEX IF NOT EXISTS "Invoice_jobId_idx" 
ON "Invoice"("jobId");

CREATE INDEX IF NOT EXISTS "Invoice_companyId_status_idx" 
ON "Invoice"("companyId", "status");
```

**Query Plan Analysis:**
- Index Scan on `Invoice_companyId_createdAt_idx` (expected)
- Nested Loop Joins to Customer and Job
- Filter: `companyId = $1`
- Sort: `createdAt DESC` (handled by index)
- Limit/Offset: applied after scan

## Performance Recommendations

### 1. Cursor-Based Pagination
**Issue:** OFFSET-based pagination becomes slow for large offsets
**Recommendation:** Implement cursor-based pagination using indexed columns
```sql
-- Instead of OFFSET
SELECT * FROM "Job"
WHERE "companyId" = $1 AND "createdAt" < $2
ORDER BY "createdAt" DESC
LIMIT $3;
```

### 2. Query Consolidation
**Issue:** Dashboard endpoint makes multiple sequential queries
**Recommendation:** Consolidate into fewer queries using CTEs or JOINs
```sql
WITH job_counts AS (
  SELECT "status", COUNT(*) as count
  FROM "Job" WHERE "companyId" = $1 GROUP BY "status"
),
revenue AS (
  SELECT SUM("totalMinor") as total
  FROM "Invoice" 
  WHERE "companyId" = $1 AND "status" = 'PAID'
)
SELECT * FROM job_counts, revenue;
```

### 3. N+1 Query Prevention
**Issue:** JOIN operations may cause N+1 queries if not properly handled
**Recommendation:** Ensure all JOINs are done in a single query, not in application code

### 4. Materialized Views for Aggregates
**Issue:** Dashboard aggregations are computed on every request
**Recommendation:** Consider materialized views for heavy aggregations
```sql
CREATE MATERIALIZED VIEW "CompanyDashboardMetrics" AS
SELECT 
  "companyId",
  COUNT(*) FILTER (WHERE "status" = 'NEW') as new_jobs,
  COUNT(*) FILTER (WHERE "status" = 'IN_PROGRESS') as in_progress_jobs,
  SUM("totalMinor") FILTER (WHERE "status" = 'PAID') as total_revenue
FROM "Job" j
LEFT JOIN "Invoice" i ON j."companyId" = i."companyId"
GROUP BY "companyId";
```

### 5. Index Maintenance
**Issue:** Indexes may become fragmented over time
**Recommendation:** Regular index maintenance and statistics updates
```sql
ANALYZE "Customer";
ANALYZE "Job";
ANALYZE "Invoice";
REINDEX INDEX CONCURRENTLY "Customer_companyId_createdAt_idx";
```

## Index Summary

### Critical Indexes (Must Have)
1. `Customer_companyId_createdAt_idx` - Customer list pagination
2. `Job_companyId_createdAt_idx` - Job list pagination
3. `Job_companyId_status_idx` - Dashboard metrics
4. `Invoice_companyId_createdAt_idx` - Invoice list pagination
5. `Quote_companyId_createdAt_idx` - Quote list pagination

### Important Indexes (Should Have)
1. `Job_companyId_scheduledStart_idx` - Schedule queries
2. `Invoice_companyId_status_idx` - Invoice filtering
3. `Job_companyId_assignedTechnicianId_idx` - Technician workload
4. `Job_customerId_idx` - Job-Customer joins
5. `Job_serviceAddressId_idx` - Job-Address joins

### Optional Indexes (Nice to Have)
1. `Customer_companyId_name_idx` - Customer search by name
2. `Job_companyId_priority_idx` - Priority-based filtering
3. `Invoice_companyId_dueDate_idx` - Due date queries

## Query Plan Verification

To verify query plans in production:

```sql
-- Explain plan for customers list
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM "Customer"
WHERE "companyId" = $1
ORDER BY "createdAt" DESC
LIMIT 50;

-- Explain plan for jobs list
EXPLAIN (ANALYZE, BUFFERS)
SELECT j.*, c."firstName", c."lastName"
FROM "Job" j
LEFT JOIN "Customer" c ON j."customerId" = c.id
WHERE j."companyId" = $1
ORDER BY j."createdAt" DESC
LIMIT 50;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('Customer', 'Job', 'Invoice', 'Quote')
ORDER BY idx_scan DESC;
```

## Monitoring

### Key Metrics to Monitor
1. Query execution time (should be < 100ms for list endpoints)
2. Index hit ratio (should be > 95%)
3. Sequential scan count (should be minimal for indexed queries)
4. Buffer cache hit ratio (should be > 99%)
5. Lock wait time (should be minimal)

### Alert Thresholds
- Query time > 500ms: Investigate query plan
- Index hit ratio < 90%: Review index usage
- Sequential scans on large tables: Add missing indexes
- Lock wait time > 100ms: Investigate concurrency issues

## Conclusion

The query plan review identifies that most important endpoints have appropriate indexes for their primary access patterns. The main areas for improvement are:

1. **Pagination:** Consider cursor-based pagination for large datasets
2. **Dashboard Aggregations:** Consolidate multiple queries or use materialized views
3. **Index Coverage:** Ensure all JOIN columns have appropriate indexes
4. **Monitoring:** Set up query performance monitoring to catch regressions

The current query patterns are generally efficient for the expected data volumes, but should be reviewed as the dataset grows.

## Related Documentation

- **Phase F2:** Foreign Key and Index Optimization
- **Phase C5:** Scheduling Conflict Detection
- **Phase D1:** Financial Calculations
- **Architecture Document:** Database Schema and Query Patterns
