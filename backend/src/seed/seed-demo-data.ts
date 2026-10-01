/**
 * Deterministic Demo Seed Data
 *
 * This script creates deterministic demo data for the Aera application.
 * All data is generated with fixed seeds to ensure consistency across runs.
 *
 * Usage:
 *   pnpm --filter backend tsx src/seed/seed-demo-data.ts
 *
 * Prerequisites:
 *   - Database must be migrated
 *   - Environment variables must be configured
 *   - Run with NODE_ENV=development
 */

import { PrismaClient } from "../generated/prisma/index.js";
import { hashPassword } from "../common/auth/password.js";
import { getNextJobNumber } from "../common/counters/counter.service.js";

const prisma = new PrismaClient();

// Fixed seeds for deterministic data generation
const SEEDS = {
  company: "aera-demo-company",
  users: "aera-demo-users",
  customers: "aera-demo-customers",
  jobs: "aera-demo-jobs",
  quotes: "aera-demo-quotes",
  invoices: "aera-demo-invoices",
};

// Simple deterministic random number generator
class SeededRandom {
  constructor(private seed: string) {}

  // Simple hash function to generate consistent numbers
  private hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Generate a number between 0 and 1
  next(): number {
    const hash = this.hash(this.seed);
    this.seed = hash.toString();
    return (hash % 10000) / 10000;
  }

  // Generate a number between min and max
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Pick a random item from an array
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  // Pick a random date within a range
  date(start: Date, end: Date): Date {
    const time =
      start.getTime() + this.next() * (end.getTime() - start.getTime());
    return new Date(time);
  }
}

// Demo data constants
const COMPANY_DATA = {
  name: "Aera HVAC Demo",
  slug: "aera-hvac-demo",
  timezone: "Asia/Karachi",
  defaultCurrency: "PKR",
};

const USERS = [
  {
    email: "admin@aera.demo",
    firstName: "Marcus",
    lastName: "Thompson",
    role: "OWNER" as const,
  },
  {
    email: "dispatcher@aera.demo",
    firstName: "Sarah",
    lastName: "Ahmed",
    role: "DISPATCHER" as const,
  },
  {
    email: "tech1@aera.demo",
    firstName: "Ahmed",
    lastName: "Raza",
    role: "TECHNICIAN" as const,
  },
  {
    email: "tech2@aera.demo",
    firstName: "James",
    lastName: "Miller",
    role: "TECHNICIAN" as const,
  },
  {
    email: "tech3@aera.demo",
    firstName: "Omar",
    lastName: "Khan",
    role: "TECHNICIAN" as const,
  },
  {
    email: "tech4@aera.demo",
    firstName: "Bilal",
    lastName: "Hassan",
    role: "TECHNICIAN" as const,
  },
];

const CUSTOMERS = [
  {
    firstName: "Sarah",
    lastName: "Khan",
    email: "sarah.khan@example.com",
    phone: "+92 300 1234567",
    address: {
      label: "Home",
      line1: "123 Main Street",
      line2: "Apartment 4B",
      city: "Lahore",
      region: "Punjab",
      postalCode: "54000",
      countryCode: "PK",
    },
  },
  {
    firstName: "Malik",
    lastName: "Textiles",
    email: "contact@maliktextiles.com",
    phone: "+92 321 9876543",
    address: {
      label: "Head Office",
      line1: "456 Industrial Estate",
      line2: null,
      city: "Lahore",
      region: "Punjab",
      postalCode: "54700",
      countryCode: "PK",
    },
  },
  {
    firstName: "Dr.",
    lastName: "Ali",
    email: "ali.clinic@example.com",
    phone: "+92 333 4567890",
    address: {
      label: "Clinic",
      line1: "789 Medical Complex",
      line2: "Floor 2",
      city: "Gulberg III",
      region: "Punjab",
      postalCode: "54600",
      countryCode: "PK",
    },
  },
  {
    firstName: "Fatima",
    lastName: "Zahra",
    email: "fatima.z@example.com",
    phone: "+92 344 1112233",
    address: {
      label: "Home",
      line1: "321 Peace Avenue",
      line2: null,
      city: "DHA Phase 5",
      region: "Punjab",
      postalCode: "54800",
      countryCode: "PK",
    },
  },
  {
    firstName: "Rashid",
    lastName: "Enterprises",
    email: "info@rashident.com",
    phone: "+92 355 5556667",
    address: {
      label: "Warehouse",
      line1: "999 Commercial Plaza",
      line2: "Block C",
      city: "Lahore",
      region: "Punjab",
      postalCode: "54500",
      countryCode: "PK",
    },
  },
];

