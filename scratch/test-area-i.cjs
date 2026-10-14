const { createRequire } = require("module");
const backendRequire = createRequire("c:/development/aera/backend/package.json");
const { Client } = backendRequire("pg");

const API_BASE = "http://127.0.0.1:4000/api/v1";

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function get(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function patch(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function del(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status };
}

async function runAreaITests() {
  console.log("=== AREA I: COMPANY SETTINGS, NOTIFICATIONS, PROFILE ===");
  const suffix = Date.now().toString().slice(-6);

  // 1. Register Owner A & Company A
  console.log("\n[1] Registering Owner A & Company A...");
  const regA = await post("/auth/register", {
    email: `owner.a.${suffix}@example.com`,
    password: "Password123!@#",
    firstName: "Owner",
    lastName: "Alpha",
    companyName: `Alpha Climate ${suffix}`,
  });
  console.log("Register A Status:", regA.status);
  const tokenA = regA.data.data.accessToken;
  const companyAId = regA.data.data.company.id;
  const userAId = regA.data.data.user.id;

  // 2. Invite & accept Technician A
  console.log("\n[2] Inviting & accepting Technician A...");
  const invTech = await post("/companies/current/invitations", {
    email: `tech.a.${suffix}@example.com`,
    firstName: "Tech",
    lastName: "Alpha",
    role: "TECHNICIAN",
  }, tokenA);
  const techTokenRaw = invTech.data.data.invitationToken;
  const accTech = await post("/auth/accept-invitation", {
    token: techTokenRaw,
    password: "Password123!@#",
  });
  const techToken = accTech.data.data.accessToken;
  const techUserId = accTech.data.data.user.id;
  console.log("Technician A accepted, status:", accTech.status);

  // 3. Register Owner B & Company B (for multi-tenant isolation)
  console.log("\n[3] Registering Owner B & Company B (tenant isolation)...");
  const regB = await post("/auth/register", {
    email: `owner.b.${suffix}@example.com`,
    password: "Password123!@#",
    firstName: "Owner",
    lastName: "Beta",
    companyName: `Beta Climate ${suffix}`,
  });
  const tokenB = regB.data.data.accessToken;
  const companyBId = regB.data.data.company.id;

  // --- COMPANY SETTINGS ---
  console.log("\n--- TEST GROUP: COMPANY SETTINGS ---");
  // 4. GET /companies/current returns only user's company
  const compCurrent = await get("/companies/current", tokenA);
  console.log("GET /companies/current status:", compCurrent.status);
  if (compCurrent.status !== 200 || compCurrent.data.data.id !== companyAId) {
    throw new Error(`Failed GET /companies/current: expected ${companyAId}, got ${JSON.stringify(compCurrent.data)}`);
  }
  console.log("Company settings fields:", Object.keys(compCurrent.data.data));

  // 5. Non-owner (Technician) attempting PATCH /companies/current -> 403
  const techPatch = await patch("/companies/current", { name: "Hacked Co" }, techToken);
  console.log("Technician PATCH /companies/current status:", techPatch.status, techPatch.data?.error?.code);
  if (techPatch.status !== 403) {
    throw new Error(`Expected 403 for technician PATCH /companies/current, got ${techPatch.status}`);
  }

  // 6. Owner validation: empty name or invalid currency
  const emptyPatch = await patch("/companies/current", {}, tokenA);
  console.log("Empty PATCH status:", emptyPatch.status, emptyPatch.data?.error?.code);
  if (emptyPatch.status !== 422) {
    throw new Error(`Expected 422 for empty PATCH, got ${emptyPatch.status}`);
  }

  const badCurrencyPatch = await patch("/companies/current", { defaultCurrency: "INVALID" }, tokenA);
  console.log("Bad currency PATCH status:", badCurrencyPatch.status, badCurrencyPatch.data?.error?.code);
  if (badCurrencyPatch.status !== 422) {
    throw new Error(`Expected 422 for bad currency, got ${badCurrencyPatch.status}`);
  }

  // 7. Owner PATCH /companies/current updates name and timezone
  const validPatch = await patch("/companies/current", {
    name: `Alpha Climate Solutions ${suffix}`,
    timezone: "America/Chicago",
  }, tokenA);
  console.log("Owner PATCH status:", validPatch.status, validPatch.data?.data?.name, validPatch.data?.data?.timezone);
  if (validPatch.status !== 200 || validPatch.data.data.name !== `Alpha Climate Solutions ${suffix}`) {
    throw new Error(`Failed owner PATCH: ${JSON.stringify(validPatch.data)}`);
  }

  // --- PROFILE & AUTH ---
  console.log("\n--- TEST GROUP: PROFILE & AUTH ---");
  // 8. GET /auth/me returns authentic user data
  const meA = await get("/auth/me", tokenA);
  console.log("GET /auth/me Owner A:", meA.status, meA.data?.data?.user?.email, "Role:", meA.data?.data?.role);
  if (meA.status !== 200 || meA.data.data.role !== "OWNER" || meA.data.data.user.id !== userAId) {
    throw new Error(`Invalid /auth/me for Owner A: ${JSON.stringify(meA.data)}`);
  }

  const meTech = await get("/auth/me", techToken);
  console.log("GET /auth/me Tech A:", meTech.status, meTech.data?.data?.user?.email, "Role:", meTech.data?.data?.role);
  if (meTech.status !== 200 || meTech.data.data.role !== "TECHNICIAN" || meTech.data.data.user.id !== techUserId) {
    throw new Error(`Invalid /auth/me for Tech A: ${JSON.stringify(meTech.data)}`);
  }

  // 9. Sign Out revokes server session
  console.log("\n[9] Testing Sign Out server session revocation...");
  const tempOwner = await post("/auth/register", {
    email: `temp.logout.${suffix}@example.com`,
    password: "Password123!@#",
    firstName: "Temp",
    lastName: "User",
    companyName: `Temp Co ${suffix}`,
  });
  const tempToken = tempOwner.data.data.accessToken;
  const tempRefreshToken = tempOwner.data.data.refreshToken;

  const logoutRes = await post("/auth/logout", { refreshToken: tempRefreshToken }, tempToken);
  console.log("Logout status:", logoutRes.status);
  if (logoutRes.status !== 204) {
    throw new Error(`Expected 204 for logout, got ${logoutRes.status}`);
  }

  // Attempting to refresh with the revoked refresh token must be rejected
  const refreshAfterLogout = await post("/auth/refresh", { refreshToken: tempRefreshToken });
  console.log("Refresh after logout status:", refreshAfterLogout.status, refreshAfterLogout.data?.error?.code);
  if (refreshAfterLogout.status !== 401) {
    throw new Error(`Expected 401 after logout refresh, got ${refreshAfterLogout.status}`);
  }

  // --- NOTIFICATIONS ---
  console.log("\n--- TEST GROUP: NOTIFICATIONS ---");
  // 10. List notifications for Technician (initially empty)
  const initialTechNotifs = await get("/notifications", techToken);
  console.log("Initial Tech notifications count:", initialTechNotifs.data.data.items.length);

  // 11. Unread count endpoint
  const unreadCountRes = await get("/notifications/unread-count", techToken);
  console.log("GET /notifications/unread-count:", unreadCountRes.status, unreadCountRes.data?.data?.unreadCount);
  if (unreadCountRes.status !== 200 || typeof unreadCountRes.data.data.unreadCount !== "number") {
    throw new Error(`Expected unreadCount number, got ${JSON.stringify(unreadCountRes.data)}`);
  }

  // 12. Create Customer, Address & Job in Company A
  console.log("\n[12] Creating customer and job to trigger notification...");
  const custRes = await post("/customers", {
    firstName: "Zubair",
    lastName: "Khan",
    email: `zubair.${suffix}@example.com`,
  }, tokenA);
  const custId = custRes.data.data.id;

  const addrRes = await post(`/customers/${custId}/addresses`, {
    label: "Main House",
    line1: "12 Gulberg III",
    city: "Lahore",
    countryCode: "PK",
  }, tokenA);
  const addrId = addrRes.data.data.id;

  const jobRes = await post("/jobs", {
    customerId: custId,
    serviceAddressId: addrId,
    serviceType: "AC Inspection",
    problemDescription: "Cooling efficiency dropped",
  }, tokenA);
  const jobId = jobRes.data.data.id;

  // 13. Assign job to Technician A -> triggers JOB_ASSIGNED notification for technician
  console.log("\n[13] Assigning job to technician...");
  const assignRes = await post(`/jobs/${jobId}/assign`, { technicianId: techUserId }, tokenA);
  console.log("Assign status:", assignRes.status);

  // Poll for notification row creation (async queue)
  let techNotifItem = null;
  for (let i = 0; i < 20; i++) {
    const check = await get("/notifications", techToken);
    if (check.data?.data?.items?.length > 0) {
      techNotifItem = check.data.data.items[0];
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!techNotifItem) {
    throw new Error("Did not receive JOB_ASSIGNED notification for technician within timeout");
  }
  console.log("Technician received notification:", techNotifItem.type, "Job:", techNotifItem.payload?.jobId);
  if (techNotifItem.type !== "JOB_ASSIGNED" || techNotifItem.payload?.jobId !== jobId) {
    throw new Error(`Invalid notification payload: ${JSON.stringify(techNotifItem)}`);
  }

  // 14. Check unread count is updated
  const unreadAfterAssign = await get("/notifications/unread-count", techToken);
  console.log("Unread count after assign:", unreadAfterAssign.data.data.unreadCount);
  if (unreadAfterAssign.data.data.unreadCount < 1) {
    throw new Error("Unread count should be >= 1");
  }

  // 15. Mark notification as read
  console.log("\n[15] Marking notification as read...");
  const markReadRes = await post(`/notifications/${techNotifItem.id}/read`, {}, techToken);
  console.log("Mark read status:", markReadRes.status, "readAt:", markReadRes.data?.data?.readAt);
  if (markReadRes.status !== 200 || !markReadRes.data.data.readAt) {
    throw new Error(`Failed marking read: ${JSON.stringify(markReadRes.data)}`);
  }

  // 16. Mark all read
  console.log("\n[16] Testing /notifications/read-all...");
  const readAllRes = await post("/notifications/read-all", {}, techToken);
  console.log("Read all status:", readAllRes.status, "updatedCount:", readAllRes.data?.data?.updatedCount);
  if (readAllRes.status !== 200) {
    throw new Error(`Failed mark-all-read: ${JSON.stringify(readAllRes.data)}`);
  }

  const unreadAfterReadAll = await get("/notifications/unread-count", techToken);
  console.log("Unread count after read-all:", unreadAfterReadAll.data.data.unreadCount);
  if (unreadAfterReadAll.data.data.unreadCount !== 0) {
    throw new Error(`Expected 0 unread after read-all, got ${unreadAfterReadAll.data.data.unreadCount}`);
  }

  // 17. Device token registration & deletion
  console.log("\n[17] Testing Device Token registration and deletion...");
  const devTokenStr = `fcm_device_token_${suffix}`;
  const regDev = await post("/notifications/device-tokens", {
    token: devTokenStr,
    platform: "ANDROID",
  }, techToken);
  console.log("Register device token status:", regDev.status, regDev.data?.data?.platform);
  if (regDev.status !== 201) {
    throw new Error(`Failed to register device token: ${JSON.stringify(regDev.data)}`);
  }

  const delDev = await del("/notifications/device-tokens", { token: devTokenStr }, techToken);
  console.log("Delete device token status:", delDev.status);
  if (delDev.status !== 204) {
    throw new Error(`Failed to delete device token: status ${delDev.status}`);
  }

  // --- TENANT ISOLATION ---
  console.log("\n--- TEST GROUP: MULTI-TENANT ISOLATION ---");
  // 18. Company B cannot see Company A's notifications
  const notifsB = await get("/notifications", tokenB);
  console.log("Company B notifications count:", notifsB.data.data.items.length);
  const foundACross = notifsB.data.data.items.some((n) => n.id === techNotifItem.id);
  if (foundACross) {
    throw new Error("SECURITY BREACH: Company B saw Company A's notification!");
  }

  // 19. Company B cannot mark Company A's notification as read
  const crossMark = await post(`/notifications/${techNotifItem.id}/read`, {}, tokenB);
  console.log("Cross-tenant mark read status:", crossMark.status, crossMark.data?.error?.code);
  if (crossMark.status !== 404) {
    throw new Error(`Expected 404 on cross-tenant mark read, got ${crossMark.status}`);
  }

  // 20. Direct SQL verification
  console.log("\n--- TEST GROUP: DIRECT SQL DATABASE VERIFICATION ---");
  const pgClient = new Client({
    connectionString: "postgresql://postgres:Mueezy20%40@localhost:5432/aera_test",
  });
  await pgClient.connect();

  const compDb = await pgClient.query('SELECT id, name, timezone, "defaultCurrency" FROM companies WHERE id = $1', [companyAId]);
  console.log("DB Company row:", compDb.rows[0]);
  if (compDb.rows[0].timezone !== "America/Chicago") {
    throw new Error("DB company timezone did not match updated value");
  }

  const notifDb = await pgClient.query(
    'SELECT id, type, "companyId", "recipientUserId", "readAt" FROM notifications WHERE id = $1',
    [techNotifItem.id],
  );
  console.log("DB Notification row:", notifDb.rows[0]);
  if (!notifDb.rows[0].readAt) {
    throw new Error("DB notification read_at should not be null");
  }

  const devTokenDb = await pgClient.query("SELECT * FROM device_tokens WHERE token = $1", [devTokenStr]);
  console.log("DB Device tokens count for deleted token:", devTokenDb.rows.length);
  if (devTokenDb.rows.length !== 0) {
    throw new Error("DB device token should have been removed");
  }

  await pgClient.end();
  console.log("\n>>> ALL AREA I TESTS PASSED SUCCESSFULLY! (20/20 PASS) <<<");
}

runAreaITests().catch((err) => {
  console.error("\nTEST FAILED:", err);
  process.exit(1);
});
