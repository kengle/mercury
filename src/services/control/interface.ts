import type {
  CompactResponse,
  NewSessionResponse,
  StopResponse,
  WhoamiResponse,
} from "./models.js";

export interface ControlService {
  whoami(callerId: string, role: string): WhoamiResponse;
  stop(): StopResponse;
  compact(
    workspaceId: number,
    workspaceName: string,
    conversationId: string,
  ): Promise<CompactResponse>;
  newSession(
    workspaceId: number,
    workspaceName: string,
    conversationId: string,
  ): NewSessionResponse;
}
