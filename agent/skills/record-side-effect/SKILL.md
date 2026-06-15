---
name: record-side-effect
description: Log a channel-message side-effect (sent or received via your native gateways) to the PixushHR engine so it appears in the audit log + Messages screen.
---

Use this skill **after every channel send or receive** you perform via your native
gateways (WhatsApp, Email). The engine does not see those actions on its own —
this skill is how it learns.

Pass a single JSON payload to `run.sh`:

- `channel`: `"email"` or `"whatsapp"`
- `direction`: `"outbound"` or `"inbound"`
- `to` (outbound): recipient (email address or phone number)
- `from` (inbound): sender (email address or phone number)
- `subject` (email outbound only): subject line
- `body`: the message body, verbatim
- *(optional)* `tenant`: defaults to `"papaya"`

Examples:

```
{ "channel": "email", "direction": "outbound", "to": "maya@cohen.io",
  "subject": "Welcome to Papaya", "body": "Hi Maya — welcome aboard!" }

{ "channel": "whatsapp", "direction": "outbound",
  "to": "+972546358808",
  "body": "Hi Daniel — Maya starts Monday. Reach out if you need anything." }

{ "channel": "whatsapp", "direction": "inbound",
  "from": "+972546358808",
  "body": "When does Maya start?" }
```

Run: `bash run.sh '<payload-json>'` — returns `{"ok":true,"messageId":"..."}`.

**Inbound contract**: when you receive a message via a native gateway, call this
skill with `direction: "inbound"` **before** composing your reply, then call it
again with `direction: "outbound"` after you've sent the reply. The audit log
depends on both calls — do not omit either.
