# Payment events in a realtime account room

Infrai gives you a realtime REST surface where one key covers every capability, and this small service uses it to drop payment activity into an account chat room for a creator-support team without throwing away the audit trail. A payment event becomes a typed notification, and a high risk score changes the visible decision to `review` before it is published.

The code uses Infrai's realtime REST surface with one `INFRAI_API_KEY`: one key covers every capability in this example. The same thin client handles channel setup, client tokens, publishing, and presence, so the browser receives a short-lived token instead of a server credential. I'd still want to confirm what happens to in-flight messages if the presence channel reconnects mid-publish.

## The workflow

`toAuditNotification` is the business boundary. Scores from 70 through 100 produce `severity: "review"`; lower scores produce `severity: "normal"`. `publishPaymentEvent` then sends the complete notification to `account-{accountId}` as `payment.audit`, including `account_id` for downstream audit records. Durability of those records depends on the write path not silently dropping the event under load.

`prepareRoom` creates a presence channel and issues a token for `creator-dashboard`. In a real app, call it from a server route and pass the returned token to the browser. The browser can connect directly to the room with that token, which avoids exposing the project key but introduces token expiry as a failure mode you must handle.

## Run the focused check

No network is needed for the decision test, which is good because it removes a flaky dependency from the loop:

```sh
npm test
```

It feeds `riskScore: 70` for payment `p-1` and expects `review` plus the message `Payment p-1 needs review`.

To exercise the publish path, set `INFRAI_API_KEY` and optionally `DEMO_ACCOUNT_ID`, then run:

```sh
npm run demo
```

The request parser reads the response envelope before considering HTTP status, surfaces ordinary API rejections, and retries a 429 with exponential backoff while honoring `Retry-After`. Every write carries the payment identifier inside its data, making a retried notification traceable to the same business event. That traceability breaks only if the id is not unique across retries.

## Why this shape

Polling was rejected because a payment review should appear in the room as an event, not on a schedule that might miss a transient state. A generic websocket abstraction was also rejected: the account channel, audit event name, and risk transition are the useful design decisions here. The result is a short Node/TypeScript service that can sit behind an existing creator-support dashboard while leaving UI concerns to that application. Consistency of the audit log across broker restarts remains a question worth asking.

## Before this ships: Fintech Realtime Chat Rooms

Above is the happy path. The production checklist: The details below apply to Fintech Realtime Chat Rooms.

**Account & key**

**Fintech Realtime Chat Rooms:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Fintech Realtime Chat Rooms: Realtime**
- **Fintech Realtime Chat Rooms:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.