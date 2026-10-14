const { createRequire } = require('module');
const backendRequire = createRequire('c:/development/aera/backend/package.json');
const { PrismaPg } = backendRequire('@prisma/adapter-pg');
const { PrismaClient } = backendRequire('./src/generated/prisma');

const connectionString = "postgresql://postgres:Mueezy20%40@localhost:5432/aera_test";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function inspect() {
  const badInvoices = await prisma.$queryRawUnsafe(`
    SELECT id, "invoiceNumber", "totalMinor", "amountPaidMinor", "balanceDueMinor", status, "createdAt"
    FROM invoices
    WHERE "balanceDueMinor" != ("totalMinor" - "amountPaidMinor");
  `);
  console.log('Bad Invoices (mismatched balance due):', badInvoices);

  const completedNoDate = await prisma.job.findMany({
    where: { status: 'COMPLETED', completedAt: null },
    select: { id: true, jobNumber: true, status: true, completedAt: true, updatedAt: true, createdAt: true },
  });
  console.log('\nCompleted Jobs with null completedAt:', completedNoDate);

  const scheduledNoStart = await prisma.job.findMany({
    where: { status: 'SCHEDULED', scheduledStart: null },
    select: { id: true, jobNumber: true, status: true, scheduledStart: true, createdAt: true },
  });
  console.log('\nScheduled Jobs with null scheduledStart:', scheduledNoStart);

  await prisma.$disconnect();
}

inspect();
