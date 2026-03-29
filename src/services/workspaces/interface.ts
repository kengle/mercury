import type { WorkspaceEntity } from "./models.js";

export interface WorkspaceService {
  create(name: string): WorkspaceEntity;
  list(): WorkspaceEntity[];
  get(name: string): WorkspaceEntity | null;
  getById(id: number): WorkspaceEntity | null;
  delete(name: string): boolean;
  getConversationCount(workspaceId: number): number;
  /** Find workspace by its pairing code (stored in workspace-scoped config as _pairing_code) */
  findByPairingCode(code: string): WorkspaceEntity | null;
  /** Get or generate pairing code for a workspace */
  getPairingCode(workspaceId: number): string;
  /** Regenerate pairing code for a workspace */
  regeneratePairingCode(workspaceId: number): string;
}
