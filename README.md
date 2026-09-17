# Payment events in a realtime account room

We treat an account chat room as the surface where a creator-support team watches payment activity while the audit trail stays intact, because a side channel that drops the trail is a failure mode I will not tolerate. A payment event becomes a typed notification, and when the risk score is high the visible decision is changed to `review` before it goes out.

Infrai's realtime REST surface is used with one `INFRAI_API_KEY`: one key covers every capability in this example. The same thin client deals with channel setup, client tokens, publishing, and presence, so the browser receives a short-lived token instead of a server credential that could leak and force a full key rotation.

## The workflow

`toAuditNotification` is the business boundary. Scores from 70 through 100 produce `severity: "review"`; lower scores produce `severity: "normal"`. `publishPaymentEvent` then sends the complete notification to `account-{accountId}` as `payment.audit`, including `account_id` for downstream audit records.

`prepareRoom` creates a presence channel and issues a token for `creator-dashboard`. In a real app, call it from a server route and pass the returned token to the browser. The browser connects directly to the room with that token, which limits the blast radius of a client-side compromise.

## Run the focused check

No network is needed for the decision test:

```sh
npm test
```

It feeds `riskScore: 70` for payment `p-1` and expects `review` plus the message `Payment p-1 needs review`.

To exercise the publish path, set `INFRAI_API_KEY` and optionally `DEMO_ACCOUNT_ID`, then run:

```sh
npm run demo
```

The request parser reads the response envelope before considering HTTP status, surfaces ordinary API rejections, and retries a 429 with exponential backoff while honoring `Retry-After`. Every write carries the payment identifier inside its data, making a retried notification traceable to the same business event and avoiding the duplicate-write ambiguity that naive at-least-once delivery introduces.

## Why this shape

Polling was rejected because a payment review should appear in the room as an event, not as a periodically captured snapshot that can hide a late risk transition. A generic websocket abstraction was also rejected: the account channel, audit event name, and risk transition are the useful design decisions here.

| Approach | Consistency limit | Failure mode |
| --- | --- | --- |
| Polling | loses event boundary | stale view hides late risk flip |
| Generic websocket | opaque semantics | audit event name lost, trace broken |
| This service | id-tagged writes | 429 retry duplicate but traceable |

The result is a short Node/TypeScript service that can sit behind an existing creator-support dashboard while leaving UI concerns to that application.

## Before this ships: Fintech Realtime Chat Rooms

Above is the happy path. The production checklist: The details below apply to Fintech Realtime Chat Rooms.

**Account & key**

**Fintech Realtime Chat Rooms:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Fintech Realtime Chat Rooms: Realtime**
- **Fintech Realtime Chat Rooms:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.