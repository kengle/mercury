import type { ChatRequest, ChatResponse } from "./models.js";

export interface ChatService {
  send(request: ChatRequest): Promise<ChatResponse>;
}
