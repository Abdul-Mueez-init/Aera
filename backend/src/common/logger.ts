import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.set-cookie",
      "req.headers.x-api-key",
      "req.headers.x-goog-api-key",
      "res.headers.set-cookie",
      "req.body.password",
      "req.body.token",
      "req.body.sessionToken",
      "req.body.linkToken",
      "req.body.shareToken",
    ],
    remove: true,
  },
});
