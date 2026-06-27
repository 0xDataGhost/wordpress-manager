import { pino } from "pino";
import { env, isProduction } from "../config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.apiKey",
      "*.secret",
      // Connector key material — last-line defense against accidental logging.
      "*.plaintext",
      "*.apiKeyHash",
      "*.apiKeyCipher",
      "*.apiKeyIv",
      "*.apiKeyTag",
      // Digital code and customer token HMAC fingerprints — defense-in-depth so
      // that accidentally logging a DB row never exposes these keyed hashes.
      "*.codeHash",
      "*.tokenHash",
      "*.code",
    ],
    censor: "[REDACTED]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
});

export type Logger = typeof logger;
