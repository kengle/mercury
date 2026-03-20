# Scheduler

Mercury includes a task scheduler for automated prompts. Tasks run on **cron schedules** (recurring) or **at schedules** (one-shot).

## Task Types

### Cron (Recurring)

```bash
mrctl tasks create --cron "0 9 * * *" --prompt "Good morning!"
```

### At (One-Shot)

```bash
mrctl tasks create --at "2026-03-02T16:00:00Z" --prompt "Meeting reminder"
```

Runs once, then auto-deletes.

### Silent

```bash
mrctl tasks create --cron "0 3 * * *" --prompt "Run maintenance" --silent
```

Executes without posting results to chat.

## How It Works

```
Poll loop (every 5 seconds)
  │
  ├─► Query: active tasks with next_run_at <= now
  │
  ├─► For each due task:
  │     ├─► Cron: compute next run, update DB, execute
  │     └─► At: execute, then delete from DB
  │
  └─► Schedule next poll
```

Tasks execute as the `createdBy` user. The prompt goes through `executePrompt` — same path as user messages, with message storage, extension hooks, and RBAC.

When a message sender is available (chat adapters enabled), non-silent task results are sent to the task's conversation. In CLI-only mode, results are stored but not delivered.

## Managing Tasks

```bash
mrctl tasks list
mrctl tasks create --cron "0 9 * * *" --prompt "standup"
mrctl tasks create --at "2026-03-02T14:00:00Z" --prompt "reminder"
mrctl tasks pause <id>
mrctl tasks resume <id>
mrctl tasks run <id>        # Trigger immediately
mrctl tasks delete <id>
```

## Cron Format

```
┌─── minute (0-59)
│ ┌─── hour (0-23)
│ │ ┌─── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─── day of week (0-7)
* * * * *
```

| Expression | Description |
|------------|-------------|
| `0 9 * * *` | Daily at 9 AM |
| `0 9 * * 1-5` | Weekdays at 9 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 17 * * 5` | Fridays at 5 PM |

## Permissions

| Permission | Action |
|------------|--------|
| `tasks.list` | View tasks |
| `tasks.create` | Create tasks |
| `tasks.pause` | Pause tasks |
| `tasks.resume` | Resume tasks |
| `tasks.delete` | Delete tasks |

Default: admin only.

## Conversation Targeting

Tasks store a `conversationId` from the `x-mercury-conversation` header (set by mrctl from `CONVERSATION_ID` env var). Task results are sent to that specific conversation.

## Error Handling

- Handler failures are logged, not retried in the same cycle
- Cron tasks: `next_run_at` already updated, runs again next schedule
- At tasks: deleted after execution regardless of success/failure
- Other tasks in the cycle continue normally
