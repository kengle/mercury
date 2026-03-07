import { Hono } from "hono";
import { html, raw } from "hono/html";
import { streamSSE } from "hono/streaming";
import type { ExtensionRegistry } from "../../extensions/loader.js";
import type { MercuryExtensionContext } from "../../extensions/types.js";
import type { MercuryCoreRuntime } from "../runtime.js";

interface DashboardContext {
  core: MercuryCoreRuntime;
  adapters: Record<string, boolean>;
  startTime: number;
  registry?: ExtensionRegistry;
  extensionCtx?: MercuryExtensionContext;
}

type HealthStatus = "healthy" | "degraded" | "critical";

export function createDashboardRoutes(ctx: DashboardContext) {
  const { core, adapters, startTime, registry, extensionCtx } = ctx;
  const app = new Hono();

  // ─── Helpers ────────────────────────────────────────────────────────────

  function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 10) return `${seconds}s ago`;
    return "just now";
  }

  function formatFutureTime(timestamp: number): string {
    const now = Date.now();
    const diff = timestamp - now;
    if (diff < 0) return "now";

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `in ${days}d`;
    if (hours > 0) return `in ${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `in ${minutes}m`;
    return `in ${seconds}s`;
  }

  function escapeHtml(str: string): string {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(str: string, len = 40): string {
    if (!str) return "—";
    return str.length > len ? `${str.slice(0, len)}...` : str;
  }

  function getSystemHealth(): {
    status: HealthStatus;
    message: string;
    lastError: string | null;
  } {
    const adapterEntries = Object.entries(adapters);
    const disconnected = adapterEntries.filter(([, connected]) => !connected);
    const queueBacklog = core.queue.pendingCount > 10;

    // TODO: Track actual errors in the system
    const lastError = null;

    if (
      disconnected.length === adapterEntries.length &&
      adapterEntries.length > 0
    ) {
      return {
        status: "critical",
        message: "All adapters disconnected",
        lastError,
      };
    }

    if (queueBacklog) {
      return {
        status: "critical",
        message: `Queue backing up (${core.queue.pendingCount} pending)`,
        lastError,
      };
    }

    if (disconnected.length > 0) {
      return {
        status: "degraded",
        message: `${disconnected.map(([n]) => n).join(", ")} disconnected`,
        lastError,
      };
    }

    return {
      status: "healthy",
      message: "All systems operational",
      lastError,
    };
  }

  function renderExtensionWidgets(): string {
    if (!registry || !extensionCtx) return "";

    const allWidgets: Array<{ extName: string; label: string; html: string }> =
      [];
    for (const ext of registry.list()) {
      for (const widget of ext.widgets) {
        try {
          const widgetHtml = widget.render(extensionCtx);
          allWidgets.push({
            extName: ext.name,
            label: widget.label,
            html: widgetHtml,
          });
        } catch {
          allWidgets.push({
            extName: ext.name,
            label: widget.label,
            html: '<p class="muted">Error rendering widget</p>',
          });
        }
      }
    }

    if (allWidgets.length === 0) return "";

    const widgetPanels = allWidgets
      .map(
        (w) => `
        <div class="panel">
          <div class="panel-header">${escapeHtml(w.label)} <span class="muted">${escapeHtml(w.extName)}</span></div>
          <div class="panel-body">${w.html}</div>
        </div>
      `,
      )
      .join("");

    return `<div class="grid-2">${widgetPanels}</div>`;
  }

  // ─── Page Routes (htmx content swapping) ────────────────────────────────

  // Middleware: redirect direct browser access to main dashboard
  app.use("/page/*", async (c, next) => {
    const isHtmx = c.req.header("HX-Request") === "true";
    if (!isHtmx) {
      // Direct browser access - redirect to dashboard with the page in hash
      const path = c.req.path.replace("/dashboard/page/", "");
      return c.redirect(`/dashboard#${path}`);
    }
    return next();
  });

  app.get("/page/overview", (c) => {
    const activeSpaces = core.containerRunner.getActiveSpaces();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    // Active runs
    const activeRunsHtml =
      activeSpaces.length > 0
        ? activeSpaces
            .map((spaceId) => {
              const space = core.db.getSpace(spaceId);
              const linked = core.db.getSpaceConversations(spaceId);
              const platform = linked[0]?.platform ?? "space";
              const label = space?.name ?? spaceId;
              return `
              <div class="active-run">
                <span class="badge">${platform}</span>
                <span class="mono">${escapeHtml(label)}</span>
                <span class="status active">running</span>
                <button class="btn btn-sm btn-danger" 
                        hx-post="/dashboard/api/stop" 
                        hx-headers='{"X-Mercury-Space": "${escapeHtml(spaceId)}", "X-Mercury-Caller": "dashboard"}'
                        hx-swap="none">Stop</button>
              </div>
            `;
            })
            .join("")
        : '<div class="empty-small">No active runs</div>';

    // Adapters
    const adapterEntries = Object.entries(adapters);
    const adaptersHtml = adapterEntries
      .map(([name, connected]) => {
        const status = connected ? "connected" : "disconnected";
        const icon = connected ? "🟢" : "🔴";
        return `
          <div class="adapter-row">
            <span>${icon} ${name}</span>
            <span class="muted">${status}</span>
          </div>
        `;
      })
      .join("");

    // Recent activity
    const spaces = core.db.listSpaces();
    const activity: Array<{
      spaceId: string;
      spaceName: string;
      platform: string;
      role: string;
      preview: string;
      time: number;
    }> = [];

    for (const space of spaces.slice(0, 5)) {
      const msgs = core.db.getRecentMessages(space.id, 3);
      const linked = core.db.getSpaceConversations(space.id);
      const platform = linked[0]?.platform ?? "space";
      for (const m of msgs) {
        activity.push({
          spaceId: space.id,
          spaceName: space.name,
          platform,
          role: m.role,
          preview: m.content.slice(0, 60),
          time: m.createdAt,
        });
      }
    }
    activity.sort((a, b) => b.time - a.time);

    const activityHtml =
      activity.length > 0
        ? activity
            .slice(0, 8)
            .map(
              (a) => `
              <div class="activity-row" 
                   hx-get="/dashboard/page/spaces/${encodeURIComponent(a.spaceId)}" 
                   hx-target="#main" 
                   hx-push-url="true">
                <span class="time">${formatRelativeTime(a.time)}</span>
                <span class="badge">${a.platform}</span>
                <span class="mono">${escapeHtml(truncate(a.spaceName, 18))}</span>
                <span class="role ${a.role}">${a.role}</span>
                <span class="preview">${escapeHtml(a.preview)}</span>
              </div>
            `,
            )
            .join("")
        : '<div class="empty-small">No recent activity</div>';

    // Upcoming tasks
    const tasks = core.db.listTasks().filter((t) => t.active);
    const upcomingHtml =
      tasks.length > 0
        ? tasks
            .slice(0, 3)
            .map(
              (t) => `
              <div class="task-row">
                <span class="mono">#${t.id}</span>
                <span class="truncate">${escapeHtml(truncate(t.prompt, 25))}</span>
                <span class="muted">${formatFutureTime(t.nextRunAt)}</span>
                <button class="btn btn-sm" 
                        hx-post="/dashboard/api/tasks/${t.id}/run" 
                        hx-swap="none"
                        title="Run now">▶</button>
              </div>
            `,
            )
            .join("")
        : '<div class="empty-small">No scheduled tasks</div>';

    return c.html(html`
      <div class="grid-2">
        <div class="panel">
          <div class="panel-header">Adapters</div>
          <div class="panel-body">${raw(adaptersHtml)}</div>
        </div>
        <div class="panel">
          <div class="panel-header">
            Active Work
            <span class="badge">${activeSpaces.length}</span>
          </div>
          <div class="panel-body">${raw(activeRunsHtml)}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          Recent Activity
          <a href="#" hx-get="/dashboard/page/logs" hx-target="#main" hx-push-url="true" class="link">View logs →</a>
        </div>
        <div class="panel-body">${raw(activityHtml)}</div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-header">
            Upcoming Tasks
            <a href="#" hx-get="/dashboard/page/tasks" hx-target="#main" hx-push-url="true" class="link">View all →</a>
          </div>
          <div class="panel-body">${raw(upcomingHtml)}</div>
        </div>
        <div class="panel">
          <div class="panel-header">Stats</div>
          <div class="panel-body stats">
            <div class="stat">
              <div class="stat-value">${spaces.length}</div>
              <div class="stat-label">Spaces</div>
            </div>
            <div class="stat">
              <div class="stat-value">${core.queue.pendingCount}</div>
              <div class="stat-label">Queued</div>
            </div>
            <div class="stat">
              <div class="stat-value">${formatUptime(uptimeSeconds)}</div>
              <div class="stat-label">Uptime</div>
            </div>
          </div>
        </div>
      </div>

      ${raw(renderExtensionWidgets())}
    `);
  });

  app.get("/page/spaces", (c) => {
    const spaces = core.db
      .listSpaces()
      .map((s) => {
        const conversations = core.db.getSpaceConversations(s.id);
        const msgCount = core.db.getRecentMessages(s.id, 1000).length;
        return {
          id: s.id,
          name: s.name,
          tags: s.tags,
          conversationCount: conversations.length,
          platforms: [...new Set(conversations.map((conv) => conv.platform))],
          lastActivity: s.updatedAt,
          messageCount: msgCount,
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);

    const rowsHtml =
      spaces.length > 0
        ? spaces
            .map(
              (s) => `
              <tr class="clickable" 
                  hx-get="/dashboard/page/spaces/${encodeURIComponent(s.id)}" 
                  hx-target="#main" 
                  hx-push-url="true">
                <td class="mono">${escapeHtml(s.name)}</td>
                <td>${s.platforms.map((p) => `<span class="badge">${escapeHtml(p)}</span>`).join(" ") || '<span class="muted">—</span>'}</td>
                <td class="muted">${s.conversationCount}</td>
                <td class="muted">${s.messageCount}</td>
                <td class="muted">${formatRelativeTime(s.lastActivity)}</td>
              </tr>
            `,
            )
            .join("")
        : '<tr><td colspan="5" class="empty">No spaces yet</td></tr>';

    return c.html(html`
      <div class="page-header">
        <h2>Spaces</h2>
        <div class="search-box">
          <input type="text" placeholder="Search spaces..." id="space-search"
                 onkeyup="filterTable(this, 'spaces-table')" />
        </div>
      </div>

      <div class="panel">
        <table class="table" id="spaces-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Platforms</th>
              <th>Conversations</th>
              <th>Messages</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>${raw(rowsHtml)}</tbody>
        </table>
      </div>
    `);
  });

  app.get("/page/spaces/:id", (c) => {
    const spaceId = decodeURIComponent(c.req.param("id"));
    const group = core.db.listSpaces().find((g) => g.id === spaceId);

    if (!group) {
      return c.html(html`
        <div class="page-header">
          <a href="#" hx-get="/dashboard/page/spaces" hx-target="#main" hx-push-url="true" class="back">← Back</a>
          <h2>Space not found</h2>
        </div>
        <div class="panel">
          <div class="panel-body empty">Space "${escapeHtml(spaceId)}" not found</div>
        </div>
      `);
    }

    const linkedConversations = core.db.getSpaceConversations(spaceId);
    const messages = core.db.getRecentMessages(spaceId, 50);
    const roles = core.db.listRoles(spaceId);
    const tasks = core.db.listTasks().filter((t) => t.spaceId === spaceId);
    const configEntries = core.db.listSpaceConfig(spaceId);

    const messagesHtml =
      messages.length > 0
        ? messages
            .map(
              (m) => `
              <div class="message ${m.role}">
                <div class="message-meta">
                  <span class="role ${m.role}">${m.role}</span>
                  <span class="time">${formatRelativeTime(m.createdAt)}</span>
                </div>
                <div class="message-content">${escapeHtml(m.content)}</div>
              </div>
            `,
            )
            .join("")
        : '<div class="empty-small">No messages yet</div>';

    const linkedConversationsHtml =
      linkedConversations.length > 0
        ? linkedConversations
            .map(
              (conv) => `
              <div class="role-row">
                <span><span class="badge">${escapeHtml(conv.platform)}</span> ${escapeHtml(conv.observedTitle || conv.externalId)}</span>
                <span class="badge">${escapeHtml(conv.kind)}</span>
                <button class="btn btn-sm btn-danger" 
                        hx-post="/dashboard/api/conversations/${conv.id}/unlink"
                        hx-swap="none"
                        hx-confirm="Unlink this conversation from ${escapeHtml(group.name)}?">Unlink</button>
              </div>
            `,
            )
            .join("")
        : '<div class="empty-small">No linked conversations</div>';

    const rolesHtml =
      roles.length > 0
        ? roles
            .map(
              (r) => `
              <div class="role-row">
                <span class="mono">${escapeHtml(r.platformUserId)}</span>
                <span class="badge ${r.role === "admin" ? "green" : ""}">${r.role}</span>
                <button class="btn btn-sm btn-danger" 
                        hx-delete="/dashboard/api/roles?spaceId=${encodeURIComponent(spaceId)}&platformUserId=${encodeURIComponent(r.platformUserId)}"
                        hx-swap="none"
                        hx-confirm="Remove role for ${escapeHtml(r.platformUserId)}?">✕</button>
              </div>
            `,
            )
            .join("")
        : '<div class="empty-small">No roles assigned</div>';

    const tasksHtml =
      tasks.length > 0
        ? tasks
            .map(
              (t) => `
              <div class="task-row">
                <span class="mono">#${t.id}</span>
                <span>${escapeHtml(truncate(t.prompt, 30))}</span>
                <span class="badge ${t.active ? "green" : ""}">${t.active ? "active" : "paused"}</span>
              </div>
            `,
            )
            .join("")
        : '<div class="empty-small">No tasks for this space</div>';

    const configHtml =
      configEntries.length > 0
        ? configEntries
            .map(
              (entry) => `
              <div class="task-row">
                <span class="mono">${escapeHtml(entry.key)}</span>
                <span>${escapeHtml(entry.value)}</span>
              </div>
            `,
            )
            .join("")
        : '<div class="empty-small">No config overrides</div>';

    return c.html(html`
      <div class="page-header">
        <a href="#" hx-get="/dashboard/page/spaces" hx-target="#main" hx-push-url="true" class="back">← Back</a>
        <h2>${escapeHtml(group.name)}</h2>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-header">Linked Conversations</div>
          <div class="panel-body">${raw(linkedConversationsHtml)}</div>
        </div>
        <div class="panel">
          <div class="panel-header">Roles</div>
          <div class="panel-body">${raw(rolesHtml)}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-header">Tasks</div>
          <div class="panel-body">${raw(tasksHtml)}</div>
        </div>
        <div class="panel">
          <div class="panel-header">Config</div>
          <div class="panel-body">${raw(configHtml)}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">Recent Messages</div>
        <div class="panel-body messages-list">${raw(messagesHtml)}</div>
      </div>
    `);
  });

  app.get("/page/conversations", (c) => {
    const spaces = core.db.listSpaces();
    const conversations = core.db.listConversations();

    const rowsHtml =
      conversations.length > 0
        ? conversations
            .map((conv) => {
              const title = conv.observedTitle || conv.externalId;
              const linked = conv.spaceId
                ? `<span class="badge green">${escapeHtml(conv.spaceId)}</span>`
                : `
                  <form hx-post="/dashboard/api/conversations/${conv.id}/link" hx-swap="none" style="display:flex; gap:8px; align-items:center;">
                    <select name="spaceId" class="select">
                      ${spaces
                        .map(
                          (space) =>
                            `<option value="${escapeHtml(space.id)}">${escapeHtml(space.name)}</option>`,
                        )
                        .join("")}
                    </select>
                    <button class="btn btn-sm">Link</button>
                  </form>
                `;
              const action = conv.spaceId
                ? `<button class="btn btn-sm btn-danger" hx-post="/dashboard/api/conversations/${conv.id}/unlink" hx-swap="none">Unlink</button>`
                : "";

              return `
                <tr>
                  <td><span class="badge">${escapeHtml(conv.platform)}</span></td>
                  <td>${escapeHtml(title)}</td>
                  <td><span class="badge">${escapeHtml(conv.kind)}</span></td>
                  <td>${linked}</td>
                  <td class="muted">${formatRelativeTime(conv.lastSeenAt)}</td>
                  <td>${action}</td>
                </tr>
              `;
            })
            .join("")
        : '<tr><td colspan="6" class="empty">No conversations yet</td></tr>';

    return c.html(html`
      <div class="page-header">
        <h2>Conversations</h2>
      </div>
      <div class="panel">
        <table class="table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Title</th>
              <th>Kind</th>
              <th>Linked Space</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${raw(rowsHtml)}</tbody>
        </table>
      </div>
    `);
  });

  app.get("/page/tasks", (c) => {
    const tasks = core.db.listTasks();

    const rowsHtml =
      tasks.length > 0
        ? tasks
            .map(
              (t) => `
              <tr>
                <td class="mono">#${t.id}</td>
                <td class="mono">${escapeHtml(t.cron || "one-shot")}</td>
                <td class="truncate" title="${escapeHtml(t.prompt)}">${escapeHtml(truncate(t.prompt, 40))}</td>
                <td class="muted">${formatFutureTime(t.nextRunAt)}</td>
                <td><span class="badge ${t.active ? "green" : ""}">${t.active ? "active" : "paused"}</span></td>
                <td class="actions">
                  <button class="btn btn-sm" hx-post="/dashboard/api/tasks/${t.id}/run" hx-swap="none" title="Run now">▶</button>
                  ${
                    t.active
                      ? `<button class="btn btn-sm" hx-post="/dashboard/api/tasks/${t.id}/pause" hx-swap="none" title="Pause">⏸</button>`
                      : `<button class="btn btn-sm" hx-post="/dashboard/api/tasks/${t.id}/resume" hx-swap="none" title="Resume">▶️</button>`
                  }
                  <button class="btn btn-sm btn-danger" hx-delete="/dashboard/api/tasks/${t.id}" hx-swap="none" hx-confirm="Delete task #${t.id}?" title="Delete">✕</button>
                </td>
              </tr>
            `,
            )
            .join("")
        : '<tr><td colspan="6" class="empty">No scheduled tasks</td></tr>';

    return c.html(html`
      <div class="page-header">
        <h2>Scheduled Tasks</h2>
      </div>

      <div class="panel">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Schedule</th>
              <th>Prompt</th>
              <th>Next Run</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${raw(rowsHtml)}</tbody>
        </table>
      </div>
    `);
  });

  app.get("/page/permissions", (c) => {
    const groups = core.db.listSpaces();
    const allRoles: Array<{
      spaceId: string;
      platform: string;
      userId: string;
      role: string;
    }> = [];

    for (const g of groups) {
      const platform = g.id.split(":")[0];
      const groupRoles = core.db.listRoles(g.id);
      for (const r of groupRoles) {
        allRoles.push({
          spaceId: g.id,
          platform,
          userId: r.platformUserId,
          role: r.role,
        });
      }
    }

    const rowsHtml =
      allRoles.length > 0
        ? allRoles
            .map(
              (r) => `
              <tr>
                <td><span class="badge">${r.platform}</span></td>
                <td class="mono truncate" title="${escapeHtml(r.spaceId)}">${escapeHtml(truncate(r.spaceId, 25))}</td>
                <td class="mono">${escapeHtml(r.userId)}</td>
                <td><span class="badge ${r.role === "admin" ? "green" : ""}">${r.role}</span></td>
                <td>
                  <button class="btn btn-sm btn-danger" 
                          hx-delete="/dashboard/api/roles?spaceId=${encodeURIComponent(r.spaceId)}&platformUserId=${encodeURIComponent(r.userId)}"
                          hx-swap="none"
                          hx-confirm="Remove ${r.role} role for ${escapeHtml(r.userId)}?">✕</button>
                </td>
              </tr>
            `,
            )
            .join("")
        : '<tr><td colspan="5" class="empty">No roles assigned</td></tr>';

    return c.html(html`
      <div class="page-header">
        <h2>Permissions</h2>
      </div>

      <div class="panel">
        <table class="table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Space</th>
              <th>User</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${raw(rowsHtml)}</tbody>
        </table>
      </div>
    `);
  });

  app.get("/page/logs", (c) => {
    // Aggregate recent messages as "logs" for now
    // In a real system, you'd have a proper log store
    const groups = core.db.listSpaces();
    const logs: Array<{
      time: number;
      level: string;
      source: string;
      message: string;
      spaceId?: string;
    }> = [];

    // Add message events as logs
    for (const g of groups) {
      const msgs = core.db.getRecentMessages(g.id, 10);
      const platform = g.id.split(":")[0];
      for (const m of msgs) {
        logs.push({
          time: m.createdAt,
          level: "INFO",
          source: platform,
          message: `${m.role}: ${m.content.slice(0, 80)}`,
          spaceId: g.id,
        });
      }
    }

    logs.sort((a, b) => b.time - a.time);

    const logsHtml =
      logs.length > 0
        ? logs
            .slice(0, 50)
            .map(
              (l) => `
              <div class="log-row ${l.level.toLowerCase()}">
                <span class="time">${new Date(l.time).toLocaleTimeString()}</span>
                <span class="level ${l.level.toLowerCase()}">${l.level}</span>
                <span class="source">${l.source}</span>
                <span class="message">${escapeHtml(l.message)}</span>
              </div>
            `,
            )
            .join("")
        : '<div class="empty">No logs available</div>';

    return c.html(html`
      <div class="page-header">
        <h2>Logs</h2>
        <div class="filters">
          <select class="select" onchange="filterLogs(this)">
            <option value="all">All levels</option>
            <option value="error">Errors only</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      <div class="panel">
        <div class="panel-body logs-list">${raw(logsHtml)}</div>
      </div>
    `);
  });

  // ─── SSE Stream ─────────────────────────────────────────────────────────

  app.get("/events", (c) => {
    return streamSSE(c, async (stream) => {
      const sendEvent = async (event: string, data: string) => {
        await stream.writeSSE({ event, data: data.replace(/\n/g, "") });
      };

      const renderHealth = () => {
        const health = getSystemHealth();
        const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
        const icon =
          health.status === "healthy"
            ? "🟢"
            : health.status === "degraded"
              ? "🟡"
              : "🔴";
        const lastError = health.lastError
          ? `Last error: ${health.lastError}`
          : "";

        return `
          <div class="health-status ${health.status}">
            <span class="health-icon">${icon}</span>
            <span class="health-message">${health.message}</span>
          </div>
          <div class="health-meta">
            <span class="uptime">up ${formatUptime(uptimeSeconds)}</span>
            ${lastError ? `<span class="last-error">${lastError}</span>` : ""}
          </div>
        `;
      };

      const renderActiveCount = () => {
        const count = core.containerRunner.activeCount;
        return count > 0
          ? `<span class="badge pulse">${count} running</span>`
          : "";
      };

      // Send initial state
      await sendEvent("health", renderHealth());
      await sendEvent("active-count", renderActiveCount());

      // Update loop
      let running = true;
      let lastActiveCount = core.containerRunner.activeCount;

      stream.onAbort(() => {
        running = false;
      });

      while (running) {
        await stream.sleep(1000);

        // Always update health (includes uptime)
        await sendEvent("health", renderHealth());

        // Update active count only on change
        const currentActiveCount = core.containerRunner.activeCount;
        if (currentActiveCount !== lastActiveCount) {
          await sendEvent("active-count", renderActiveCount());
          lastActiveCount = currentActiveCount;
        }
      }
    });
  });

  // ─── Dashboard Actions (no auth required, admin-only UI) ────────────────

  app.post("/api/tasks/:id/run", async (c) => {
    const taskId = Number.parseInt(c.req.param("id"), 10);
    const task = core.db.listTasks().find((t) => t.id === taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const triggered = await core.scheduler.triggerTask(taskId);
    if (!triggered) {
      return c.json({ error: "Task not found or inactive" }, 400);
    }

    return c.json({ ok: true });
  });

  app.post("/api/tasks/:id/pause", (c) => {
    const taskId = Number.parseInt(c.req.param("id"), 10);
    const task = core.db.listTasks().find((t) => t.id === taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    core.db.setTaskActive(taskId, false);
    return c.json({ ok: true });
  });

  app.post("/api/tasks/:id/resume", (c) => {
    const taskId = Number.parseInt(c.req.param("id"), 10);
    const task = core.db.listTasks().find((t) => t.id === taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    core.db.setTaskActive(taskId, true);
    return c.json({ ok: true });
  });

  app.delete("/api/tasks/:id", (c) => {
    const taskId = Number.parseInt(c.req.param("id"), 10);
    const task = core.db.listTasks().find((t) => t.id === taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const deleted = core.db.deleteTask(taskId, task.spaceId);
    if (!deleted) {
      return c.json({ error: "Failed to delete task" }, 500);
    }

    return c.json({ ok: true });
  });

  app.delete("/api/roles", (c) => {
    const spaceId = c.req.query("spaceId");
    const platformUserId = c.req.query("platformUserId");

    if (!spaceId || !platformUserId) {
      return c.json({ error: "Missing spaceId or platformUserId" }, 400);
    }

    core.db.deleteRole(spaceId, platformUserId);
    return c.json({ ok: true });
  });

  app.post("/api/conversations/:id/link", async (c) => {
    const conversationId = Number.parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(conversationId) || conversationId < 1) {
      return c.json({ error: "Invalid conversation ID" }, 400);
    }

    const form = await c.req.parseBody();
    const spaceId = typeof form.spaceId === "string" ? form.spaceId : undefined;
    if (!spaceId) {
      return c.json({ error: "Missing spaceId" }, 400);
    }

    const space = core.db.getSpace(spaceId);
    if (!space) {
      return c.json({ error: "Space not found" }, 404);
    }

    const linked = core.db.linkConversation(conversationId, spaceId);
    if (!linked) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    return c.json({ ok: true });
  });

  app.post("/api/conversations/:id/unlink", (c) => {
    const conversationId = Number.parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(conversationId) || conversationId < 1) {
      return c.json({ error: "Invalid conversation ID" }, 400);
    }

    const unlinked = core.db.unlinkConversation(conversationId);
    if (!unlinked) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    return c.json({ ok: true });
  });

  app.post("/api/stop", (c) => {
    const spaceId = c.req.header("X-Mercury-Space");

    if (!spaceId) {
      return c.json({ error: "Missing X-Mercury-Space header" }, 400);
    }

    core.containerRunner.abort(spaceId);
    return c.json({ ok: true });
  });

  return app;
}
