import { z } from "zod";

export const IncomingMessage = z.object({
  platform: z.string(),
  externalId: z.string(),
  callerId: z.string(),
  authorName: z.string().optional(),
  text: z.string(),
  isDM: z.boolean(),
  isMention: z.boolean(),
  attachments: z
    .array(
      z.object({
        path: z.string(),
        type: z.enum(["image", "video", "audio", "voice", "document"]),
        mimeType: z.string(),
        filename: z.string().optional(),
        sizeBytes: z.number().optional(),
      }),
    )
    .default([]),
});
export type IncomingMessage = z.infer<typeof IncomingMessage>;
