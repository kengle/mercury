import { z } from "zod";

export const MessageRole = z.enum(["user", "assistant", "tool", "ambient"]);
export type MessageRole = z.infer<typeof MessageRole>;

export const MessageAttachment = z.object({
  path: z.string(),
  type: z.enum(["image", "video", "audio", "voice", "document"]),
  mimeType: z.string(),
  filename: z.string().optional(),
  sizeBytes: z.number().optional(),
});
export type MessageAttachment = z.infer<typeof MessageAttachment>;

export const MessageEntity = z.object({
  id: z.number(),
  role: MessageRole,
  content: z.string(),
  conversationId: z.string(),
  attachments: z.array(MessageAttachment).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type MessageEntity = z.infer<typeof MessageEntity>;

export const CreateMessage = z.object({
  role: MessageRole,
  content: z.string(),
  conversationId: z.string().default(""),
  attachments: z.array(MessageAttachment).optional(),
});
export type CreateMessage = z.infer<typeof CreateMessage>;

export const DeleteMessage = z.object({
  id: z.number(),
});
export type DeleteMessage = z.infer<typeof DeleteMessage>;
