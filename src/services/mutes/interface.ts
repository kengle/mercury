import type { CreateMute, MuteEntity } from "./models.js";

export interface MuteService {
  get(userId: string): MuteEntity | null;
  list(): MuteEntity[];
  create(input: CreateMute, mutedBy: string): { warning?: string } | MuteEntity;
  delete(userId: string): boolean;
  isMuted(userId: string): boolean;
  purgeExpired(): number;
}
