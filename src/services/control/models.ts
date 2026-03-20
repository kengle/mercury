import { z } from "zod";

export const WhoamiResponse = z.object({
  callerId: z.string(),
  role: z.string(),
  permissions: z.array(z.string()),
});
export type WhoamiResponse = z.infer<typeof WhoamiResponse>;

export const StopResponse = z.object({
  stopped: z.boolean(),
  dropped: z.number(),
});
export type StopResponse = z.infer<typeof StopResponse>;

export const CompactResponse = z.object({
  boundary: z.number(),
  compaction: z.object({
    compacted: z.boolean().optional(),
    error: z.string().optional(),
  }),
});
export type CompactResponse = z.infer<typeof CompactResponse>;

export const NewSessionResponse = z.object({
  boundary: z.number(),
  reset: z.boolean(),
});
export type NewSessionResponse = z.infer<typeof NewSessionResponse>;
