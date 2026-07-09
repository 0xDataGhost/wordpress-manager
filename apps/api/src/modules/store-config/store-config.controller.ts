import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import {
  getGateways,
  getSettingsGroup,
  getShipping,
  getTaxRates,
  runConfigCommand,
  updateSettingsGroup,
} from "./store-config.service";
import type {
  CreateShippingZoneInput,
  GatewayParams,
  SaveShippingMethodInput,
  SettingsGroupParams,
  ShippingMethodParams,
  ShippingZoneParams,
  TaxRateInput,
  TaxRateParams,
  ToggleGatewayInput,
  UpdateSettingsInput,
  UpdateShippingZoneInput,
  UpdateTaxRateInput,
} from "./store-config.schemas";

export async function getSettingsHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { group } = req.params as SettingsGroupParams;
  const result = await getSettingsGroup(storeId, group);
  res.status(200).json(successResponse(result, ""));
}

export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { group } = req.params as SettingsGroupParams;
  const input = req.body as UpdateSettingsInput;
  const result = await updateSettingsGroup(storeId, group, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.STORE_SETTINGS_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: group,
    message: `حدّث إعدادات المتجر (${group}) في ووردبريس`,
    metadata: { group, fields: Object.keys(input.values) },
  });
  res.status(200).json(successResponse(result, "Settings updated"));
}

export async function getShippingHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  res.status(200).json(successResponse(await getShipping(storeId), ""));
}

export async function getTaxesHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  res.status(200).json(successResponse(await getTaxRates(storeId), ""));
}

export async function getGatewaysHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  res.status(200).json(successResponse(await getGateways(storeId), ""));
}

/* ------------------------------- Shipping ------------------------------- */

export async function createShippingZoneHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const input = req.body as CreateShippingZoneInput;
  const result = await runConfigCommand(storeId, "shipping", "create_zone", { ...input }, userId, "shipping");
  await auditShipping(req, "أنشأ منطقة شحن", { name: input.name });
  res.status(201).json(successResponse(result, "Shipping zone created"));
}

export async function updateShippingZoneHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { zoneId } = req.params as unknown as ShippingZoneParams;
  const input = req.body as UpdateShippingZoneInput;
  const result = await runConfigCommand(storeId, "shipping", "update_zone", { zoneId, ...input }, userId, "shipping");
  await auditShipping(req, "حدّث منطقة شحن", { zoneId });
  res.status(200).json(successResponse(result, "Shipping zone updated"));
}

export async function deleteShippingZoneHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { zoneId } = req.params as unknown as ShippingZoneParams;
  const result = await runConfigCommand(storeId, "shipping", "delete_zone", { zoneId }, userId, "shipping");
  await auditShipping(req, "حذف منطقة شحن", { zoneId });
  res.status(200).json(successResponse(result, "Shipping zone deleted"));
}

export async function saveShippingMethodHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { zoneId } = req.params as unknown as ShippingZoneParams;
  const input = req.body as SaveShippingMethodInput;
  const result = await runConfigCommand(storeId, "shipping", "save_method", { zoneId, ...input }, userId, "shipping");
  await auditShipping(req, "حفظ طريقة شحن", { zoneId, methodId: input.methodId });
  res.status(200).json(successResponse(result, "Shipping method saved"));
}

export async function deleteShippingMethodHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { zoneId, methodId } = req.params as unknown as ShippingMethodParams;
  const result = await runConfigCommand(storeId, "shipping", "delete_method", { zoneId, methodId }, userId, "shipping");
  await auditShipping(req, "حذف طريقة شحن", { zoneId, methodId });
  res.status(200).json(successResponse(result, "Shipping method deleted"));
}

/* -------------------------------- Taxes --------------------------------- */

export async function createTaxRateHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const input = req.body as TaxRateInput;
  const result = await runConfigCommand(storeId, "tax", "create_rate", { ...input }, userId, "taxes");
  await auditTax(req, "أنشأ معدّل ضريبة", { name: input.name });
  res.status(201).json(successResponse(result, "Tax rate created"));
}

export async function updateTaxRateHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { rateId } = req.params as unknown as TaxRateParams;
  const input = req.body as UpdateTaxRateInput;
  const result = await runConfigCommand(storeId, "tax", "update_rate", { rateId, ...input }, userId, "taxes");
  await auditTax(req, "حدّث معدّل ضريبة", { rateId });
  res.status(200).json(successResponse(result, "Tax rate updated"));
}

export async function deleteTaxRateHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { rateId } = req.params as unknown as TaxRateParams;
  const result = await runConfigCommand(storeId, "tax", "delete_rate", { rateId }, userId, "taxes");
  await auditTax(req, "حذف معدّل ضريبة", { rateId });
  res.status(200).json(successResponse(result, "Tax rate deleted"));
}

/* ------------------------------- Gateways ------------------------------- */

export async function toggleGatewayHandler(req: Request, res: Response): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { gatewayId } = req.params as GatewayParams;
  const input = req.body as ToggleGatewayInput;
  const result = await runConfigCommand(
    storeId,
    "settings",
    "toggle_gateway",
    { gatewayId, ...input },
    userId,
    "gateways",
  );
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.GATEWAY_TOGGLED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: gatewayId,
    message: `${input.enabled ? "فعّل" : "عطّل"} بوابة الدفع: ${gatewayId}`,
    metadata: { gatewayId, enabled: input.enabled },
  });
  res.status(200).json(successResponse(result, "Gateway updated"));
}

async function auditShipping(
  req: Request,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SHIPPING_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: null,
    message,
    metadata,
  });
}

async function auditTax(
  req: Request,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.TAX_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: null,
    message,
    metadata,
  });
}
