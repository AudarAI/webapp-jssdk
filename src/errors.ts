export class AiVoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiVoxError";
  }
}

export class AuthenticationError extends AiVoxError {
  constructor(message = "Authentication failed") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class InsufficientBalanceError extends AiVoxError {
  constructor(message = "Insufficient balance") {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

export class RateLimitedError extends AiVoxError {
  readonly retryAfter?: number;

  constructor(message = "Rate limit exceeded", retryAfter?: number) {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfter = retryAfter;
  }
}

export class ApiError extends AiVoxError {
  readonly statusCode: number;
  readonly code: number;

  constructor(message: string, statusCode: number, code: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
