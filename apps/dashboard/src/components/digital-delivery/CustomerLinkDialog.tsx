import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import {
  createCustomerLink,
  listCustomerLinks,
  revokeCustomerLink,
  type CreatedCustomerLink,
  type CustomerLink,
  type CustomerLinkStatus,
} from "@/lib/digital-delivery-api";
import { formatDateTime } from "@/lib/utils";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const COPIED_RESET_MS = 2000;

const STATUS_META: Record<CustomerLinkStatus, { label: string; tone: StatusTone }> = {
  active: { label: "نشط", tone: "success" },
  revoked: { label: "ملغى", tone: "neutral" },
  expired: { label: "منتهٍ", tone: "warning" },
  exhausted: { label: "مُستنفد", tone: "neutral" },
};

interface CustomerLinkDialogProps {
  open: boolean;
  orderId: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Staff dialog to generate, copy, and revoke a customer self-service link.
 * Generating a new link automatically revokes the previous active one (one active
 * link per order). The raw token is shown ONCE, right after generation.
 */
export function CustomerLinkDialog({
  open,
  orderId,
  onOpenChange,
}: CustomerLinkDialogProps) {
  const [links, setLinks] = useState<CustomerLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [maxUsesMode, setMaxUsesMode] = useState<"single" | "unlimited">("single");
  const [generating, setGenerating] = useState(false);
  const [created, setCreated] = useState<{ url: string; raw: CreatedCustomerLink } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCustomerLinks(orderId);
      setLinks(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل الروابط.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (open) {
      setCreated(null);
      setCopied(false);
      setError(null);
      setExpiresInDays("7");
      setMaxUsesMode("single");
      void load();
    }
  }, [open, load]);

  function composeUrl(link: CreatedCustomerLink): string {
    return link.url ?? `${window.location.origin}/digital-order/${link.token}`;
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setCreated(null);
    try {
      const link = await createCustomerLink(orderId, {
        expiresInDays: Number(expiresInDays),
        maxUses: maxUsesMode === "unlimited" ? null : 1,
      });
      setCreated({ url: composeUrl(link), raw: link });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إنشاء الرابط.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyUrl() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await revokeCustomerLink(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إلغاء الرابط.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>رابط وصول العميل</DialogTitle>
          <DialogDescription>
            أنشئ رابطاً آمناً يتيح للعميل عرض أكواده المُسلَّمة. إنشاء رابط جديد
            يُلغي الرابط النشط السابق تلقائياً.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="link-expiry">مدة الصلاحية</Label>
            <select
              id="link-expiry"
              className={inputClass}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            >
              <option value="7">٧ أيام</option>
              <option value="14">١٤ يوماً</option>
              <option value="30">٣٠ يوماً</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-max-uses">حد الاستخدام</Label>
            <select
              id="link-max-uses"
              className={inputClass}
              value={maxUsesMode}
              onChange={(e) =>
                setMaxUsesMode(e.target.value as "single" | "unlimited")
              }
            >
              <option value="single">مرة واحدة لكل كود</option>
              <option value="unlimited">غير محدود (ضمن المدة)</option>
            </select>
          </div>
        </div>

        <Button onClick={() => void handleGenerate()} disabled={generating}>
          <Link2 className="h-4 w-4" />
          {generating ? "جارٍ الإنشاء…" : "إنشاء رابط جديد"}
        </Button>

        {created ? (
          <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              تم إنشاء الرابط — انسخه الآن وأرسله للعميل عبر قناتك الخاصة.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                dir="ltr"
                value={created.url}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
                aria-label="رابط العميل"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void copyUrl()}
                aria-label="نسخ الرابط"
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">الروابط الحالية</h3>
          {loading ? (
            <p className="py-2 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : links.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">لا توجد روابط بعد.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => {
                const meta = STATUS_META[link.status];
                return (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <StatusBadge label={meta.label} tone={meta.tone} />
                        <span className="text-muted-foreground">
                          الاستخدام: {link.usedCount}/
                          {link.maxUses ?? "∞"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ينتهي: {formatDateTime(link.expiresAt)}
                      </span>
                    </div>
                    {link.status === "active" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="إلغاء الرابط"
                        onClick={() => void handleRevoke(link.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
