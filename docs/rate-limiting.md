# Rate Limiting

Mercury rate limits messages per-user to prevent abuse.

## How It Works

Rate limiting is enforced by the policy service. When a message passes trigger matching and permission checks, the rate limiter is consulted before allowing execution.

Slash commands (`/stop`, `/compact`) bypass rate limiting — users can always abort the agent.

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `MERCURY_RATE_LIMIT_PER_USER` | 0 (disabled) | Max requests per user per window |
| `MERCURY_RATE_LIMIT_WINDOW_MS` | 60000 (1 min) | Sliding window size |

```bash
MERCURY_RATE_LIMIT_PER_USER=5
MERCURY_RATE_LIMIT_WINDOW_MS=60000
```

### Override via Config

```bash
mrctl config set rate_limit 5
```

The `rate_limit` config value takes precedence over the env var.

## Algorithm

Sliding window per user:
1. Key: `callerId`
2. Each request timestamp stored in an array
3. On check: count timestamps within window
4. Under limit → record + allow. Over → deny.

Expired entries cleaned up every 60 seconds.

## User Response

Over-limit users receive: `"Rate limit exceeded. Try again shortly."`

## Muting

For persistent abuse, the agent can mute users. Muted users' messages are silently dropped — no agent runs, no tokens consumed.

```bash
mrctl mute <userId> <duration>            # First call: warning
mrctl mute <userId> <duration> --confirm  # Second call: applies mute
mrctl unmute <userId>
mrctl mutes                               # List active mutes
```

Duration formats: `10m`, `1h`, `24h`, `7d`

Two-step confirmation prevents prompt injection attacks (tricking the agent into muting others).

The system prompt instructs the agent to warn first, then mute proactively for abuse, spam, secret exfiltration, or resource waste.