const SERVICE_TYPES = [
  "AC Not Cooling · 4-Ton Split",
  "AC Not Cooling · 2-Ton Split",
  "Quarterly VRF Chillers Audit",
  "AC Installation · 1.5 Ton",
  "AC Maintenance · 3-Ton",
  "AC Repair · Compressor Issue",
  "AC Installation · 5-Ton Commercial",
  "AC Not Cooling · Cassette Unit",
  "AC Maintenance · Duct Cleaning",
  "AC Repair · Gas Leak Detection",
];

const PROBLEM_DESCRIPTIONS = [
  "AC unit not cooling properly despite being on for 30 minutes",
  "Water leaking from indoor unit",
  "Unusual noise coming from outdoor unit",
  "AC not turning on at all",
  "Cooling insufficient for room size",
  "Remote control not responding",
  "Display showing error code E4",
  "Unit making loud banging noise",
  "Airflow weak from vents",
  "Compressor cycling on and off frequently",
];

async function seedDemoData() {
  console.log("🌱 Starting demo data seed...");

  // Clean existing demo data
  console.log("🧹 Cleaning existing demo data...");
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.jobPart.deleteMany();
  await prisma.jobPhoto.deleteMany();
  await prisma.jobNote.deleteMany();
  await prisma.jobStatusHistory.deleteMany();
  await prisma.job.deleteMany();
  await prisma.serviceAddress.deleteMany();
  await prisma.customerReview.deleteMany();
  await prisma.customerPortalToken.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.companyMember.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log("✅ Cleaned existing data");

  // Create company
  console.log("🏢 Creating company...");
  const company = await prisma.company.create({
    data: COMPANY_DATA,
  });
  console.log(`✅ Created company: ${company.name}`);

  // Create users
  console.log("👥 Creating users...");
  const users = [];
  for (const userData of USERS) {
    const passwordHash = await hashPassword("Demo123!"); // Fixed password for demo
    const user = await prisma.user.create({
      data: {
        ...userData,
        passwordHash,
        isActive: true,
      },
    });
    users.push(user);

    // Create company membership
    await prisma.companyMember.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: userData.role,
        status: "ACTIVE",
      },
    });
    console.log(
      `✅ Created user: ${user.firstName} ${user.lastName} (${userData.role})`,
    );
  }

  // Create customers
  console.log("👤 Creating customers...");
  const customers = [];
  const rng = new SeededRandom(SEEDS.customers);
  for (const customerData of CUSTOMERS) {
    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        ...customerData,
        status: "ACTIVE",
      },
    });

    // Create service address
    const serviceAddress = await prisma.serviceAddress.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        ...customerData.address,
      },
    });

    customers.push({ ...customer, serviceAddress });
    console.log(
      `✅ Created customer: ${customer.firstName} ${customer.lastName}`,
    );
  }

  // Create jobs
  console.log("🔧 Creating jobs...");
  const jobs = [];
  const jobRng = new SeededRandom(SEEDS.jobs);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const technicians = users.filter((u) => {
    const member = USERS.find((u2) => u2.email === u.email);
    return member?.role === "TECHNICIAN";
  });

  const jobStatuses: Array<
    "NEW" | "SCHEDULED" | "EN_ROUTE" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  > = ["NEW", "SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

  for (let i = 0; i < 15; i++) {
    const customer = rng.pick(customers);
    const technician = rng.pick(technicians);
    const serviceType = rng.pick(SERVICE_TYPES);
    const problemDescription = rng.pick(PROBLEM_DESCRIPTIONS);
    const status = rng.pick(jobStatuses);

    const jobNumber = await getNextJobNumber(company.id);
    const scheduledStart = jobRng.date(thirtyDaysAgo, thirtyDaysFromNow);
    const scheduledEnd = new Date(
      scheduledStart.getTime() + 2 * 60 * 60 * 1000,
    ); // 2 hours

    const job = await prisma.job.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        serviceAddressId: customer.serviceAddress.id,
        assignedTechnicianId: technician.id,
        jobNumber,
        serviceType,
        problemDescription,
        priority: rng.pick(["LOW", "NORMAL", "HIGH", "URGENT"] as const),
        status,
        scheduledStart,
        scheduledEnd,
        startedAt:
          status === "IN_PROGRESS" || status === "COMPLETED"
            ? scheduledStart
            : null,
        completedAt:
          status === "COMPLETED"
            ? new Date(scheduledStart.getTime() + 1.5 * 60 * 60 * 1000)
            : null,
        completionSummary:
          status === "COMPLETED"
            ? "Job completed successfully. AC cooling restored."
            : null,
      },
    });

    // Create status history
    await prisma.jobStatusHistory.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        actorUserId: technician.id,
        toStatus: status,
        reason: "Initial status",
      },
    });

    jobs.push(job);
    console.log(`✅ Created job #${jobNumber}: ${serviceType} (${status})`);
  }

  // Create quotes
  console.log("📄 Creating quotes...");
  const quotes = [];
  const quoteRng = new SeededRandom(SEEDS.quotes);
  const quoteStatuses: Array<
    "DRAFT" | "SENT" | "APPROVED" | "DECLINED" | "EXPIRED"
  > = ["DRAFT", "SENT", "APPROVED", "DECLINED", "EXPIRED"];

  for (let i = 0; i < 8; i++) {
    const customer = rng.pick(customers);
    const job = rng.pick(jobs);
    const status = rng.pick(quoteStatuses);

    const subtotalMinor = Math.floor(quoteRng.range(10000, 100000) * 100); // PKR 100-1000
    const taxRateBps = Math.floor(quoteRng.range(0, 17) * 100); // 0-17%
    const taxMinor = Math.floor((subtotalMinor * taxRateBps) / 10000);
    const totalMinor = subtotalMinor + taxMinor;

    const quote = await prisma.quote.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        jobId: job.id,
        status,
        subtotalMinor,
        discountMinor: 0,
        taxMinor,
        taxRateBps,
        totalMinor,
        currency: "PKR",
        expiresAt: quoteRng.date(now, thirtyDaysFromNow),
        sentAt: status !== "DRAFT" ? now : null,
        approvedAt: status === "APPROVED" ? now : null,
        declinedAt: status === "DECLINED" ? now : null,
        shareToken:
          status === "SENT" || status === "APPROVED"
            ? `quote-${i + 1}-token`
            : null,
      },
    });

    // Create quote items
    const itemCount = Math.floor(quoteRng.range(1, 4));
    for (let j = 0; j < itemCount; j++) {
      const quantity = quoteRng.range(1, 5);
      const unitPriceMinor = Math.floor(quoteRng.range(5000, 50000) * 100);
      await prisma.quoteItem.create({
        data: {
          companyId: company.id,
          quoteId: quote.id,
          description: rng.pick([
            "AC Compressor replacement",
            "Refrigerant gas top-up",
            "Labor charges",
            "Filter replacement",
            "Thermostat installation",
          ]),
          quantity,
          unitPriceMinor,
          totalMinor: Math.floor(quantity * unitPriceMinor),
          sortOrder: j,
        },
      });
    }

    quotes.push(quote);
    console.log(
      `✅ Created quote: PKR ${(totalMinor / 100).toFixed(2)} (${status})`,
    );
  }

  // Create invoices
  console.log("💰 Creating invoices...");
  const invoices = [];
  const invoiceRng = new SeededRandom(SEEDS.invoices);
  const invoiceStatuses: Array<
    "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID" | "OVERDUE"
  > = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID", "OVERDUE"];

  for (let i = 0; i < 6; i++) {
    const customer = rng.pick(customers);
    const job = rng.pick(jobs.filter((j) => j.status === "COMPLETED"));
    const status = rng.pick(invoiceStatuses);

    const subtotalMinor = Math.floor(invoiceRng.range(15000, 150000) * 100); // PKR 150-1500
    const taxRateBps = Math.floor(invoiceRng.range(0, 17) * 100); // 0-17%
    const taxMinor = Math.floor((subtotalMinor * taxRateBps) / 10000);
    const totalMinor = subtotalMinor + taxMinor;

    const invoiceNumber = `INV-${String(i + 1).padStart(4, "0")}`;
    const dueAt = invoiceRng.date(now, thirtyDaysFromNow);

    const amountPaidMinor =
      status === "PAID"
        ? totalMinor
        : status === "PARTIALLY_PAID"
          ? Math.floor(totalMinor * 0.5)
          : 0;
    const balanceDueMinor = totalMinor - amountPaidMinor;

    const invoice = await prisma.invoice.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        jobId: job.id,
        createdBy: users[0].id, // Admin user
        invoiceNumber,
        status,
        subtotalMinor,
        discountMinor: 0,
        taxMinor,
        totalMinor,
        amountPaidMinor,
        balanceDueMinor,
        currency: "PKR",
        dueAt,
        issuedAt: status !== "DRAFT" ? now : null,
        paidAt: status === "PAID" ? now : null,
      },
    });

    // Create invoice items
    const itemCount = Math.floor(invoiceRng.range(2, 5));
    for (let j = 0; j < itemCount; j++) {
      const quantity = invoiceRng.range(1, 3);
      const unitPriceMinor = Math.floor(invoiceRng.range(10000, 50000) * 100);
      await prisma.invoiceItem.create({
        data: {
          companyId: company.id,
          invoiceId: invoice.id,
          description: rng.pick([
            "Service call charges",
            "Labor charges",
            "Parts and materials",
            "Emergency service fee",
            "Travel charges",
          ]),
          quantity,
          unitPriceMinor,
          totalMinor: Math.floor(quantity * unitPriceMinor),
          sortOrder: j,
        },
      });
    }

    // Create payment if partially or fully paid
    if (status === "PARTIALLY_PAID" || status === "PAID") {
      await prisma.payment.create({
        data: {
          companyId: company.id,
          invoiceId: invoice.id,
          createdBy: users[0].id,
          amountMinor: amountPaidMinor,
          currency: "PKR",
          method: rng.pick(["CASH", "CARD", "BANK_TRANSFER"] as const),
          provider: "manual",
          idempotencyKey: `payment-${invoice.id}-${Date.now()}`,
        },
      });
    }

    invoices.push(invoice);
    console.log(
      `✅ Created invoice ${invoiceNumber}: PKR ${(totalMinor / 100).toFixed(2)} (${status})`,
    );
  }

  // Create customer reviews for completed jobs
  console.log("⭐ Creating customer reviews...");
  const reviewRng = new SeededRandom("reviews");
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");

  for (let i = 0; i < 5; i++) {
    const job = reviewRng.pick(completedJobs);
    const rating = Math.floor(reviewRng.range(3, 6)); // 3-5 stars

    await prisma.customerReview.create({
      data: {
        companyId: company.id,
        customerId: job.customerId,
        jobId: job.id,
        rating,
        comment:
          rating >= 4
            ? "Excellent service! Very professional."
            : "Good service, but could be faster.",
      },
    });
    console.log(`✅ Created review: ${rating} stars`);
  }

  console.log("\n🎉 Demo data seed completed successfully!");
  console.log("\n📊 Summary:");
  console.log(`   - Company: ${company.name}`);
  console.log(`   - Users: ${users.length}`);
  console.log(`   - Customers: ${customers.length}`);
  console.log(`   - Jobs: ${jobs.length}`);
  console.log(`   - Quotes: ${quotes.length}`);
  console.log(`   - Invoices: ${invoices.length}`);
  console.log("\n🔐 Demo Credentials:");
  console.log("   Email: admin@aera.demo");
  console.log("   Password: Demo123!");
  console.log("\n⚠️  Warning: This is demo data. Do not use in production!");
}

async function main() {
  try {
    await seedDemoData();
  } catch (error) {
    console.error("❌ Error seeding demo data:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
