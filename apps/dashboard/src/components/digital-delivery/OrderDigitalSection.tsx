import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  KeyRound,
  Link2,
  MoreHorizontal,
  PackageCheck,
  RefreshCw,
  RotateCw,
  Send,
  Ban,
  Repeat,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/components/auth/AuthProvider";
import { RevealCodeDialog } from "@/components/digital-inventory/RevealCodeDialog";
import { ReplaceCodeDialog } from "./ReplaceCodeDialog";
import { ManualAssignDialog, type ManualAssignItem } from "./ManualAssignDialog";
import { AssignmentStatusDialog } from "./AssignmentStatusDialog";
import { MarkInvalidDialog } from "./MarkInvalidDialog";
import { ReleaseDialog } from "./ReleaseDialog";
import { CustomerLinkDialog } from "./CustomerLinkDialog";
import {
  ASSIGNMENT_TYPE_LABELS,
  DELIVERY_CHANNEL_LABELS,
  resolveAssignmentStatus,
  resolveDeliveryStatus,
  resolveDigitalDeliveryStatus,
} from "./digital-delivery-status";
import {
  assignOrder,
  deliverOrder,
  getOrderAssignments,
  getOrderDeliveries,
  resendAssignment,
  retryOrder,
  type Assignment,
  type Delivery,
  type OrderAssignmentsView,
  type OrderDeliveriesView,
} from "@/lib/digital-delivery-api";
import { formatDateTime } from "@/lib/utils";

type Banner = { tone: "success" | "error"; message: string };

interface OrderDigitalSectionProps {
  orderId: string;
  /** Order line items (for the manual-assign product picker). */
  orderItems: { id: string; productId: string | null; name: string }[];
}

const ACTIONABLE_STATUSES = new Set(["assigned", "delivered"]);

/**
 * Order digital fulfillment block: derived status, masked assignments, delivery
 * history, and the full operator toolkit (assign / deliver / retry / manual
 * assign / release, plus per-code reveal / resend / replace / status / invalid).
 * Reused by the standalone delivery page and embedded in the order details page.
 * Never renders a raw code — reveal goes through the dedicated audited endpoint.
 */
