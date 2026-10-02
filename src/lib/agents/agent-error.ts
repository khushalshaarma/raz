export class AgentError extends Error {
  constructor(
    public readonly agentType: string,
    public readonly errorCode: string,
    message: string,
    public readonly recoverable: boolean = false
  ) {
    super(`[${agentType}] ${errorCode}: ${message}`);
    this.name = "AgentError";
  }
}

export class AgentValidationError extends AgentError {
  constructor(agentType: string, errors: string[]) {
    super(agentType, "VALIDATION_FAILED", `Validation failed: ${errors.join(", ")}`, true);
    this.name = "AgentValidationError";
  }
}

export class AgentTimeoutError extends AgentError {
  constructor(agentType: string, timeoutMs: number) {
    super(agentType, "TIMEOUT", `Agent timed out after ${timeoutMs}ms`, true);
    this.name = "AgentTimeoutError";
  }
}

export class AgentDependencyError extends AgentError {
  constructor(agentType: string, dependency: string) {
    super(agentType, "DEPENDENCY_FAILED", `Required dependency ${dependency} failed`, false);
    this.name = "AgentDependencyError";
  }
}

export class AgentSecurityError extends AgentError {
  constructor(agentType: string, message: string) {
    super(agentType, "SECURITY_VIOLATION", message, false);
    this.name = "AgentSecurityError";
  }
}

export function isCriticalAgentError(error: unknown): boolean {
  if (error instanceof AgentError) {
    return !error.recoverable;
  }
  return true;
}
