import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { corsOrigin, env } from "./config/env";
import { requestLogger } from "./middleware/request-logger";
import { notFoundHandler } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";
import healthRoutes from "./modules/health/health.routes";
import apiRoutes from "./routes";

/**
 * Builds the Express application: security, parsing and logging middleware,
 * routes, then the 404 and centralized error handlers (which must come last).
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // This service only ever returns JSON, so lock the browser down hard: nothing
  // should be loadable from API responses and the API must never be framed.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'none'"],
          "form-action": ["'none'"],
        },
      },
    }),
  );
  // Disable powerful browser features for any document served from this origin.
  app.use((_req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    next();
  });
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(requestLogger);

  // Health checks live at the root (outside the versioned API prefix).
  app.use("/health", healthRoutes);
  // Versioned business API.
  app.use(env.API_PREFIX, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
