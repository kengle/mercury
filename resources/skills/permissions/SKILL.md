---
name: permissions
description: View and manage role permissions. Use when the user asks about what permissions a role has, or wants to change what users can do.
---

## Commands

```bash
mrctl permissions show [--role <role>]
mrctl permissions set <role> <perm1,perm2,...>
```

## Built-in permissions

`prompt.group`, `prompt.dm`, `stop`, `compact`, `tasks.list`, `tasks.create`, `tasks.pause`, `tasks.resume`, `tasks.delete`, `config.get`, `config.set`, `roles.list`, `roles.grant`, `roles.revoke`, `permissions.get`, `permissions.set`

Extension permissions are also available. Each extension adds its own permission (e.g., `knowledge`, `github`). Extension CLIs are called directly in bash — permission enforcement is automatic.
