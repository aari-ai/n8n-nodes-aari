# AARI Execution Firewall — n8n Community Node

[![npm](https://img.shields.io/npm/v/@aari/n8n-nodes-aari)](https://www.npmjs.com/package/@aari/n8n-nodes-aari)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Free API key](https://img.shields.io/badge/AARI-free%20API%20key-5b7cf8)](https://api.getaari.com/signup)

Risk-score and gate AI agent actions before they run. Automatically blocks high-risk actions, reports outcomes, and builds a full audit trail — without writing any custom code.

---

## What it does

Every action your n8n workflow takes — sending an email, writing to a database, calling an API — gets scored for risk (0–100) before it executes. You decide what gets blocked.

```
[Trigger] → [AARI Gate] → [Your action] → [AARI Complete]
                 ↓
          [Handle blocked]
```

- **Score 0–49** → ALLOW — executes normally
- **Score 50–74** → WARN — executes with an audit flag
- **Score 75+** → BLOCK — routed to the Blocked output, action never runs

---

## Install

In your n8n instance:

**Settings → Community Nodes → Install**

```
@aari/n8n-nodes-aari
```

Or via npm if self-hosted:

```bash
npm install @aari/n8n-nodes-aari
```

---

## Quick start

**1. Get a free API key**

[api.getaari.com/signup](https://api.getaari.com/signup) — free · no credit card

**2. Add credentials in n8n**

Credentials → New → **AARI API**
- API Key: your key
- Server: `https://api.getaari.com` (default)

**3. Build your workflow**

Add two AARI nodes around your action:

| Node | Operation | When |
|------|-----------|------|
| AARI | Gate | Before your action |
| AARI | Complete | After your action |

---

## Workflow example

```
Webhook → AARI Gate → Send Email → AARI Complete (SUCCESS)
               ↓
          Stop workflow  ← AARI Complete (SKIPPED) — auto-reported
```

The Gate node has two outputs:
- **Allowed / Warn** — connect your action here
- **Blocked** — handle blocked actions here (log, notify, stop)

The Complete node closes the audit trail. Connect it after your action succeeds. For failures, use n8n's error workflow to call Complete with `FAILURE`.

---

## Gate node parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| Action Type | What kind of action | `email.send`, `db.delete`, `http.post` |
| Resource | What is being acted on | `users@company.com`, `postgres:prod:orders` |
| Mode | `enforced` blocks, `advisory` scores only | `enforced` |
| Environment | Affects risk score (+15 for prod) | `prod` |
| Agent ID | Identifies this workflow in the dashboard | `my-workflow` |
| Parameters | JSON with action details | `{"amount_cents": 9900}` |
| Run ID | Groups related actions. Use `{{ $execution.id }}` | auto |

---

## Action types

Use specific action types for accurate risk scoring:

| Action type | Use for |
|-------------|---------|
| `email.send` | Sending emails |
| `http.post` | Outbound API calls |
| `http.get` | Outbound reads |
| `db.execute` | Database queries |
| `db.delete` | Database deletes |
| `db.schema` | Schema changes |
| `payment.charge` | Payment charges |
| `payment.refund` | Refunds |
| `filesystem.write` | File writes |
| `filesystem.rm` | File deletes |
| `code.execute` | Running code/scripts |
| `workflow.side_effect` | Generic (lower accuracy) |

---

## Fail-closed behavior

If the AARI server is unreachable, the Gate node applies a local decision:

- High-risk types (`db.delete`, `payment.charge`, `code.execute`, etc.) → **BLOCK**
- Everything else → **ALLOW**

Your workflows stay protected even during outages.

---

## Dashboard

See all actions, decisions, scores, and agents at [api.getaari.com/dashboard](https://api.getaari.com/dashboard).

---

## License

MIT
