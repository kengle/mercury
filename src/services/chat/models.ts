import { z } from "zod";

export const ChatFileInput = z.object({
  name: z.string().min(1),
  data: z.string().min(1),
});
export type ChatFileInput = z.infer<typeof ChatFileInput>;

export const ChatRequest = z.object({
  text: z.string().min(1),
  callerId: z.string().optional(),
  authorName: z.string().optional(),
  files: z.array(ChatFileInput).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatFileOutput = z.object({
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  data: z.string(),
});
export type ChatFileOutput = z.infer<typeof ChatFileOutput>;

export const ChatResponse = z.object({
  reply: z.string(),
  files: z.array(ChatFileOutput),
});
export type ChatResponse = z.infer<typeof ChatResponse>;
