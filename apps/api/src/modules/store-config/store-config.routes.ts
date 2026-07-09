import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createShippingZoneHandler,
  createTaxRateHandler,
  deleteShippingMethodHandler,
  deleteShippingZoneHandler,
  deleteTaxRateHandler,
  getGatewaysHandler,
  getSettingsHandler,
  getShippingHandler,
  getTaxesHandler,
  saveShippingMethodHandler,
  toggleGatewayHandler,
  updateSettingsHandler,
  updateShippingZoneHandler,
  updateTaxRateHandler,
} from "./store-config.controller";
import {
  createShippingZoneSchema,
  gatewayParamsSchema,
  saveShippingMethodSchema,
  settingsGroupParamsSchema,
  shippingMethodParamsSchema,
  shippingZoneParamsSchema,
  taxRateParamsSchema,
  taxRateSchema,
  toggleGatewaySchema,
  updateSettingsSchema,
  updateShippingZoneSchema,
  updateTaxRateSchema,
} from "./store-config.schemas";

const router = Router();

// ---- General settings groups ----
router.get(
  "/settings/:group",
  authenticate,
  requirePermission("store_settings.view"),
  validate({ params: settingsGroupParamsSchema }),
  asyncHandler(getSettingsHandler),
);
router.put(
  "/settings/:group",
  authenticate,
  requirePermission("store_settings.manage"),
  validate({ params: settingsGroupParamsSchema, body: updateSettingsSchema }),
  asyncHandler(updateSettingsHandler),
);

// ---- Shipping ----
router.get(
  "/shipping/zones",
  authenticate,
  requirePermission("store_settings.view"),
  asyncHandler(getShippingHandler),
);
router.post(
  "/shipping/zones",
  authenticate,
  requirePermission("shipping.manage"),
  validate({ body: createShippingZoneSchema }),
  asyncHandler(createShippingZoneHandler),
);
router.put(
  "/shipping/zones/:zoneId",
  authenticate,
  requirePermission("shipping.manage"),
  validate({ params: shippingZoneParamsSchema, body: updateShippingZoneSchema }),
  asyncHandler(updateShippingZoneHandler),
);
router.delete(
  "/shipping/zones/:zoneId",
  authenticate,
  requirePermission("shipping.manage"),
  validate({ params: shippingZoneParamsSchema }),
  asyncHandler(deleteShippingZoneHandler),
);
router.post(
  "/shipping/zones/:zoneId/methods",
  authenticate,
  requirePermission("shipping.manage"),
  validate({ params: shippingZoneParamsSchema, body: saveShippingMethodSchema }),
  asyncHandler(saveShippingMethodHandler),
);
router.delete(
  "/shipping/zones/:zoneId/methods/:methodId",
  authenticate,
  requirePermission("shipping.manage"),
  validate({ params: shippingMethodParamsSchema }),
  asyncHandler(deleteShippingMethodHandler),
);

// ---- Taxes ----
router.get(
  "/taxes/rates",
  authenticate,
  requirePermission("store_settings.view"),
  asyncHandler(getTaxesHandler),
);
router.post(
  "/taxes/rates",
  authenticate,
  requirePermission("taxes.manage"),
  validate({ body: taxRateSchema }),
  asyncHandler(createTaxRateHandler),
);
router.put(
  "/taxes/rates/:rateId",
  authenticate,
  requirePermission("taxes.manage"),
  validate({ params: taxRateParamsSchema, body: updateTaxRateSchema }),
  asyncHandler(updateTaxRateHandler),
);
router.delete(
  "/taxes/rates/:rateId",
  authenticate,
  requirePermission("taxes.manage"),
  validate({ params: taxRateParamsSchema }),
  asyncHandler(deleteTaxRateHandler),
);

// ---- Gateways (enable/disable only; secrets never leave WordPress) ----
router.get(
  "/gateways",
  authenticate,
  requirePermission("store_settings.view"),
  asyncHandler(getGatewaysHandler),
);
router.put(
  "/gateways/:gatewayId",
  authenticate,
  requirePermission("gateways.toggle"),
  validate({ params: gatewayParamsSchema, body: toggleGatewaySchema }),
  asyncHandler(toggleGatewayHandler),
);

export default router;
