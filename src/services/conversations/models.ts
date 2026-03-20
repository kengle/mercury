import { z } from "zod";

export const ConversationEntity = z.object({
  id: z.number(),
  platform: z.string(),
  externalId: z.string(),
  kind: z.string(),
  observedTitle: z.string().nullable(),
  paired: z.number(),
  firstSeenAt: z.number(),
  lastSeenAt: z.number(),
});
export type ConversationEntity = z.infer<typeof ConversationEntity>;

export const CreateConversation = z.object({
  platform: z.string().min(1),
  externalId: z.string().min(1),
  kind: z.string().min(1),
  observedTitle: z.string().optional(),
});
export type CreateConversation = z.infer<typeof CreateConversation>;

export const UpdateConversation = z.object({
  kind: z.string().optional(),
  observedTitle: z.string().nullable().optional(),
  paired: z.number().optional(),
});
export type UpdateConversation = z.infer<typeof UpdateConversation>;

export const DeleteConversation = z.object({
  id: z.number(),
});
export type DeleteConversation = z.infer<typeof DeleteConversation>;
