# Message Pipeline

Messages flow through the ingress service, policy service, and runtime to produce responses.

## Flow

```
Platform (WhatsApp / Slack / Discord / CLI)
  │
  ├─► Chat SDK Adapter (chatsdk-adapter.ts)
  │     • Parses Chat SDK objects
  │     • Detects platform, callerId, mentions
  │     • Downloads attachments to inbox/
  │     • Creates MessageChannel
  │
  ├─► Ingress Service
  │     ├─► Unpaired? Only /pair allowed, else ignore
  │     ├─► Paired:
  │     │     ├─► Slash commands → permission check → execute
  │     │     ├─► Not addressed to bot → store ambient → return
  │     │     └─► Mentioned/DM → mark read, start typing → continue
  │     │
  │     └─► Runtime.handleMessage()
  │
  ├─► Policy Service
  │     • Trigger matching (mention/prefix/always)
  │     • Permission check (prompt.group / prompt.dm)
  │     • Mute check
  │     • Rate limit check
  │     → Returns: process / deny / ignore
  │
  ├─► Runtime (executePrompt)
  │     • Store user message
  │     • Run extension hooks (workspace_init, before_container)
  │     • Resolve RBAC (denied CLIs, extension env vars)
  │     • Fetch message history
  │     • Call agent.run() (subprocess)
  │     • Run after_container hooks
  │     • Store assistant message
  │
  └─► Response
        • Text reply via MessageChannel
        • File attachments via platform-specific sending
```

## CLI / API Path

```
POST /chat
  │
  ├─► Chat Service
  │     • Save input files to inbox/
  │     • Build IngressMessage (isDM=true, isReplyToBot=true)
  │     • Create conversation
  │
  ├─► Runtime.handleMessage(source="cli")
  │     • Skip policy (trusted ingress)
  │     • Check mute
  │     • Execute agent directly
  │
  └─► Response JSON: { reply, files[] }
```

## Trigger Matching

| Mode | Behavior |
|------|----------|
| `mention` | Message contains trigger pattern as a word (default) |
| `prefix` | Message starts with trigger pattern |
| `always` | Every message triggers |

DMs always trigger regardless of mode. Replies to bot messages trigger in groups.

Configured via `MERCURY_TRIGGER_PATTERNS` and `MERCURY_TRIGGER_MATCH`, overridable per-deployment via `mrctl config set trigger.match <mode>`.

## Ambient Messages

Non-triggering messages in paired groups are stored as ambient context:

```
Alice: hello everyone
Bob: what's for lunch?
```

When the agent is later triggered, these ambient messages are included in the prompt so it has conversational context.

## Inbox / Outbox

```
workspace/
├── inbox/     # Incoming attachments (images, docs, audio)
├── outbox/    # Agent-produced files (attached to reply)
```

Outbox files are scanned by mtime — only files created/modified during the current agent run are sent.

## Adapters

| Platform | Connection | Mention Detection | Media |
|----------|-----------|-------------------|-------|
| WhatsApp | WebSocket (Baileys) | JID in mentioned list | Downloaded via Baileys |
| Discord | WebSocket (discord.js) | `<@botId>` in text | CDN URL download |
| Slack | Webhook | App mention event | `url_private` with token |

## Chat API

```bash
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"text": "hello", "callerId": "alice", "files": [{"name": "doc.pdf", "data": "<base64>"}]}'
```

Response: `{ reply: string, files: [{ filename, mimeType, sizeBytes, data }] }`

Always triggers (no trigger matching), respects mutes, per-caller conversation isolation.
