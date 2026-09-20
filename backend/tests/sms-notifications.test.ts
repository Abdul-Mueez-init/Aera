import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { textbeeSmsAdapter } from "../src/modules/notifications/textbee-sms.adapter.js";
import { buildSmsMessage } from "../src/modules/notifications/sms-messages.js";

const app = buildApp();

async function registerOwner(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const payload = {
    email: `owner-${suffix}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: label,
    companyName: `Company ${suffix}`,
  };
  const res = await request(app).post("/api/v1/auth/register").send(payload);
  expect(res.status).toBe(201);
  return res.body.data as { accessToken: string };
}

async function createCustomerWithAddress(auth: { Authorization: string }) {
  const customer = await request(app)
    .post("/api/v1/customers")
    .set(auth)
    .send({ firstName: "Bilal", lastName: "Ahmed" });
  expect(customer.status).toBe(201);
  const address = await request(app)
    .post(`/api/v1/customers/${customer.body.data.id}/addresses`)
    .set(auth)
    .send({
      label: "Home",
      line1: "House 9, Block C",
      city: "Lahore",
      countryCode: "PK",
    });
  expect(address.status).toBe(201);
  return { customerId: customer.body.data.id as string };
}

describe("textbeeSmsAdapter", () => {
  const originalKey = env.TEXTBEE_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    (env as { TEXTBEE_API_KEY?: string }).TEXTBEE_API_KEY = originalKey;
  });

  it("skips sending (and never calls fetch) when TEXTBEE_API_KEY is not configured", async () => {
    (env as { TEXTBEE_API_KEY?: string }).TEXTBEE_API_KEY = undefined;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      textbeeSmsAdapter.send({ to: "+923001234567", body: "Hi" }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the textbee API with the api key header when configured", async () => {
    (env as { TEXTBEE_API_KEY?: string }).TEXTBEE_API_KEY = "tb_test_key";
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);

    await textbeeSmsAdapter.send({ to: "+923001234567", body: "Hi" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.textbee.dev/api/v1/gateway/send-sms");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("tb_test_key");
    expect(JSON.parse(init.body)).toEqual({
      recipients: ["+923001234567"],
      message: "Hi",
    });
  });

  it("throws on a non-2xx response so the queue retries", async () => {
    (env as { TEXTBEE_API_KEY?: string }).TEXTBEE_API_KEY = "tb_test_key";
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => "API key rejected" });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      textbeeSmsAdapter.send({ to: "+923001234567", body: "Hi" }),
    ).rejects.toThrow(/401/);
  });
});

describe("buildSmsMessage", () => {
  it("returns null when the referenced record does not exist for the company", async () => {
    const message = await buildSmsMessage({
      type: "JOB_ASSIGNED",
      companyId: "00000000-0000-0000-0000-000000000000",
      jobId: "00000000-0000-0000-0000-000000000000",
    });
    expect(message).toBeNull();
  });

  it("builds a QUOTE_SENT SMS referencing the real quote total and customer", async () => {
    const owner = await registerOwner("sms-tpl");
    const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(ownerAuth);

    const me = await request(app).get("/api/v1/auth/me").set(ownerAuth);
    expect(me.status).toBe(200);
    const companyId = me.body.data.company.id as string;

    const quote = await request(app)
      .post("/api/v1/quotes")
      .set(ownerAuth)
      .send({
        customerId,
        currency: "USD",
        items: [{ description: "Compressor replacement", quantity: 1, unitPriceMinor: 50000 }],
      });
    expect(quote.status).toBe(201);

    const message = await buildSmsMessage({
      type: "QUOTE_SENT",
      companyId,
      quoteId: quote.body.data.id,
    });

    expect(message).not.toBeNull();
    expect(message!.body).toContain("500.00 USD");
    expect(message!.body).toContain("Bilal Ahmed");
  });

  it("returns null for a quote that belongs to a different company", async () => {
    const owner = await registerOwner("sms-tpl-cross");
    const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(ownerAuth);

    const quote = await request(app)
      .post("/api/v1/quotes")
      .set(ownerAuth)
      .send({
        customerId,
        currency: "USD",
        items: [{ description: "Filter replacement", quantity: 1, unitPriceMinor: 2000 }],
      });
    expect(quote.status).toBe(201);

    const message = await buildSmsMessage({
      type: "QUOTE_SENT",
      companyId: "00000000-0000-0000-0000-000000000000",
      quoteId: quote.body.data.id,
    });
    expect(message).toBeNull();
  });
});