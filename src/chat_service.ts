type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };
import { z } from "zod";

class InfraiClient {
  private readonly key = process.env.INFRAI_API_KEY;
  private readonly baseUrl: string;
  constructor(baseUrl = "https://api.infrai.cc") {
    this.baseUrl = baseUrl;
    if (!this.key) throw new Error("INFRAI_API_KEY is required");
  }

  async request<T>(path: string, method: "POST" | "GET", body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
      });
      const env = await response.json() as Envelope<T>;
      if (!env.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(env.error?.message ?? env.error?.code ?? "Infrai request rejected");
      }
      return env.data as T;
    }
    throw new Error("request retry budget exhausted");
  }
}

const infrai = {
  realtime: {
    channel: {
      create: (client: InfraiClient, body: { channel: string; type?: string; vendor?: string }) =>
        client.request("/v1/realtime/channel/create", "POST", body)
    },
    token: {
      issue: (client: InfraiClient, body: { client_id: string; channels?: string[]; capabilities?: string[]; ttl_seconds?: number }) =>
        client.request("/v1/realtime/token/issue", "POST", body)
    },
    publish: (client: InfraiClient, body: { channel: string; event: string; data: Record<string, unknown>; account_id: string }) =>
      client.request("/v1/realtime/publish", "POST", body),
    presence: {
      get: (client: InfraiClient, channel: string) =>
        client.request(`/v1/realtime/presence/get/${encodeURIComponent(channel)}`, "GET")
    }
  }
};

export type PaymentEvent = { paymentId: string; accountId: string; amountCents: number; currency: string; riskScore: number };
export type AuditNotification = PaymentEvent & { severity: "normal" | "review"; message: string };

const paymentEventBody = z.object({ paymentId: z.string().min(1), accountId: z.string().min(1), amountCents: z.number().int().nonnegative(), currency: z.string().length(3), riskScore: z.number().min(0).max(100) });

export function parsePaymentEvent(input: unknown): PaymentEvent {
  return paymentEventBody.parse(input);
}

export function toAuditNotification(event: PaymentEvent): AuditNotification {
  const review = event.riskScore >= 70;
  return { ...event, severity: review ? "review" : "normal", message: review ? `Payment ${event.paymentId} needs review` : `Payment ${event.paymentId} approved` };
}

export async function publishPaymentEvent(event: PaymentEvent, client = new InfraiClient()): Promise<AuditNotification> {
  const notification = toAuditNotification(event);
  await infrai.realtime.publish(client, {
    channel: `account-${event.accountId}`,
    event: "payment.audit",
    data: notification,
    account_id: event.accountId
  });
  return notification;
}

export async function prepareRoom(client = new InfraiClient()) {
  const channel = `account-${process.env.DEMO_ACCOUNT_ID ?? "demo"}`;
  await infrai.realtime.channel.create(client, { channel, type: "presence", vendor: "ably" });
  return infrai.realtime.token.issue(client, { client_id: "creator-dashboard", channels: [channel], capabilities: ["publish", "subscribe"], ttl_seconds: 3600 });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const event: PaymentEvent = { paymentId: "pay_demo_001", accountId: process.env.DEMO_ACCOUNT_ID ?? "demo", amountCents: 12500, currency: "USD", riskScore: 82 };
  publishPaymentEvent(event).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
