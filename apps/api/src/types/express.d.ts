/**
 * Augments Express' Request with the authenticated tenant context attached by
 * the `authenticate` middleware. `permissionKeys` is memoised by `authorize`
 * so multiple permission checks in one request hit the database only once.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        storeId: string;
        permissionKeys?: Set<string>;
      };
    }
  }
}

export {};
