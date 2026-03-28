import type { Database } from "bun:sqlite";
import { CronExpressionParser } from "cron-parser";
import { logger } from "../../core/logger.js";
import type { MuteService } from "../mutes/interface.js";
import type { TaskHandler, TaskService } from "./interface.js";
import type { CreateTask, TaskEntity } from "./models.js";

const COLUMNS = `id, cron, at, prompt, active, silent,
  next_run_at as nextRunAt, created_by as createdBy,
  conversation_id as conversationId, workspace_id as workspaceId,
  created_at as createdAt, updated_at as updatedAt`;

type TaskRow = {
  id: number;
  cron: string | null;
  at: string | null;
  prompt: string;
  active: number;
  silent: number;
  nextRunAt: number;
  createdBy: string;
  conversationId: string;
  workspaceId: number;
  createdAt: number;
  updatedAt: number;
};

function toEntity(row: TaskRow): TaskEntity {
  return { ...row, active: row.active === 1, silent: row.silent === 1 };
}

export function createTaskService(
  db: Database,
  mutes: MuteService,
  pollIntervalMs = 5_000,
): TaskService {
  const insert = db.prepare<
    void,
    [
      number,
      string | null,
      string | null,
      string,
      number,
      number,
      string,
      string,
      number,
      number,
    ]
  >(
    `INSERT INTO tasks(workspace_id, cron, at, prompt, active, silent, next_run_at, created_by, conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
  );
  const lastId = db.prepare<{ id: number }, []>(
    "SELECT last_insert_rowid() as id",
  );
  const selectAll = db.prepare<TaskRow, [number]>(
    `SELECT ${COLUMNS} FROM tasks WHERE workspace_id = ? ORDER BY id ASC`,
  );
  const selectDue = db.prepare<TaskRow, [number]>(
    `SELECT ${COLUMNS} FROM tasks WHERE active = 1 AND next_run_at <= ? ORDER BY next_run_at ASC`,
  );
  const selectById = db.prepare<TaskRow, [number]>(
    `SELECT ${COLUMNS} FROM tasks WHERE id = ?`,
  );
  const stmtUpdateNextRun = db.prepare<void, [number, number, number]>(
    "UPDATE tasks SET next_run_at = ?, updated_at = ? WHERE id = ?",
  );
  const stmtSetActive = db.prepare<void, [number, number, number]>(
    "UPDATE tasks SET active = ?, updated_at = ? WHERE id = ?",
  );
  const deleteById = db.prepare<void, [number]>(
    "DELETE FROM tasks WHERE id = ?",
  );

  let timer: NodeJS.Timeout | null = null;
  let activeHandler: TaskHandler | null = null;

  function getOrThrow(id: number): TaskRow {
    const row = selectById.get(id);
    if (!row) throw new Error("Task not found");
    return row;
  }

  function computeNextRun(cron: string, from = new Date()): number {
    const interval = CronExpressionParser.parse(cron, { currentDate: from });
    return interval.next().getTime();
  }

  return {
    get(id) {
      const row = selectById.get(id);
      return row ? toEntity(row) : null;
    },
    list(workspaceId) {
      return selectAll.all(workspaceId).map(toEntity);
    },
    listDue(now = Date.now()) {
      return selectDue.all(now).map(toEntity);
    },
    create(workspaceId, input) {
      const {
        prompt,
        silent,
        createdBy = "system",
        conversationId = "",
      } = input;

      if (!input.cron && !input.at) throw new Error("Missing cron or at");
      if (input.cron && input.at)
        throw new Error("Cannot specify both cron and at");

      let nextRunAt: number;
      let cron: string | null = null;
      let at: string | null = null;

      if (input.cron) {
        try {
          nextRunAt = computeNextRun(input.cron);
          cron = input.cron;
        } catch {
          throw new Error("Invalid cron expression");
        }
      } else {
        const atTime = new Date(input.at as string).getTime();
        if (Number.isNaN(atTime)) throw new Error("Invalid at timestamp");
        if (atTime <= Date.now())
          throw new Error("at timestamp must be in the future");
        nextRunAt = atTime;
        at = input.at as string;
      }

      const now = Date.now();
      insert.run(
        workspaceId,
        cron,
        at,
        prompt,
        silent ? 1 : 0,
        nextRunAt,
        createdBy,
        conversationId,
        now,
        now,
      );
      const row = lastId.get();
      if (!row) throw new Error("Failed to read task id");
      return { id: Number(row.id), nextRunAt };
    },
    pause(id) {
      getOrThrow(id);
      stmtSetActive.run(0, Date.now(), id);
      return toEntity(getOrThrow(id));
    },
    resume(id) {
      getOrThrow(id);
      stmtSetActive.run(1, Date.now(), id);
      return toEntity(getOrThrow(id));
    },
    updateNextRun(id, nextRunAt) {
      stmtUpdateNextRun.run(nextRunAt, Date.now(), id);
    },
    delete(id) {
      return deleteById.run(id).changes > 0;
    },
    computeNextRun,

    startScheduler(handler) {
      if (timer) return;
      activeHandler = handler;

      const tick = async () => {
        try {
          mutes.purgeExpired();
          const due = selectDue.all(Date.now()).map(toEntity);
          for (const task of due) {
            if (task.cron) {
              const next = computeNextRun(task.cron);
              stmtUpdateNextRun.run(next, Date.now(), task.id);
            }

            try {
              await handler({
                id: task.id,
                prompt: task.prompt,
                createdBy: task.createdBy,
                conversationId: task.conversationId,
                workspaceId: task.workspaceId,
                silent: task.silent,
              });
            } catch (error) {
              logger.error("Scheduler task handler failed", {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }

            if (task.at) {
              deleteById.run(task.id);
              logger.info("One-shot task completed and deleted", {
                taskId: task.id,
              });
            }
          }
        } catch (error) {
          logger.error(
            "Scheduler error",
            error instanceof Error ? error : undefined,
          );
        } finally {
          timer = setTimeout(tick, pollIntervalMs);
        }
      };

      timer = setTimeout(tick, pollIntervalMs);
    },

    stopScheduler() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    },

    async triggerTask(id) {
      if (!activeHandler) return false;
      const row = selectById.get(id);
      if (!row || !row.active) return false;
      const task = toEntity(row);

      await activeHandler({
        id: task.id,
        prompt: task.prompt,
        createdBy: task.createdBy,
        conversationId: task.conversationId,
        workspaceId: task.workspaceId,
        silent: task.silent,
      });
      return true;
    },
  };
}
