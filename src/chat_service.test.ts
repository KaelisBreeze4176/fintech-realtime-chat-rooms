import { strict as assert } from "node:assert";
import { toAuditNotification } from "./chat_service.ts";

const result = toAuditNotification({ paymentId: "p-1", accountId: "acct-7", amountCents: 4200, currency: "USD", riskScore: 70 });
assert.equal(result.severity, "review");
assert.equal(result.message, "Payment p-1 needs review");
console.log("risk decision test passed");
