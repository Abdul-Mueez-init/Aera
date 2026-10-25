import type { ErrorRequestHandler } from "express";
import { logger } from "./logger.js";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    /** Optional structured payload returned alongside the error (e.g. the
     * portal closed-state body with company contacts on 410 responses). */
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  void _next;
  const requestId = request.header("x-request-id") ?? "unknown";

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
      ...(error.data !== undefined ? { data: error.data } : {}),
      requestId,
    });
    return;
  }

  logger.error({ err: error, requestId }, "Unhandled request error");
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
    requestId,
  });
};
