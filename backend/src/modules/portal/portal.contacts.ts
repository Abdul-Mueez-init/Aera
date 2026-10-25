import { prisma } from "../../db/prisma.js";

/**
 * Company contact payload for deactivated/expired portal responses.
 * This payload is returned on UNAUTHENTICATED exchange failures, so it
 * must not carry staff login emails: anyone holding an old link could
 * harvest up to 5 owners'/dispatchers' email addresses (which are also
 * their auth usernames) for phishing/credential attacks. Names and
 * phone numbers plus the company phone satisfy the "contact us"
 * purpose; email tiles in the client degrade gracefully when absent.
 */
export interface CompanyContact {
  company: {
    name: string;
    phone?: string;
  };
  contacts: Array<{
    role: "OWNER" | "DISPATCHER";
    name: string;
    phone?: string;
  }>;
}

/**
 * Get company and owner/dispatcher contacts for a given company.
 * Used for deactivated portal responses to give customers someone to contact.
 */
export async function getCompanyContacts(
  companyId: string,
): Promise<CompanyContact> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      phone: true,
    },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      role: { in: ["OWNER", "DISPATCHER"] },
    },
    take: 5,
    select: {
      role: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  const contacts = members.map((member) => ({
    role: member.role as "OWNER" | "DISPATCHER",
    name: `${member.user.firstName} ${member.user.lastName}`,
    phone: member.user.phone || undefined,
  }));

  return {
    company: {
      name: company.name,
      phone: company.phone || undefined,
    },
    contacts,
  };
}
