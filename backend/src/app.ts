import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./common/errors.js";
import { logger } from "./common/logger.js";
import { prisma } from "./db/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { companyRouter } from "./modules/companies/company.routes.js";
import { customerRouter } from "./modules/customers/customer.routes.js";
import { jobRouter } from "./modules/jobs/job.routes.js";
import { schedulingRouter } from "./modules/scheduling/scheduling.routes.js";
import { quoteRouter } from "./modules/quotes/quote.routes.js";
import { invoiceRouter } from "./modules/invoices/invoice.routes.js";
import { portalRouter } from "./modules/portal/portal.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { aiRouter } from "./modules/ai/ai.routes.js";

export function buildApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use((request, response, next) => {
    const requestId = request.header("x-request-id") ?? randomUUID();
    const startedAt = Date.now();

    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
      logger.info(
        {
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          responseTimeMs: Date.now() - startedAt,
        },
        "Request completed",
      );
    });

    next();
  });

  const healthResponse = (
    _request: express.Request,
    response: express.Response,
  ) => {
    response.status(200).json({
      data: {
        status: "ok",
        service: "aera-api",
        timestamp: new Date().toISOString(),
      },
    });
  };

  const readinessResponse = async (
    _request: express.Request,
    response: express.Response,
  ) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.status(200).json({ data: { status: "ready" } });
    } catch (error) {
      logger.warn(
        {
          errorCode:
            error instanceof Error && "code" in error ? error.code : undefined,
        },
        "Database readiness check failed",
      );
      response.status(503).json({
        error: {
          code: "SERVICE_NOT_READY",
          message: "Database is not ready",
        },
      });
    }
  };

  app.get("/health", healthResponse);
  app.get("/api/v1/health", healthResponse);
  app.get("/api/v1/readiness", readinessResponse);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/companies", companyRouter);
  app.use("/api/v1/customers", customerRouter);
  app.use("/api/v1/jobs", jobRouter);
  app.use("/api/v1/schedule", schedulingRouter);
  app.use("/api/v1/quotes", quoteRouter);
  app.use("/api/v1/invoices", invoiceRouter);
  app.use("/api/v1/portal", portalRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/ai", aiRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  app.use(errorHandler);
  return app;
}
