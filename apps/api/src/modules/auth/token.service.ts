import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { refreshTokens } from "../../db/schema/refresh-tokens";
import { UnauthorizedError } from "../../lib/errors";
import {
  decodeExpiry,
  signRefreshToken,
  type RefreshTokenClaims,
} from "../../lib/jwt";

/** Issues a new refresh token and persists its row (id = jti) for rotation. */
export async function issueRefreshToken(
  userId: string,
  storeId: string,
): Promise<string> {
  const jti = randomUUID();
  const token = signRefreshToken({ userId, storeId, jti });
  const expiresAt = decodeExpiry(token);

  await db
    .insert(refreshTokens)
    .values({ id: jti, userId, storeId, expiresAt });

  return token;
}

export interface RotatedToken {
  refreshToken: string;
  userId: string;
  storeId: string;
}

/** Revokes every still-active refresh token for a user (breach response). */
async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
    );
}

/**
 * Rotates a refresh token: validates the presented token's row, revokes it, and
 * issues a successor. Detects reuse of an already-rotated token (possible theft)
 * and revokes all of the user's active tokens in that case.
 */
export async function rotateRefreshToken(
  claims: RefreshTokenClaims,
): Promise<RotatedToken> {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.id, claims.jti))
    .limit(1);

  if (!row || row.userId !== claims.userId) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  // Reuse of an already-revoked token signals possible theft: kill every active
  // token for the user. This runs as its own committed statement — it must NOT
  // be inside the transaction below, whose throw would roll the revocation back.
  if (row.revokedAt) {
    await revokeAllUserTokens(row.userId);
    throw new UnauthorizedError("Refresh token has already been used");
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError("Refresh token has expired");
  }

  const storeId = row.storeId ?? claims.storeId;
  const newJti = randomUUID();
  const refreshToken = signRefreshToken({
    userId: row.userId,
    storeId,
    jti: newJti,
  });
  const expiresAt = decodeExpiry(refreshToken);

  await db.transaction(async (tx) => {
    // Conditional revoke guards against a concurrent rotation of the same token:
    // only one request can flip revoked_at from NULL, the loser matches 0 rows.
    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedById: newJti })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });

    if (revoked.length === 0) {
      throw new UnauthorizedError("Refresh token has already been used");
    }

    await tx
      .insert(refreshTokens)
      .values({ id: newJti, userId: row.userId, storeId, expiresAt });
  });

  return { refreshToken, userId: row.userId, storeId };
}

/** Idempotently revokes a single refresh token by its jti. */
export async function revokeRefreshToken(jti: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, jti), isNull(refreshTokens.revokedAt)));
}
