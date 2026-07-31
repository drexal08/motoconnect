/** App error with HTTP status + optional user-facing message (plain English). */
export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errors = {
  badRequest: (message: string, code = 'BAD_REQUEST') => new AppError(400, code, message),
  unauthorized: (message = 'Please sign in to continue.', code = 'UNAUTHORIZED') =>
    new AppError(401, code, message),
  forbidden: (message: string, code = 'FORBIDDEN') => new AppError(403, code, message),
  notFound: (message = 'Not found.', code = 'NOT_FOUND') => new AppError(404, code, message),
  conflict: (message: string, code = 'CONFLICT') => new AppError(409, code, message),
  tooMany: (message: string, code = 'RATE_LIMITED') => new AppError(429, code, message),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
