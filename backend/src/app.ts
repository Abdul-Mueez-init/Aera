import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './common/errors.js';
import { logger } from './common/logger.js';

export function buildApp( ) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use((request, response, next) => {
    const requestId = request.header('x-request-id') ?? randomUUID();
    const startedAt = Date.now();

    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      logger.info(
        {
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          responseTimeMs: Date.now() - startedAt,
        },
        'Request completed',
      );
    });

    next();
  });

  app.get('/health', (_request, response) => {
    response.status(200).json({
      data: {
        status: 'ok',
        service: 'aera-api',
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  app.use(errorHandler);
  return app;
}
