import type { ConfigEntity } from "./models.js";

export interface ConfigService {
  get(workspaceId: number, key: string): string | null;
  list(workspaceId: number): ConfigEntity[];
  set(workspaceId: number, key: string, value: string, updatedBy: string): void;
  delete(workspaceId: number, key: string): boolean;
  validate(key: string, value: string): string | null;
  isValidKey(key: string): boolean;
}
