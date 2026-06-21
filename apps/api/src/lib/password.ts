import bcrypt from "bcrypt";
import { env } from "../config/env";

/** Hashes a plaintext password with bcrypt using the configured cost factor. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

/** Constant-time comparison of a plaintext password against a stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
