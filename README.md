<p align="center">
  <img src="assets/logo-with-text.svg" alt="Mercury" height="120" />
</p>

<p align="center">
  <em>There are many claws, but this one is mine.</em>
</p>

<p align="center">
  <a href="https://github.com/Michaelliv/mercury"><img alt="GitHub" src="https://img.shields.io/badge/github-mercury-181717?style=flat-square&logo=github" /></a>
  <a href="https://www.npmjs.com/package/mercury-ai"><img alt="npm" src="https://img.shields.io/npm/v/mercury-ai?style=flat-square&logo=npm" /></a>
</p>

Mercury is a personal AI assistant that lives where you chat. It connects to WhatsApp, Slack, and Discord, runs [pi](https://github.com/badlogic/pi) as a sandboxed subprocess, and deploys as a single Docker container.

---

## Quick Start

```bash
npm install -g mercury-ai
mkdir my-assistant && cd my-assistant
mercury init
```

Configure `.env`:

```bash
MERCURY_BOT_USERNAME=Mercury
MERCURY_TRIGGER_PATTERNS=@Mercury,Mercury
MERCURY_MODEL_PROVIDER=anthropic
MERCURY_ENABLE_WHATSAPP=true
```

Authenticate:

```bash
mercury auth login anthropic    # OAuth (opens browser)
mercury auth whatsapp           # WhatsApp QR code
```

Build and start:

```bash
mercury build                   # Build Docker image with extensions
mercury start                   # Start container
mercury logs -f                 # View logs
```

### Auto-Pairing (Zero-Config Onboarding)

Mercury automatically creates dedicated workspaces for new conversations:

**DM Conversations:**
```
User sends first message
    → Auto-create workspace: ws-{platform}-{userId}
    → User granted: admin role
    → Ready to use!
```

**Group Conversations:**
```
Group sends first message
    → Auto-create workspace: ws-{platform}-group-{groupId}
    → Sender granted: member role
    
To become admin, send: /pair <CODE>
    → Verify pairing code
    → User granted: admin role
    → Pairing code regenerated
```

**Manual Pairing (for existing workspaces):**
```bash
mercury pair                    # Show pairing code for a workspace
# Send "/pair <CODE>" in a group → grants admin role to sender
```

**Unpair:**
```
/unpair                         # Unassign conversation from workspace (admin only)
```

---

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                        Docker Container                          │
│                                                                  │
│   ┌──────────┐  ┌─────────┐  ┌─────────┐  ┌───────┐              │
│   │ WhatsApp │  │  Slack  │  │ Discord │  │  API  │              │
│   │ Adapter  │  │ Adapter │  │ Adapter │  │ /chat │              │
│   └────┬─────┘  └─────┬───┘  └────┬────┘  └────┬──┘              │
│        └──────────────┴───────────┴────────────┘                 │
│                           │                                      │
│              ┌────────────▼────────────┐                         │
│              │         Ingress         │                         │
│              │  pairing · commands ·   │                         │
│              │  ambient · routing      │                         │
│              └────────────┬────────────┘                         │
│                           │                                      │
│              ┌────────────▼────────────┐                         │
│              │        Policy           │                         │
│              │  triggers · permissions │                         │
│              │  mutes · rate limits    │                         │
│              └────────────┬────────────┘                         │
│                           │                                      │
│              ┌────────────▼────────────┐                         │
│              │        Runtime          │                         │
│              │  messages · hooks ·     │                         │
│              │  RBAC env · history     │                         │
│              └────────────┬────────────┘                         │
│                           │                                      │
│              ┌────────────▼────────────┐     ┌───────────────┐   │
│              │   pi subprocess         │────▶│   SQLite DB   │   │
│              │   (sandboxed)           │     │   messages,   │   │
│              │   mrctl · extensions    │     │   tasks,      │   │
│              └─────────────────────────┘     │   roles, ...  │   │
│                                              └───────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Description | Docs |
|---------|-------------|------|
| **Multi-platform** | WhatsApp, Slack, Discord, or CLI-only | [pipeline](docs/pipeline.md) |
| **API key auth** | All endpoints require Bearer token | [auth](docs/auth/overview.md) |
| **Auto-pairing** | Zero-config onboarding: auto-create workspaces for new conversations | [permissions](docs/permissions.md) |
| **RBAC** | Role-based permissions (admin/member), extension CLI blocking | [permissions](docs/permissions.md) |
| **Scheduled tasks** | Cron + one-shot tasks with conversation targeting | [scheduler](docs/scheduler.md) |
| **Media** | Images, documents, voice notes in/out | [media](docs/media/overview.md) |
| **Extensions** | CLIs, skills, jobs, hooks, config, widgets | [extensions](docs/extensions.md) |
| **Ambient context** | Non-triggering group messages stored for context | [pipeline](docs/pipeline.md) |
| **Sandbox** | bubblewrap (Linux) / sandbox-exec (macOS) | [agent lifecycle](docs/agent-lifecycle.md) |

---

## CLI

```bash
# Project
mercury init                    # Initialize project
mercury build                   # Build Docker image
mercury start                   # Start container
mercury stop                    # Stop container
mercury restart                 # Rebuild + restart
mercury logs [-f]               # View logs
mercury status                  # Check status
mercury doctor                  # Preflight checks

# Dockerfile (advanced)
mercury dockerfile              # Generate Dockerfile only
mercury dockerfile --local-source /path/to/mercury  # Use local Mercury source
```

### Local Development Workflow (Modifying Mercury Source)

When developing Mercury itself, use `--local-source` to build from your local code:

```bash
# 1. Build image from local Mercury source
mercury build --local-source /path/to/mercury

# 2. Start the container
mercury start

# 3. View logs
mercury logs -f

# After making changes to Mercury source:
mercury build --local-source /path/to/mercury  # Rebuild image (copies source into build context)
docker restart mercury                          # Restart container
# or: mercury stop && mercury start
```

> ℹ️ **How it works**: The `--local-source` flag copies your Mercury source code into the Docker build context as `mercury-source/`, then modifies the Dockerfile to install from that local copy instead of npm. The temporary source directory is cleaned up after the build completes.

# Auth
mercury auth login [provider]   # OAuth login
mercury auth whatsapp           # WhatsApp QR/pairing code
mercury auth status             # Show auth status

# Chat (direct API)
mercury chat "hello"            # Send message
mercury chat -f photo.jpg "?"   # With file attachment
echo "query" | mercury chat     # Piped input

# Conversations
mercury pair                    # Show pairing code for workspace
mercury convos list             # List conversations
mercury convos unpair <id>      # Unpair a conversation

# In-chat commands
/pair <CODE>                    # Grant admin role (groups only)
/unpair                         # Unassign conversation from workspace

# Extensions
mercury ext add <source>        # Install (path, npm:, git:)
mercury ext remove <name>       # Remove
mercury ext list                # List installed

# API Keys
mercury api-keys create <name>  # Create key (shown once)
mercury api-keys list           # List keys (prefix only)
mercury api-keys revoke <id>    # Revoke a key
```

### `mrctl` (agent-side CLI)

Used by the agent inside the sandbox to manage Mercury:

```bash
mrctl whoami                    # Caller identity + permissions
mrctl tasks list|create|pause|resume|run|delete
mrctl roles list|grant|revoke
mrctl permissions show|set
mrctl config get|set
mrctl conversations             # List conversations
mrctl mute|unmute|mutes         # User moderation
mrctl stop                      # Abort current run
mrctl compact                   # Reset session
```

---

## Extensions

```bash
mercury ext add git:github.com/Michaelliv/mercury-extensions#packages/knowledge
mercury ext add git:github.com/Michaelliv/mercury-extensions#packages/web-browser
mercury ext add git:github.com/Michaelliv/mercury-extensions#packages/charts
mercury ext add git:github.com/Michaelliv/mercury-extensions#packages/github
```

Each extension exports a setup function:

```typescript
export default function(mercury) {
  mercury.cli({ name: "napkin", install: "bun add -g napkin-ai" });
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.env({ from: "MERCURY_NAPKIN_API_KEY" });
  mercury.skill("./skill");
  mercury.on("workspace_init", async ({ workspace }) => { ... });
  mercury.job("distill", { interval: 3600_000, run: async (ctx) => { ... } });
}
```

Extension CLIs are installed into the Docker image at build time. RBAC blocks denied CLIs at the bash level. See [docs/extensions.md](docs/extensions.md).

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MERCURY_BOT_USERNAME` | `mercury` | Bot display name |
| `MERCURY_PORT` | `3000` | Server port |
| `MERCURY_MODEL_PROVIDER` | `anthropic` | AI provider |
| `MERCURY_MODEL` | `claude-sonnet-4-20250514` | Model |
| `MERCURY_TRIGGER_PATTERNS` | `@Mercury,Mercury` | Trigger words |
| `MERCURY_TRIGGER_MATCH` | `mention` | `mention` / `prefix` / `always` |
| `MERCURY_ENABLE_WHATSAPP` | `false` | Enable WhatsApp adapter |
| `MERCURY_ENABLE_DISCORD` | `false` | Enable Discord adapter |
| `MERCURY_ENABLE_SLACK` | `false` | Enable Slack adapter |
| `MERCURY_RATE_LIMIT_PER_USER` | `0` (disabled) | Requests per window |
| `MERCURY_AGENT_TIMEOUT_MS` | `900000` (15 min) | Agent subprocess timeout |

---

## Docs

- [Deployment guide](docs/deployment-guide.md)
- [Agent lifecycle](docs/agent-lifecycle.md)
- [Message pipeline](docs/pipeline.md)
- [Permissions & RBAC](docs/permissions.md)
- [Extensions](docs/extensions.md)
- [Scheduled tasks](docs/scheduler.md)
- [Authentication](docs/auth/overview.md)
- [Memory](docs/memory.md)
- [Media handling](docs/media/overview.md)
- [Rate limiting](docs/rate-limiting.md)
- [Graceful shutdown](docs/graceful-shutdown.md)
- **Platform setup:** [WhatsApp](docs/setup-whatsapp.md) · [Discord](docs/setup-discord.md) · [Slack](docs/setup-slack.md)

---

## License

MIT

---
