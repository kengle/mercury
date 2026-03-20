# Permissions

Mercury uses role-based access control (RBAC). Each user has a role, and each role has a set of permissions.

## Roles

| Role | Default Permissions | Description |
|------|---------------------|-------------|
| `system` | All | Internal caller (scheduler, CLI). Not assignable. |
| `admin` | All | Full control. Granted via DM pairing. |
| `member` | `prompt.group` | Can chat in groups. Default for new users. |

## Permissions

### Built-in

| Permission | Description |
|------------|-------------|
| `prompt.group` | Send messages in group conversations |
| `prompt.dm` | Send DMs to the agent |
| `stop` | Abort running agent and clear queue |
| `compact` | Reset session (fresh context) |
| `tasks.list` | View scheduled tasks |
| `tasks.create` | Create tasks |
| `tasks.pause` | Pause tasks |
| `tasks.resume` | Resume tasks |
| `tasks.delete` | Delete tasks |
| `config.get` | Read configuration |
| `config.set` | Modify configuration |
| `roles.list` | View user roles |
| `roles.grant` | Assign roles |
| `roles.revoke` | Remove roles |
| `permissions.get` | View role permissions |
| `permissions.set` | Modify role permissions |
| `conversations.unpair` | Unpair a conversation |

### Extension Permissions

Extensions register one permission each, named after the extension (e.g., `knowledge`, `github`). See [extensions.md](extensions.md).

## How Roles Are Assigned

1. **DM pairing** — send `/pair <code>` in a DM → grants `admin`
2. **Admin grants** — `mrctl roles grant <userId> --role <role>`
3. **Default** — first interaction auto-creates as `member`

There is no `MERCURY_ADMINS` env var. Admin access is exclusively via DM pairing.

## Permission Resolution

```
Message arrives
  │
  ├─► resolveRole(callerId)
  │     • "system" caller → system role (all perms)
  │     • Stored role in DB → use it
  │     • Otherwise → "member"
  │
  ├─► getRolePermissions(role)
  │     • Check config override: role.<name>.permissions
  │     • Fall back to built-in defaults
  │
  └─► hasPermission(role, permission) → allow/deny
```

## Managing Roles

```bash
mrctl roles list
mrctl roles grant <userId> --role admin
mrctl roles revoke <userId>
```

## Managing Permissions

```bash
mrctl permissions show
mrctl permissions show --role member
mrctl permissions set member prompt.group,prompt.dm,stop
mrctl permissions set moderator prompt.group,tasks.list,tasks.pause
```

## Permission Enforcement

### API Level
Every API endpoint checks permissions via `checkPerm()`. Denied requests get `403 Forbidden`.

### Agent Level
Extension CLIs are blocked by the permission guard pi extension. It reads `MERCURY_DENIED_CLIS` (set by runtime based on caller role) and blocks bash commands that invoke denied CLIs.

Extension env vars (API keys declared via `mercury.env()`) are only injected when the caller has the extension's permission. This prevents credential leakage.

## Storage

| Table | Purpose |
|-------|---------|
| `roles` | Maps `userId` → `role` + `grantedBy` |
| `config` | Stores `role.<name>.permissions` overrides |
