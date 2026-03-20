import type { WhoamiResponse, StopResponse, CompactResponse, NewSessionResponse } from "./models.js";

export interface ControlService {
  whoami(callerId: string, role: string): WhoamiResponse;
  stop(): StopResponse;
  compact(conversationId: string): Promise<CompactResponse>;
  newSession(conversationId: string): NewSessionResponse;
}
