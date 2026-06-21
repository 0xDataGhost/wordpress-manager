import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { storeUsers } from "../../db/schema/store-users";
import { stores, type StoreRow } from "../../db/schema/stores";
import { users, type UserRow } from "../../db/schema/users";
import { ConflictError, UnauthorizedError } from "../../lib/errors";
import { signAccessToken, verifyRefreshToken } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { loadPermissionKeys, loadRoleSlugs } from "../rbac/rbac.service";
import { createStoreWithOwner, getStoreById } from "../stores/stores.service";
import type { LoginInput, RegisterInput } from "./auth.schemas";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from "./token.service";

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  store: StoreRow;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface MeResult {
  user: PublicUser;
  store: StoreRow | null;
  roles: string[];
  permissions: string[];
}

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Picks the active store a user's session should be scoped to. */
async function resolveCurrentStore(userId: string): Promise<StoreRow | null> {
  const [row] = await db
    .select({ store: stores })
    .from(storeUsers)
    .innerJoin(stores, eq(stores.id, storeUsers.storeId))
    .where(and(eq(storeUsers.userId, userId), eq(storeUsers.isActive, true)))
    .orderBy(storeUsers.createdAt)
    .limit(1);

  return row?.store ?? null;
}

/**
 * Registers a new owner account: creates the user and their first store
 * atomically, assigns the owner role, then issues a token pair.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("Email is already registered");
  }

  const passwordHash = await hashPassword(input.password);

  const { user, store } = await db.transaction(async (tx) => {
    const [createdUser] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
      })
      .returning();

    if (!createdUser) {
      throw new Error("Failed to create user");
    }

    const createdStore = await createStoreWithOwner(tx, {
      name: input.storeName,
      ownerUserId: createdUser.id,
    });

    return { user: createdUser, store: createdStore };
  });

  const accessToken = signAccessToken({ userId: user.id, storeId: store.id });
  const refreshToken = await issueRefreshToken(user.id, store.id);

  return { user: toPublicUser(user), store, accessToken, refreshToken };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  // Same error whether the user is missing, disabled, or the password is wrong.
  if (!user || !user.isActive) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const store = await resolveCurrentStore(user.id);
  if (!store) {
    throw new UnauthorizedError("No active store for this account");
  }

  const accessToken = signAccessToken({ userId: user.id, storeId: store.id });
  const refreshToken = await issueRefreshToken(user.id, store.id);

  return { user: toPublicUser(user), store, accessToken, refreshToken };
}

/** Rotates the refresh token and mints a fresh access token. */
export async function refresh(refreshToken: string): Promise<TokenPair> {
  const claims = verifyRefreshToken(refreshToken);
  const rotated = await rotateRefreshToken(claims);

  const [user] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, rotated.userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new UnauthorizedError("Account is no longer active");
  }

  const accessToken = signAccessToken({
    userId: rotated.userId,
    storeId: rotated.storeId,
  });

  return { accessToken, refreshToken: rotated.refreshToken };
}

/** Best-effort logout: revokes the presented refresh token if it is valid. */
export async function logout(refreshToken: string): Promise<void> {
  try {
    const claims = verifyRefreshToken(refreshToken);
    await revokeRefreshToken(claims.jti);
  } catch {
    // An invalid/expired token has nothing to revoke; logout is idempotent.
  }
}

export async function getMe(
  userId: string,
  storeId: string,
): Promise<MeResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError();
  }

  const [store, roles, permissions] = await Promise.all([
    getStoreById(storeId),
    loadRoleSlugs(userId, storeId),
    loadPermissionKeys(userId, storeId),
  ]);

  return { user: toPublicUser(user), store, roles, permissions };
}
