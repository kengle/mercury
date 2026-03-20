import type { CreateTask, TaskEntity } from "./models.js";

export type TaskHandler = (task: {
  id: number;
  prompt: string;
  createdBy: string;
  conversationId: string;
  silent: boolean;
}) => Promise<void>;

export interface TaskService {
  get(id: number): TaskEntity | null;
  list(): TaskEntity[];
  listDue(now?: number): TaskEntity[];
  create(input: CreateTask): { id: number; nextRunAt: number };
  pause(id: number): TaskEntity;
  resume(id: number): TaskEntity;
  delete(id: number): boolean;
  updateNextRun(id: number, nextRunAt: number): void;
  startScheduler(handler: TaskHandler): void;
  stopScheduler(): void;
  triggerTask(id: number): Promise<boolean>;
  computeNextRun(cron: string): number;
}
