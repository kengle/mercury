# Agent Lifecycle

Mercury runs the agent as a `pi` subprocess, sandboxed via `sandbox-exec` (macOS) or `bubblewrap` (Linux). No Docker containers are used for agent execution.

## Subprocess Flow

```
Message received
  │
  ├─► Queue (single concurrency)
  │
  ├─► Spawn: pi --print --session <file> --provider <p> --model <m> -e permission-guard.ts <prompt>
  │     • CWD = workspace directory
  │     • Env: CALLER_ID, CONVERSATION_ID, API_URL, MERCURY_API_KEY, MERCURY_DENIED_CLIS
  │     • Sandboxed via sandbox-exec (macOS) or bwrap (Linux)
  │
  ├─► Start timeout timer
  │
  ├─► Wait for completion
  │     │
  │     ├─► Success (exit 0) → parse stdout + scan outbox/ → respond
  │     ├─► Timeout → SIGTERM → SIGKILL after 5s → AgentError(timeout)
  │     ├─► Aborted → SIGTERM → AgentError(aborted)
  │     └─► Other failure → AgentError(error)
  │
  └─► Cleanup
        • Clear timeout timer
        • Queue unblocks
```

## Timeout

| Config | Env Var | Default |
|--------|---------|---------|
| `agentTimeoutMs` | `MERCURY_AGENT_TIMEOUT_MS` | 15 minutes |

When the agent exceeds the timeout:
1. `SIGTERM` sent to the process
2. After 5 seconds, `SIGKILL` if still running
3. `AgentError` thrown with `reason: "timeout"`
4. User sees: "Agent timed out."

## Error Types

| Reason | Cause | User Message |
|--------|-------|--------------|
| `timeout` | Exceeded `agentTimeoutMs` | "Agent timed out." |
| `aborted` | User sent `/stop` command | "Stopped current run." |
| `error` | Agent crashed or non-zero exit | *(error logged)* |

## Sandbox

The subprocess is wrapped in an OS-level sandbox:

**macOS (sandbox-exec):** Default-allow policy with deny rules for the data directory, plus explicit allow rules for the workspace and session directories.

**Linux (bubblewrap):** Read-only bind mount of `/`, with writable bind mounts for workspace and session directories. Includes `/dev`, `/proc`, and a tmpfs `/tmp`.

## Environment Variables

The subprocess receives these env vars:

| Variable | Source | Purpose |
|----------|--------|---------|
| `CALLER_ID` | From incoming message | Identity for mrctl API calls |
| `CONVERSATION_ID` | From incoming message | Conversation context for mrctl |
| `API_URL` | `http://localhost:<port>` | Mercury API endpoint for mrctl |
| `MERCURY_API_KEY` | Generated at startup | Auth token for API calls |
| `MERCURY_DENIED_CLIS` | Computed from RBAC | Comma-separated CLIs the caller cannot use |
| Extension env vars | From process.env, RBAC-gated | API keys for extensions (stripped MERCURY_ prefix) |

## Permission Guard

The `permission-guard.ts` pi extension is loaded via `pi -e` on every agent run. It reads `MERCURY_DENIED_CLIS` and blocks bash commands that invoke denied CLIs. The block is enforced at the tool call level — the agent receives a permission denied error with instructions not to attempt workarounds.

## Session Files

Each conversation gets its own pi session file at `<dataDir>/sessions/<conversationId>/session.jsonl`. Sessions persist across messages, giving the agent conversation history.

## Queue

A single `AgentQueue` ensures only one agent runs at a time. Pending messages wait in the queue. On shutdown, pending entries are cancelled and the active agent is killed.
