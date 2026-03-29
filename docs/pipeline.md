# Message Pipeline

Messages flow through the ingress service, policy service, and runtime to produce responses. All workspace-scoped operations use the `workspace_id` resolved from the conversation.

## Flow

```
Platform (WhatsApp / Slack / Discord / CLI)
  │
  ├─► Chat SDK Adapter (chatsdk-adapter.ts)
  │     • Parses Chat SDK objects
  │     • Detects platform, callerId, mentions
  │     • Resolves workspace from conversation → downloads attachments to workspace inbox
  │     • Creates MessageChannel
  │
  ├─► Ingress Service
  │     ├─► Resolve conversation → workspace_id
  │     ├─► No workspace? Only /pair <CODE> allowed, else silent ignore
  │     │     • /pair looks up workspace by pairing code, assigns conversation
  │     │     • DM /pair also grants admin role in that workspace
  │     ├─► Assigned to workspace:
  │     │     ├─► Load workspace config (.env overrides for triggers, model, etc.)
  │     │     ├─► Slash commands → workspace-scoped permission check → execute
  │     │     ├─► Not addressed to bot → store ambient (workspace-scoped) → return
  │     │     └─► Mentioned/DM → mark read, start typing → continue
  │     │
  │     └─► Runtime.handleMessage() (with workspaceId + workspaceName)
  │
  ├─► Policy Service (workspace-scoped)
  │     • Resolve role (workspace_id, callerId)
  │     • Permission check (prompt.group / prompt.dm)
  │     • Mute check (workspace_id, callerId)
  │     • Rate limit check (workspace-scoped config)
  │     → Returns: process / deny / ignore
  │
  ├─► Runtime (executePrompt)
  │     • Store user message (workspace-scoped)
  │     • Resolve workspace dir (workspaces/<name>/)
  │     • Load workspace .env overrides (model, secrets, timeout)
  │     • Install extension skills into workspace .pi/skills/
  │     • Run extension hooks (workspace_init, before_container)
  │     • Resolve RBAC (workspace-scoped roles, denied CLIs, extension env vars)
  │     • Fetch message history (workspace-scoped)
  │     • Call agent.run() — cwd=workspaces/<name>/, workspace-specific model/timeout
  │     • Run after_container hooks
  │     • Store assistant message (workspace-scoped)
  │
  └─► Response
        • Text reply via MessageChannel
        • File attachments via platform-specific sending
```

## CLI / API Path

```
POST /chat  { text, workspace?, callerId?, files? }
  │
  ├─► Chat Service
  │     • Resolve workspace by name
  │     • Save input files to workspace inbox
  │     • Build IngressMessage (with workspaceId/workspaceName)
  │     • Create + assign conversation to workspace
  │
  ├─► Runtime.handleMessage(source="cli")
  │     • Reject if no workspace context
  │     • Check mute (workspace-scoped)
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

Configured via `MERCURY_TRIGGER_PATTERNS` and `MERCURY_TRIGGER_MATCH` in the deployment `.env`, overridable per-workspace via `workspaces/<name>/.env`.

## Ambient Messages

Non-triggering messages in workspace-assigned groups are stored as ambient context (scoped by workspace_id):

```
Alice: hello everyone
Bob: what's for lunch?
```

When the agent is later triggered, these ambient messages are included in the prompt so it has conversational context.

## Inbox / Outbox

```
workspaces/<name>/
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
  -d '{"text": "hello", "workspace": "default", "callerId": "alice", "files": [{"name": "doc.pdf", "data": "<base64>"}]}'
```

Response: `{ reply: string, files: [{ filename, mimeType, sizeBytes, data }] }`

The `workspace` field is required when sending files. Always triggers (no trigger matching), respects workspace-scoped mutes, per-caller conversation isolation.
