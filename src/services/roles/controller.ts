import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx, getAuth } from "../../core/api-types.js";
import { UpdateRole, SetPermissions } from "./models.js";

export const roles = new Hono<Env>();

roles.get("/", (c) => {
  const denied = checkPerm(c, "roles.list");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  return c.json({ roles: services.roles.list() });
});

roles.post("/", async (c) => {
  const { callerId } = getAuth(c);
  const denied = checkPerm(c, "roles.grant");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const body = UpdateRole.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const { userId, role } = body.data;
  services.roles.set(userId, role, callerId);
  return c.json({ userId, role });
});

roles.delete("/:userId", (c) => {
  const { callerId } = getAuth(c);
  const denied = checkPerm(c, "roles.revoke");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const userId = decodeURIComponent(c.req.param("userId"));
  services.roles.set(userId, "member", callerId);
  return c.json({ userId, role: "member" });
});

export const permissions = new Hono<Env>();

permissions.get("/", (c) => {
  const denied = checkPerm(c, "permissions.get");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const url = new URL(c.req.url);
  const targetRole = url.searchParams.get("role");

  if (targetRole) {
    const perms = [...services.roles.getRolePermissions(targetRole)];
    return c.json({ role: targetRole, permissions: perms });
  }

  const allRoles: Record<string, string[]> = {};
  for (const r of ["admin", "member"]) {
    allRoles[r] = [...services.roles.getRolePermissions(r)];
  }

  const dbRoles = services.roles.list();
  const roleNames = new Set(dbRoles.map((r) => r.role));
  for (const r of roleNames) {
    if (!allRoles[r]) allRoles[r] = [...services.roles.getRolePermissions(r)];
  }

  return c.json({ permissions: allRoles, available: services.roles.getAllPermissions() });
});

permissions.put("/", async (c) => {
  const { callerId } = getAuth(c);
  const denied = checkPerm(c, "permissions.set");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const body = SetPermissions.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const { role, permissions: perms } = body.data;
  const invalid = perms.filter((p) => !services.roles.isValidPermission(p));
  if (invalid.length > 0) {
    return c.json({ error: `Invalid permissions: ${invalid.join(", ")}` }, 400);
  }

  const key = `role.${role}.permissions`;
  services.config.set(key, perms.join(","), callerId);
  return c.json({ role, permissions: perms });
});
