# Workspaces

Mercury supports **multiple workspaces** per deployment. Each workspace is an isolated environment with its own agent persona, knowledge, sessions, roles, and configuration.

## Concept

A workspace is a named container for a set of conversations. Each conversation (group chat, DM) maps to exactly **one** workspace. Unassigned conversations are silently ignored.

Workspaces enable:
- **Multi-tenant deployments** — serve different teams/clients from one Mercury instance
- **Persona separation** — different bot names, trigger patterns, and models per workspace
- **Secret isolation** — different API keys and credentials per workspace
- **Data isolation** — messages, roles, tasks, config, mutes all scoped per workspace

## Directory Layout

```
my-bot/
├── .env                    # Deployment-level config (shared defaults)
├── state.db                # Single DB with workspace-scoped tables
├── extensions/             # Shared across all workspaces
├── workspaces/
│   ├── acme/
│   │   ├── .env            # Workspace overrides (bot name, API keys)
│   │   ├── AGENTS.md       # Per-workspace system prompt
│   │   ├── .pi/skills/     # Auto-populated from extensions
│   │   ├── inbox/
│   │   ├── outbox/
│   │   ├── knowledge/
│   │   ├── .messages/
│   │   └── sessions/
│   │       └── dm-user123/session.jsonl
│   └── personal/
│       ├── .env
│       ├── AGENTS.md
│       └── ...
```

## Creating Workspaces

### CLI
```bash
mercury workspace create <name>
mercury workspace list
mercury workspace delete <name>
```

### API
```
POST /api/workspaces          { "name": "acme" }
GET  /api/workspaces
DELETE /api/workspaces/:name
```

## Pairing Conversations

Each workspace has its own pairing code. Send `/pair <CODE>` in any chat to assign it to that workspace.

```bash
# Show pairing code
mercury workspace pairing-code acme
# → Pairing code for "acme": A3F9K2
# → Send "/pair A3F9K2" in any chat to pair it with this workspace.
```

- **Group chat**: `/pair A3F9K2` → conversation assigned to "acme" workspace
- **DM**: `/pair A3F9K2` → DM assigned to "acme", user becomes admin in that workspace
- **Unpair**: `/unpair` → conversation unassigned, bot stops responding

### Manual Assignment

```bash
mercury workspace link <conversation-id> <workspace-name>
mercury workspace unlink <conversation-id>
```

## Workspace Configuration (.env)

Each workspace can override deployment-level settings via `workspaces/<name>/.env`:

```env
MERCURY_BOT_USERNAME=acme-bot
MERCURY_TRIGGER_PATTERNS=@Acme,acme
MERCURY_MODEL=claude-haiku-4-5
MERCURY_GH_TOKEN=ghp_workspace_specific_token
```

### Overridable Settings

| Setting | Description |
|---------|-------------|
| `MERCURY_BOT_USERNAME` | Bot display name |
| `MERCURY_TRIGGER_PATTERNS` | Comma-separated trigger patterns |
| `MERCURY_TRIGGER_MATCH` | Trigger mode (prefix, mention, always) |
| `MERCURY_MODEL_PROVIDER` | AI model provider |
| `MERCURY_MODEL` | Model name |
| `MERCURY_AGENT_TIMEOUT_MS` | Agent timeout |
| `MERCURY_RATE_LIMIT_PER_USER` | Rate limit |
| Any `MERCURY_*` extension var | Extension-specific secrets |

### Non-Overridable (Deployment-Only)

Port, adapter enables (WhatsApp/Discord/Slack/Teams), logging, telemetry, WhatsApp auth directory.

### CLI Management

```bash
mercury workspace env list acme
mercury workspace env set acme MERCURY_GH_TOKEN ghp_xxx
mercury workspace env unset acme MERCURY_GH_TOKEN
```

## Data Isolation

All scoped data includes a `workspace_id` column:

| Data | Scoped? |
|------|---------|
| Messages | ✓ Per workspace |
| Sessions | ✓ Per workspace (filesystem) |
| Roles | ✓ Per workspace |
| Config | ✓ Per workspace |
| Mutes | ✓ Per workspace |
| Tasks | ✓ Per workspace |
| Extension state | ✓ Per workspace |
| Knowledge vault | ✓ Per workspace (filesystem) |
| Extensions | ✗ Shared globally |
| Platform adapters | ✗ Shared globally |

## Agent Execution

When a message arrives:

1. Look up conversation → `workspace_id`
2. If unassigned → only `/pair` accepted, everything else ignored
3. Load workspace `.env` overrides (bot name, model, secrets)
4. Load workspace-specific trigger patterns
5. Resolve caller role within workspace
6. Run agent with `cwd = workspaces/<name>/`
7. Sessions stored at `workspaces/<name>/sessions/<conv-id>/`
8. Agent receives `WORKSPACE_ID` and `WORKSPACE_NAME` env vars

## mrctl (In-Container)

When running inside a container, `mrctl` automatically scopes all API calls to the current workspace via the `X-Mercury-Workspace` header (set from the `WORKSPACE_ID` env var).

```bash
mrctl tasks list       # Lists tasks for current workspace only
mrctl roles list       # Lists roles for current workspace only
mrctl config get       # Gets config for current workspace only
```
