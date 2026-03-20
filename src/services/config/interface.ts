import type { ConfigEntity } from "./models.js";

export interface ConfigService {
  get(key: string): string | null;
  list(): ConfigEntity[];
  set(key: string, value: string, updatedBy: string): void;
  delete(key: string): boolean;
  validate(key: string, value: string): string | null;
  isValidKey(key: string): boolean;
}
