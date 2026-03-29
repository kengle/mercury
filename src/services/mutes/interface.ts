import type { CreateMute, MuteEntity } from "./models.js";

export interface MuteService {
  get(workspaceId: number, userId: string): MuteEntity | null;
  list(workspaceId: number): MuteEntity[];
  create(
    workspaceId: number,
    input: CreateMute,
    mutedBy: string,
  ): { warning?: string } | MuteEntity;
  delete(workspaceId: number, userId: string): boolean;
  isMuted(workspaceId: number, userId: string): boolean;
  purgeExpired(): number;
}
