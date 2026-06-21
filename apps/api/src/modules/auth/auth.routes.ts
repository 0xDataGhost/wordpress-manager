import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { rateLimit } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { login, logout, me, refresh, register } from "./auth.controller";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "./auth.schemas";

const router = Router();

router.post(
  "/register",
  rateLimit({ name: "auth:register" }),
  validate({ body: registerSchema }),
  asyncHandler(register),
);
router.post(
  "/login",
  rateLimit({ name: "auth:login" }),
  validate({ body: loginSchema }),
  asyncHandler(login),
);
router.post(
  "/refresh",
  rateLimit({ name: "auth:refresh" }),
  validate({ body: refreshSchema }),
  asyncHandler(refresh),
);
router.post("/logout", validate({ body: logoutSchema }), asyncHandler(logout));
router.get("/me", authenticate, asyncHandler(me));

export default router;
