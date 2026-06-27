import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { lookupOrder, revealCustomerCode } from "./customer-access.service";
import type { LookupInput, RevealInput } from "./customer-access.schemas";

/**
 * PUBLIC customer self-service controllers (Phase 22). No JWT — the token in the
 * body is the only credential. Every response is `Cache-Control: no-store` so a
 * browser/CDN never caches order data or a revealed code.
 */

/** POST /public/digital-orders/lookup — masked order view. */
export async function lookupHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as LookupInput;
  const view = await lookupOrder(body.token);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(successResponse(view));
}

/** POST /public/digital-orders/reveal — reveal one code (`viewed`) or log `copied`. */
export async function revealHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as RevealInput;
  const result = await revealCustomerCode(body.token, body.codeId, body.action, {
    ip: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(successResponse(result));
}
