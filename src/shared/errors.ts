export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, "UNAUTHORIZED", 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, "FORBIDDEN", 403, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, "NOT_FOUND", 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation error", details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, "CONFLICT", 409, details);
  }
}

export class TelegramDeliveryError extends AppError {
  constructor(
    message: string,
    public readonly chatId: number,
    public readonly retryAfterSeconds?: number,
    details?: unknown,
  ) {
    super(message, "TELEGRAM_DELIVERY_ERROR", 502, details);
  }
}

export class SchedulerError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "SCHEDULER_ERROR", 500, details);
  }
}
