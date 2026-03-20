import type { IngressMessage } from "../../core/types.js";

export type PolicyResult =
  | { action: "process"; prompt: string; callerId: string; role: string }
  | { action: "deny"; reason: string }
  | { action: "ignore" };

export interface PolicyService {
  evaluate(message: IngressMessage): PolicyResult;
}
