import type { AgentOutput } from "../types.js";
import type { AgentInput } from "./subprocess.js";

export interface Agent {
  run(input: AgentInput): Promise<AgentOutput>;
  abort(): boolean;
  kill(): void;
  readonly isRunning: boolean;
}
