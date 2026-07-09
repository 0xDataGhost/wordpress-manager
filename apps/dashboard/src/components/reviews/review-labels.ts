import type { StatusTone } from "@/components/shared/StatusBadge";
import type { ReviewStatus } from "@/lib/reviews-api";

/** Arabic label for each review status. */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  approved: "منشور",
  hold: "بانتظار",
  spam: "سبام",
  trash: "مهملات",
};

/** Semantic tone used by the StatusBadge for each review status. */
export const REVIEW_STATUS_TONES: Record<ReviewStatus, StatusTone> = {
  approved: "success",
  hold: "warning",
  spam: "danger",
  trash: "danger",
};

/** Options for the status filter dropdown (includes an "all" sentinel). */
export const REVIEW_STATUS_FILTERS: { value: ReviewStatus | "all"; label: string }[] =
  [
    { value: "all", label: "الكل" },
    { value: "approved", label: "منشور" },
    { value: "hold", label: "بانتظار" },
    { value: "spam", label: "سبام" },
    { value: "trash", label: "مهملات" },
  ];

/**
 * Quick moderation actions offered per row. Each entry sets the review to the
 * target status. Excludes the review's current status at render time.
 */
export const REVIEW_MODERATION_ACTIONS: { status: ReviewStatus; label: string }[] =
  [
    { status: "approved", label: "اعتماد" },
    { status: "hold", label: "تعليق" },
    { status: "spam", label: "سبام" },
    { status: "trash", label: "حذف" },
  ];
