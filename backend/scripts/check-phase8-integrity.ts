import { prisma } from "../src/db/prisma.js";

const [orphanRequests, tenantMismatches, jobsWithoutType] = await Promise.all([
  prisma.job.count({ where: { serviceRequestId: null } }),
  prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM jobs j
    JOIN service_requests r ON r.id = j."serviceRequestId"
    WHERE j."companyId" <> r."companyId"
  `,
  prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM jobs
    WHERE type IS NULL
  `,
]);

console.table({
  jobsWithoutServiceRequest: orphanRequests,
  tenantMismatchedJobRequests: Number(tenantMismatches[0]?.count ?? 0n),
  jobsWithoutType: Number(jobsWithoutType[0]?.count ?? 0n),
});
await prisma.$disconnect();
