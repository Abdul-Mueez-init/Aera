import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword, verifyPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  verifyAccessToken,
} from "../src/common/auth/tokens.js";

const app = buildApp();

describe("authentication boundaries", () => {
  it("hashes passwords and rejects incorrect passwords", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).not.toContain("correct horse");
    await expect(
      verifyPassword("correct horse battery staple", passwordHash),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("signs and verifies an access token context", async () => {
    const context = {
      userId: "user-id",
      sessionId: "session-id",
      companyId: "company-id",
      role: "OWNER" as const,
    };
    const token = await createAccessToken(context);

    await expect(verifyAccessToken(token)).resolves.toEqual(context);
    await expect(verifyAccessToken(`${token}tampered`)).resolves.toBeNull();
  });

  it("rejects unauthenticated current-user requests", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("validates registration input at the API boundary", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });
});
