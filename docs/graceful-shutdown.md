# Graceful Shutdown

On `SIGTERM` or `SIGINT`, Mercury tears down all components in order.

## Sequence

```
SIGTERM/SIGINT received
  │
  ├─1─► Stop scheduler (clear poll timer)
  ├─2─► Cancel pending queue entries
  ├─3─► Kill running agent subprocess
  ├─4─► Wait for active work to drain (up to 8s)
  ├─5─► Notify extensions (shutdown hook)
  ├─6─► Run registered shutdown hooks (disconnect adapters, stop HTTP server)
  ├─7─► Close SQLite database
  └─8─► exit(0)

  Second signal → force exit(1)
  10s timeout  → force exit(1)
```

## Why This Order

1. **Scheduler first** — prevents new work from being created.
2. **Cancel pending queue** — no point starting queued work we'll kill.
3. **Kill agent** — sends SIGKILL to the subprocess.
4. **Wait for drain** — gives active work a chance to finish cleanly.
5. **Extension shutdown** — extensions can clean up (close connections, flush state).
6. **Shutdown hooks** — disconnect chat adapters, stop HTTP server.
7. **Close DB last** — everything above may still write to the database.

## Safety

| Mechanism | Behavior |
|-----------|----------|
| **Double signal** | Second SIGINT/SIGTERM forces `exit(1)` |
| **Global timeout** | 10s default, then forced `exit(1)` |
| **Idempotent** | `shuttingDown` flag prevents re-entry |
| **Hook errors** | Logged and swallowed — remaining cleanup continues |

## API

```ts
core.installSignalHandlers()     // Trap SIGTERM + SIGINT
core.onShutdown(async () => {})  // Register cleanup callback
await core.shutdown(timeoutMs?)  // Trigger manually (default 10s)
core.isShuttingDown              // boolean
```
