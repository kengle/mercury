import type { UserEntity } from "./models.js";

export interface UserService {
  get(id: string): UserEntity | null;
  list(): UserEntity[];
  ensure(id: string, platform: string, displayName?: string): UserEntity;
  update(id: string, displayName: string | null): boolean;
  delete(id: string): boolean;
}
