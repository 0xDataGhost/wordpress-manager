import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Copy, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/shared/LoadingState";
import {
  lookupOrder,
  revealCode,
  logCodeCopied,
  type PublicOrderView,
} from "@/lib/customer-access-api";

type PageState = "loading" | "error" | "ready";
const COPIED_RESET_MS = 2000;

/**
 * PUBLIC customer self-service page (Phase 22). Renders OUTSIDE the dashboard
 * layout and requires NO login — the token in the route is the only credential.
 * Codes are masked until the customer reveals each one independently; a revealed
 * value is cached only in memory for show/hide and is never logged here.
 */
export function DigitalOrderPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [view, setView] = useState<PublicOrderView | null>(null);

  // Per-code transient state, keyed by code id. Revealed values live only here.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [codeError, setCodeError] = useState<Record<string, string>>({});

  // Defense-in-depth: keep the token (in the URL) out of any Referer header sent
  // to third parties while this page is open.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setState("error");
      return;
    }
    setState("loading");
    try {
      const result = await lookupOrder(token);
      setView(result);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const showCode = useCallback(
    async (codeId: string) => {
      setCodeError((prev) => ({ ...prev, [codeId]: "" }));
      // Already revealed this session → just unhide (no new API use consumed).
      if (revealed[codeId] !== undefined) {
        setShown((prev) => ({ ...prev, [codeId]: true }));
        return;
      }
      if (!token) return;
      setBusy((prev) => ({ ...prev, [codeId]: true }));
      try {
        const result = await revealCode(token, codeId);
        if (result.code !== undefined) {
          setRevealed((prev) => ({ ...prev, [codeId]: result.code as string }));
          setShown((prev) => ({ ...prev, [codeId]: true }));
        }
      } catch {
        setCodeError((prev) => ({
          ...prev,
          [codeId]: "تعذّر عرض الكود. قد يكون الرابط منتهياً أو تجاوزت حد العرض.",
        }));
      } finally {
        setBusy((prev) => ({ ...prev, [codeId]: false }));
      }
    },
    [token, revealed],
  );

  function hideCode(codeId: string) {
    setShown((prev) => ({ ...prev, [codeId]: false }));
  }

  async function copyCode(codeId: string) {
    const value = revealed[codeId];
    if (!value || !token) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied((prev) => ({ ...prev, [codeId]: true }));
      window.setTimeout(
        () => setCopied((prev) => ({ ...prev, [codeId]: false })),
        COPIED_RESET_MS,
      );
      // Best-effort copy audit; never blocks the customer.
      void logCodeCopied(token, codeId).catch(() => undefined);
    } catch {
      setCopied((prev) => ({ ...prev, [codeId]: false }));
    }
  }

  const hasCodes =
    view !== null && view.items.some((item) => item.codes.length > 0);

  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10"
    >
      {state === "loading" ? (
        <LoadingState label="جارٍ تحميل طلبك…" />
      ) : state === "error" || !view ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h1 className="text-lg font-semibold">الرابط غير صالح</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              هذا الرابط غير صالح أو منتهي الصلاحية أو تم إلغاؤه. يرجى التواصل مع
              المتجر للحصول على رابط جديد.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <header className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{view.storeName}</h1>
            <p className="text-sm text-muted-foreground">
              {view.orderNumber ? `الطلب رقم ${view.orderNumber}` : "أكواد طلبك"}
            </p>
          </header>

          {!hasCodes ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                لا توجد أكواد متاحة لعرضها في هذا الطلب حالياً.
              </CardContent>
            </Card>
          ) : (
            view.items.map((group, index) => (
              <Card key={`${group.productName ?? "product"}-${index}`}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {group.productName ?? "منتج رقمي"}
                  </CardTitle>
                  {group.instructions ? (
                    <p className="text-sm text-muted-foreground">
                      {group.instructions}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {group.codes.map((code) => {
                    const isShown = Boolean(shown[code.id]);
                    const value = revealed[code.id];
                    return (
                      <div
                        key={code.id}
                        className="rounded-md border border-border/60 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            dir="ltr"
                            value={
                              isShown && value !== undefined
                                ? value
                                : (code.codePreview ?? "••••••••")
                            }
                            className="font-mono text-sm"
                            onFocus={(e) => e.currentTarget.select()}
                            aria-label="الكود الرقمي"
                          />
                          {isShown && value !== undefined ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => void copyCode(code.id)}
                                aria-label="نسخ الكود"
                              >
                                {copied[code.id] ? (
                                  <Check className="text-success" />
                                ) : (
                                  <Copy />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => hideCode(code.id)}
                                aria-label="إخفاء الكود"
                              >
                                <EyeOff />
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              onClick={() => void showCode(code.id)}
                              disabled={Boolean(busy[code.id])}
                            >
                              <Eye className="h-4 w-4" />
                              {busy[code.id] ? "جارٍ العرض…" : "عرض"}
                            </Button>
                          )}
                        </div>
                        {codeError[code.id] ? (
                          <p
                            role="alert"
                            className="mt-2 text-xs text-destructive"
                          >
                            {codeError[code.id]}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
          )}

          <p className="px-2 text-center text-xs text-muted-foreground">
            احتفظ بأكوادك في مكان آمن ولا تشاركها مع أحد. هذا الرابط خاص بك وقد
            تنتهي صلاحيته.
          </p>
        </>
      )}
    </div>
  );
}
