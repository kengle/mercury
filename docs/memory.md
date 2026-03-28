# Memory

Mercury stores memory in per-workspace directories and per-conversation session files. Each workspace is fully isolated.

## Workspace

```
workspaces/<name>/
├── inbox/              # Media received from users
├── outbox/             # Files produced by the agent
├── AGENTS.md           # Agent instructions (per workspace)
├── .env                # Workspace-specific config overrides
├── .pi/
│   ├── skills/         # Installed skills (built-in + extension)
│   └── extensions/     # Pi extensions (permission guard)
├── sessions/           # Per-conversation session files
│   └── <conv-id>/session.jsonl
├── .messages/          # Daily message logs
└── (extension dirs)    # Created by extensions (e.g., knowledge/)
```

Extensions create additional directories via the `workspace_init` hook.

## Sessions

Each conversation gets its own pi session file within its workspace:

```
workspaces/<name>/sessions/<conversation-id>/session.jsonl
```

Sessions persist agent conversation history across messages. The `/compact` command resets the session (fresh context). The `/new` command starts a new session without compacting.

## Ambient Messages

Non-triggering messages in workspace-assigned group conversations are stored as ambient context in the `messages` table (scoped by workspace_id). When the agent is triggered, recent ambient messages are included in the prompt so the agent has conversational context.

Format: `AuthorName: message text`

## Message History

The agent receives recent message history (up to 200 messages) from the current conversation and workspace, starting after the last session boundary. This includes:
- `user` — messages that triggered the agent
- `assistant` — agent responses
- `ambient` — non-triggering group messages

## Extension-Driven Memory

The workspace structure beyond `inbox/`/`outbox/` is extension-driven. For example, the `knowledge` extension creates a vault with `entities/`, `daily/`, etc. See [kb-distillation.md](kb-distillation.md).

## Persistence

Memory persists because:
1. Each workspace directory is on disk (mounted as `/data/workspaces/<name>` in Docker)
2. Session files accumulate conversation history
3. The SQLite database stores workspace-scoped messages, conversations, tasks, roles, config

Workspaces are plain files. You can browse them, edit files directly, or back them up.
