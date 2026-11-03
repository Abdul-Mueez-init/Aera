import { prisma } from "../src/db/prisma.js";

const dryRun = process.argv.includes("--dry-run");
if (!dryRun) {
  throw new Error("This script is intentionally dry-run only. Pass --dry-run.");
}

const jobs = await prisma.job.findMany({
  where: { serviceRequestId: null },
  select: {
    id: true,
    companyId: true,
    customerId: true,
    serviceAddressId: true,
    jobNumber: true,
    serviceType: true,
    problemDescription: true,
  },
  orderBy: { createdAt: "asc" },
});

console.table(
  jobs.map((job) => ({
    ...job,
    action: "would create STAFF_DIRECT ServiceRequest",
  })),
);
console.log(
  `Dry run: ${jobs.length} jobs would receive a direct-service request.`,
);
await prisma.$disconnect();
