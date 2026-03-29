export type AgentFailureReason = "timeout" | "aborted" | "error";

export class AgentError extends Error {
  readonly reason: AgentFailureReason;
  readonly exitCode: number | null;

  constructor(
    reason: AgentFailureReason,
    exitCode: number | null,
    message: string,
  ) {
    super(message);
    this.name = "AgentError";
    this.reason = reason;
    this.exitCode = exitCode;
  }

  static timeout(): AgentError {
    return new AgentError("timeout", null, "Agent timed out");
  }

  static aborted(): AgentError {
    return new AgentError("aborted", null, "Agent aborted");
  }

  static error(exitCode: number, output: string): AgentError {
    return new AgentError(
      "error",
      exitCode,
      `Agent failed (exit code ${exitCode}): ${output.slice(0, 500)}`,
    );
  }
}
