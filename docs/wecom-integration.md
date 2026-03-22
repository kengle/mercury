# WeCom (Enterprise WeChat) Integration

This document describes how to configure and use Mercury with WeCom (企业微信/Enterprise WeChat).

## Overview

Mercury supports WeCom via the `@wecom/aibot-node-sdk` package. The WeCom adapter uses WebSocket for real-time message delivery and supports:

- Text messages
- Image, video, file attachments
- Mixed messages (text + media)
- Voice messages

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable WeCom adapter
MERCURY_ENABLE_WECOM=true

# WeCom bot credentials (required)
MERCURY_WECOM_BOT_ID=your_bot_id
MERCURY_WECOM_SECRET=your_bot_secret

# Optional: media file storage directory
# MERCURY_WECOM_MEDIA_DIR=/path/to/wecom-media
# Default: <dataDir>/wecom-media
```

### Getting WeCom Credentials

1. Log in to [WeCom Open Platform](https://open.work.weixin.qq.com/)
2. Create a self-built application
3. Configure the app with callback URL: `https://your-server.com/webhooks/wecom`
4. Get the `AgentId` (use as `MERCURY_WECOM_BOT_ID`) and `Secret` from the app settings

## Message Flow

```
WeCom → WebSocket → Mercury Adapter → Ingress Service → Core Runtime → Agent
Agent → Bridge → WeCom Adapter → WebSocket → WeCom
```

### Thread ID Format

WeCom thread IDs follow this format:
```
wecom:{convId}:{chattype}:{reqId}
```

- `convId`: Conversation ID (chatid or from userid)
- `chattype`: `single` for 1:1, `group` for group chats
- `reqId`: Unique request ID from WeCom

### Message Types

| WeCom Type | Mercury Handling |
|------------|------------------|
| `text` | Text message |
| `image` | Image attachment |
| `file` | Document attachment |
| `video` | Video attachment |
| `voice` | Voice message (text fallback) |
| `mixed` | Text + media attachments |

## File Handling

### Incoming Media

- Downloaded to `<wecomMediaDir>/` with timestamp-based filenames
- Saved with appropriate extensions: `.jpg` (images), `.mp4` (video), `.ogg` (voice), `.bin` (files)
- Attached to messages as `MessageAttachment`

### Outgoing Media

- Files from agent's `outbox/` are sent via WeCom media API
- Supported types: images, videos, audio, documents
- Media is uploaded to WeCom first, then sent via `media_id`

## Conversation Pairing

WeCom conversations follow Mercury's pairing model:

1. **First message**: Send `/pair <code>` to activate the conversation
2. **Paired**: Bot will respond to all messages
3. **Unpair**: Send `/unpair` to stop bot responses

In DMs, all messages are treated as addressed to the bot.

## Rate Limiting

WeCom messages are subject to Mercury's global rate limiter:
- Default: 10 messages per user per minute
- Configurable via `MERCURY_RATE_LIMIT_PER_USER` and `MERCURY_RATE_LIMIT_WINDOW_MS`

## Troubleshooting

### WebSocket Connection Issues

Check logs for `[WeCom] WebSocket connected` or `[WeCom] disconnected` messages. Verify:
- `MERCURY_WECOM_BOT_ID` and `MERCURY_WECOM_SECRET` are correct
- Network connectivity to WeCom servers
- Callback URL is properly configured in WeCom admin panel

### Media Download Failures

Logs will show `[WeCom] download failed` with error details. Common causes:
- Expired media URLs (WeCom URLs have short TTL)
- Network issues
- Invalid AES keys

### Message Not Responding

- Verify conversation is paired (check logs for "Conversation paired")
- Check rate limiter status
- Ensure message is not from before connection (10s backlog filter)

## Architecture

The WeCom adapter (`src/adapters/wecom.ts`) implements:

1. **WebSocket Client**: Connects to WeCom's WebSocket API
2. **Message Parser**: Converts WeCom frames to Mercury `IncomingMessage`
3. **Media Handler**: Downloads/uploads media files
4. **Message Channel**: Sends replies via WeCom send API

Key components:
- `WeComAdapter`: Main adapter class
- `createWeComAdapter`: Factory function
- `parseRawToMessage()`: Message type handling
- `downloadMedia()`: Media file download
- `postMessage()`: Send messages (reply or push)

## Security Considerations

- Store `MERCURY_WECOM_SECRET` securely
- WeCom callback signatures should be verified (handled by SDK)
- Media files are stored temporarily in configured directory
- All messages from WeCom are treated as mentions (bot-addressed)

## Example Deployment

```bash
# .env
MERCURY_ENABLE_WECOM=true
MERCURY_WECOM_BOT_ID=ww1234567890abcdef
MERCURY_WECOM_SECRET=abc123xyz789
MERCURY_MODEL=claude-sonnet-4-20250514
MERCURY_ANTHROPIC_API_KEY=sk-...

# Start Mercury
bun run src/main.ts
```

Check logs for:
```
[WeCom] WebSocket connected
WeCom adapter configured
```

## API Reference

### WeComAdapter Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Connect WebSocket |
| `disconnect()` | Disconnect gracefully |
| `isConnected()` | Check connection status |
| `postMessage(threadId, msg)` | Send message with optional files |

### Configuration Options

```typescript
interface WeComAdapterOptions {
  botId: string;
  secret: string;
  userName?: string;
  mediaDir?: string;
  ingress: IngressService;
  log: Logger;
}
```

## Related Documentation

- [Pipeline Overview](pipeline.md) - Message flow architecture
- [Memory System](memory.md) - Conversation storage
- [Rate Limiting](rate-limiting.md) - Message rate limits
- [Container Lifecycle](container-lifecycle.md) - Agent container management
