import type { StatusTone } from "@/components/shared/StatusBadge";
import type {
  CodeBatchStatus,
  DigitalCodeStatus,
  ManualStatusTarget,
} from "@/lib/digital-inventory-api";

interface StatusMeta {
  label: string;
  tone: StatusTone;
}

/** Arabic label + badge tone for each digital code status. */
export const CODE_STATUS_META: Record<DigitalCodeStatus, StatusMeta> = {
  available: { label: "متاح", tone: "success" },
  reserved: { label: "محجوز", tone: "info" },
  sold: { label: "مباع", tone: "info" },
  delivered: { label: "مُسلَّم", tone: "success" },
  replacement: { label: "بديل", tone: "neutral" },
  voided: { label: "ملغى", tone: "neutral" },
  invalid: { label: "غير صالح", tone: "danger" },
  refunded: { label: "مُسترجع", tone: "warning" },
  expired: { label: "منتهٍ", tone: "warning" },
};

export function resolveCodeStatus(status: string): StatusMeta {
  return (
    CODE_STATUS_META[status as DigitalCodeStatus] ?? {
      label: status,
      tone: "neutral",
    }
  );
}

/** Ordered options for the status filter ("all" handled by the page). */
export const CODE_STATUS_OPTIONS: { value: DigitalCodeStatus; label: string }[] =
  (Object.keys(CODE_STATUS_META) as DigitalCodeStatus[]).map((value) => ({
    value,
    label: CODE_STATUS_META[value].label,
  }));

/** Arabic label + tone for each batch status. */
export const BATCH_STATUS_META: Record<CodeBatchStatus, StatusMeta> = {
  active: { label: "نشطة", tone: "success" },
  paused: { label: "موقوفة", tone: "warning" },
  consumed: { label: "مُستنفدة", tone: "neutral" },
  archived: { label: "مؤرشفة", tone: "neutral" },
};

export function resolveBatchStatus(status: string): StatusMeta {
  return (
    BATCH_STATUS_META[status as CodeBatchStatus] ?? {
      label: status,
      tone: "neutral",
    }
  );
}

export const BATCH_STATUS_OPTIONS: { value: CodeBatchStatus; label: string }[] =
  (Object.keys(BATCH_STATUS_META) as CodeBatchStatus[]).map((value) => ({
    value,
    label: BATCH_STATUS_META[value].label,
  }));

/** Arabic labels for the manually-settable (destructive) status targets. */
export const MANUAL_STATUS_TARGET_LABELS: Record<ManualStatusTarget, string> = {
  voided: "ملغى",
  invalid: "غير صالح",
  expired: "منتهٍ",
};

/**
 * Manual status transitions, mirroring the backend's authoritative map. Used to
 * decide whether the "change status" action is offered and which targets to show.
 * The backend re-validates, so this is purely a UX guard.
 */
const MANUAL_TRANSITIONS: Partial<Record<DigitalCodeStatus, ManualStatusTarget[]>> =
  {
    available: ["voided", "invalid", "expired"],
    reserved: ["voided"],
    sold: ["invalid"],
  };

/** Manual status targets reachable from the given current status (may be empty). */
export function getManualStatusTargets(
  current: string,
): ManualStatusTarget[] {
  return MANUAL_TRANSITIONS[current as DigitalCodeStatus] ?? [];
}
