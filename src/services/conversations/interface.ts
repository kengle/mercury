import type { ConversationEntity, CreateConversation, UpdateConversation } from "./models.js";

export interface ConversationService {
  get(platform: string, externalId: string): ConversationEntity | null;
  list(): ConversationEntity[];
  create(platform: string, externalId: string, kind: string, observedTitle?: string): ConversationEntity;
  update(id: number, input: UpdateConversation): boolean;
  delete(id: number): boolean;
  pair(platform: string, externalId: string): boolean;
  unpair(platform: string, externalId: string): boolean;
  isPaired(platform: string, externalId: string): boolean;
  getPairingCode(): string;
  regeneratePairingCode(): string;
}
