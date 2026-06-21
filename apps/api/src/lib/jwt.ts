import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "./errors";

export interface AccessTokenClaims {
  userId: string;
  storeId: string;
}

export interface RefreshTokenClaims {
  userId: string;
  storeId: string;
  /** Token id; matches the refresh_tokens row used for rotation/revocation. */
  jti: string;
}

const ACCESS_EXPIRES = env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"];
const REFRESH_EXPIRES = env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"];

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(
    { storeId: claims.storeId, type: "access" },
    env.JWT_ACCESS_SECRET,
    { subject: claims.userId, expiresIn: ACCESS_EXPIRES },
  );
}

export function signRefreshToken(claims: RefreshTokenClaims): string {
  return jwt.sign(
    { storeId: claims.storeId, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    { subject: claims.userId, jwtid: claims.jti, expiresIn: REFRESH_EXPIRES },
  );
}

/** Reads the `exp` claim of a freshly signed token as a Date. */
export function decodeExpiry(token: string): Date {
  const decoded = jwt.decode(token);
  if (
    decoded &&
    typeof decoded === "object" &&
    typeof decoded.exp === "number"
  ) {
    return new Date(decoded.exp * 1000);
  }
  throw new Error("Token is missing an expiry claim");
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = verify(token, env.JWT_ACCESS_SECRET, "access");
  return { userId: payload.sub, storeId: payload.storeId };
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  const payload = verify(token, env.JWT_REFRESH_SECRET, "refresh");
  if (!payload.jti) {
    throw new UnauthorizedError("Invalid refresh token");
  }
  return { userId: payload.sub, storeId: payload.storeId, jti: payload.jti };
}

interface VerifiedPayload {
  sub: string;
  storeId: string;
  jti?: string;
}

function verify(
  token: string,
  secret: string,
  expectedType: "access" | "refresh",
): VerifiedPayload {
  let decoded: unknown;
  try {
    // Pin the algorithm so a token forged with a different alg (notably the
    // "none" alg or an RS/HS confusion attack) cannot pass verification.
    decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    (decoded as { type?: unknown }).type !== expectedType
  ) {
    throw new UnauthorizedError("Invalid token");
  }

  const claims = decoded as {
    sub?: unknown;
    storeId?: unknown;
    jti?: unknown;
  };

  if (typeof claims.sub !== "string" || typeof claims.storeId !== "string") {
    throw new UnauthorizedError("Invalid token");
  }

  return {
    sub: claims.sub,
    storeId: claims.storeId,
    jti: typeof claims.jti === "string" ? claims.jti : undefined,
  };
}