export function OrderDigitalSection({
  orderId,
  orderItems,
}: OrderDigitalSectionProps) {
  const { hasPermission } = useAuth();
  const canAssign = hasPermission("digital_delivery.assign");
  const canDeliver = hasPermission("digital_delivery.deliver");
  const canRetry = hasPermission("digital_delivery.retry");
  const canReplace = hasPermission("digital_delivery.replace");
  const canResend = hasPermission("digital_delivery.resend");
  const canRefund = hasPermission("digital_delivery.refund");
  const canReveal = hasPermission("digital_inventory.reveal");
  const canMarkInvalid = hasPermission("digital_inventory.edit");
  const canPickCode = hasPermission("digital_inventory.view");
  const canCustomerLink = hasPermission("digital_delivery.customer_link");

  const [view, setView] = useState<OrderAssignmentsView | null>(null);
  const [deliveries, setDeliveries] = useState<OrderDeliveriesView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [acting, setActing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [replaceTarget, setReplaceTarget] = useState<Assignment | null>(null);
  const [statusTarget, setStatusTarget] = useState<Assignment | null>(null);
  const [revealTarget, setRevealTarget] = useState<{
    id: string;
    codePreview: string | null;
  } | null>(null);
  const [invalidTarget, setInvalidTarget] = useState<{
    codeId: string;
    codePreview: string | null;
  } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [assignments, deliveriesView] = await Promise.all([
        getOrderAssignments(orderId),
        getOrderDeliveries(orderId),
      ]);
      setView(assignments);
      setDeliveries(deliveriesView);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, successMessage: string) => {
      setActing(true);
      setBanner(null);
      try {
        await fn();
        await load();
        setBanner({ tone: "success", message: successMessage });
      } catch (err) {
        setBanner({
          tone: "error",
          message: err instanceof Error ? err.message : "تعذّر تنفيذ الإجراء.",
        });
      } finally {
        setActing(false);
      }
    },
    [load],
  );

  const manualItems: ManualAssignItem[] = orderItems
    .filter((i): i is ManualAssignItem => Boolean(i.productId))
    .map((i) => ({ id: i.id, productId: i.productId as string, name: i.name }));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>التسليم الرقمي</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <LoadingState />
        </CardContent>
      </Card>
    );
  }

  if (error || !view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>التسليم الرقمي</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ErrorState
            description="تعذّر تحميل بيانات التسليم الرقمي."
            onRetry={() => void load()}
          />
        </CardContent>
      </Card>
    );
  }

  const isDigital = view.requiredCodes > 0 || view.assignments.length > 0;
  if (!isDigital) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>التسليم الرقمي</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="py-4 text-center text-sm text-muted-foreground">
            هذا الطلب لا يحتوي منتجات رقمية.
          </p>
        </CardContent>
      </Card>
    );
  }

  const statusMeta = resolveDigitalDeliveryStatus(view.digitalDeliveryStatus);
  const missing = Math.max(0, view.requiredCodes - view.assignedCodes);
  const canRetryNow = ["failed", "manual_review", "partial"].includes(
    view.digitalDeliveryStatus,
  );

  const assignmentColumns: Column<Assignment>[] = [
    {
      key: "product",
      header: "المنتج",
      cell: (row) => <span className="font-medium">{row.productName ?? "—"}</span>,
    },
    {
      key: "preview",
      header: "معاينة الكود",
      cell: (row) => (
        <span dir="ltr" className="font-mono text-xs">
          {row.codePreview ?? "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "النوع",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {ASSIGNMENT_TYPE_LABELS[row.assignmentType] ?? row.assignmentType}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => {
        const meta = resolveAssignmentStatus(row.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "assignedAt",
      header: "التاريخ",
      cell: (row) => (
        <span className="text-sm">{formatDateTime(row.assignedAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-10",
      cell: (row) => {
        const actionable = ACTIONABLE_STATUSES.has(row.status);
        const hasAny =
          canReveal ||
          (canResend && actionable) ||
          (canReplace && actionable) ||
          (canRefund && actionable) ||
          canMarkInvalid;
        if (!hasAny) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="إجراءات الكود">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canReveal ? (
                <DropdownMenuItem
                  onClick={() =>
                    setRevealTarget({
                      id: row.codeId,
                      codePreview: row.codePreview,
                    })
                  }
                >
                  <Eye className="h-4 w-4" />
                  كشف الكود
                </DropdownMenuItem>
              ) : null}
              {canResend && actionable ? (
                <DropdownMenuItem
                  onClick={() =>
                    void runAction(
                      () => resendAssignment(row.id),
                      "تمت إعادة الإرسال.",
                    )
                  }
                >
                  <Repeat className="h-4 w-4" />
                  إعادة الإرسال
                </DropdownMenuItem>
              ) : null}
              {canReplace && actionable ? (
                <DropdownMenuItem onClick={() => setReplaceTarget(row)}>
                  <RefreshCw className="h-4 w-4" />
                  استبدال الكود
                </DropdownMenuItem>
              ) : null}
              {canRefund && actionable ? (
                <DropdownMenuItem onClick={() => setStatusTarget(row)}>
                  <Ban className="h-4 w-4" />
                  تغيير الحالة
                </DropdownMenuItem>
              ) : null}
              {canMarkInvalid ? (
                <DropdownMenuItem
                  onClick={() =>
                    setInvalidTarget({
                      codeId: row.codeId,
                      codePreview: row.codePreview,
                    })
                  }
                >
                  <Ban className="h-4 w-4" />
                  تعليم كغير صالح
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const deliveryColumns: Column<Delivery>[] = [
    {
      key: "status",
      header: "الحالة",
      cell: (row) => {
        const meta = resolveDeliveryStatus(row.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "channel",
      header: "القناة",
      cell: (row) => (
        <span className="text-sm">
          {DELIVERY_CHANNEL_LABELS[row.channel] ?? row.channel}
        </span>
      ),
    },
    {
      key: "attempts",
      header: "المحاولات",
      cell: (row) => <span>{row.attemptCount}</span>,
    },
    {
      key: "lastAttempt",
      header: "آخر محاولة",
      cell: (row) => (
        <span className="text-sm">{formatDateTime(row.lastAttemptAt)}</span>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.failedReason ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          التسليم الرقمي
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          <span className="text-sm text-muted-foreground">
            الأكواد: {view.assignedCodes} / {view.requiredCodes}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {banner ? (
          <div
            role="alert"
            className={
              banner.tone === "success"
                ? "rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
                : "rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            }
          >
            {banner.message}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {canAssign && missing > 0 ? (
            <Button
              onClick={() =>
                void runAction(
                  () => assignOrder(orderId, { allowPartial: true }),
                  "تم تعيين الأكواد.",
                )
              }
              disabled={acting}
            >
              <KeyRound className="h-4 w-4" />
              تعيين الأكواد
            </Button>
          ) : null}
          {canDeliver && view.assignedCodes > 0 ? (
            <Button
              variant="outline"
              onClick={() =>
                void runAction(
                  () => deliverOrder(orderId),
                  "تم إرسال الأكواد.",
                )
              }
              disabled={acting}
            >
              <Send className="h-4 w-4" />
              إرسال الأكواد
            </Button>
          ) : null}
          {canRetry && canRetryNow ? (
            <Button
              variant="outline"
              onClick={() =>
                void runAction(() => retryOrder(orderId), "تمت إعادة المحاولة.")
              }
              disabled={acting}
            >
              <RotateCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          ) : null}
          {canAssign && manualItems.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => setManualOpen(true)}
              disabled={acting}
            >
              <PackageCheck className="h-4 w-4" />
              تعيين كود يدوي
            </Button>
          ) : null}
          {canRefund ? (
            <Button
              variant="ghost"
              onClick={() => setReleaseOpen(true)}
              disabled={acting}
            >
              <Ban className="h-4 w-4" />
              تحرير الأكواد
            </Button>
          ) : null}
          {canCustomerLink && view.assignedCodes > 0 ? (
            <Button variant="outline" onClick={() => setLinkOpen(true)}>
              <Link2 className="h-4 w-4" />
              رابط العميل
            </Button>
          ) : null}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">الأكواد المعيَّنة</h3>
          <DataTable
            columns={assignmentColumns}
            data={view.assignments}
            rowKey={(row) => row.id}
            emptyTitle="لا توجد أكواد معيَّنة"
            emptyDescription="لم يتم تعيين أي أكواد لهذا الطلب بعد."
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">سجل التسليم</h3>
          <DataTable
            columns={deliveryColumns}
            data={deliveries?.deliveries ?? []}
            rowKey={(row) => row.id}
            emptyTitle="لا يوجد تسليم بعد"
            emptyDescription="لم تُسجَّل أي محاولة تسليم لهذا الطلب."
          />
        </div>
      </CardContent>

      <RevealCodeDialog
        target={revealTarget}
        onOpenChange={(open) => {
          if (!open) setRevealTarget(null);
        }}
      />
      <ReplaceCodeDialog
        assignment={replaceTarget}
        canPickCode={canPickCode}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null);
        }}
        onDone={() => void load()}
      />
      <AssignmentStatusDialog
        assignment={statusTarget}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        onDone={() => void load()}
      />
      <MarkInvalidDialog
        target={invalidTarget}
        onOpenChange={(open) => {
          if (!open) setInvalidTarget(null);
        }}
        onDone={() => void load()}
      />
      <ManualAssignDialog
        open={manualOpen}
        orderId={orderId}
        items={manualItems}
        onOpenChange={setManualOpen}
        onDone={() => void load()}
      />
      <ReleaseDialog
        open={releaseOpen}
        orderId={orderId}
        onOpenChange={setReleaseOpen}
        onDone={() => void load()}
      />
      <CustomerLinkDialog
        open={linkOpen}
        orderId={orderId}
        onOpenChange={setLinkOpen}
      />
    </Card>
  );
}
