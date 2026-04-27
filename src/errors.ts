export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class AuthenticationError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class TimeoutError extends Error {
  constructor(message = "Provider request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class FatalProviderError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "FatalProviderError";
  }
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error instanceof TimeoutError || error.name.endsWith("TimeoutError");
}
