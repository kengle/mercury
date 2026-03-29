import type {
  ConversationEntity,
  CreateConversation,
  UpdateConversation,
} from "./models.js";

export interface ConversationService {
  get(platform: string, externalId: string): ConversationEntity | null;
  list(): ConversationEntity[];
  create(
    platform: string,
    externalId: string,
    kind: string,
    observedTitle?: string,
  ): ConversationEntity;
  update(id: number, input: UpdateConversation): boolean;
  delete(id: number): boolean;
  assignWorkspace(
    platform: string,
    externalId: string,
    workspaceId: number,
  ): boolean;
  unassignWorkspace(platform: string, externalId: string): boolean;
  getWorkspaceId(platform: string, externalId: string): number | null;
  isAssigned(platform: string, externalId: string): boolean;
}
