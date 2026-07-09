import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/components/auth/AuthProvider";
import { ApiError } from "@/lib/http";
import {
  addOrderWpNote,
  listOrderWpNotes,
  type OrderWpNoteDto,
} from "@/lib/orders-api";
import { formatDateTime } from "@/lib/utils";

type Banner = { tone: "success" | "error"; message: string };

interface OrderWpNotesCardProps {
  orderId: string;
}

/**
 * WooCommerce order notes (Phase 27): a live timeline read from the store plus
 * an add-note form. Customer-facing notes may be emailed by WooCommerce, so the
 * form defaults to a private note. A disconnected store (503) renders a quiet
 * inline message instead of a page-level error.
 */
export function OrderWpNotesCard({ orderId }: OrderWpNotesCardProps) {
  const { hasPermission } = useAuth();
  const canAddNotes = hasPermission("orders.add_notes");

  const [notes, setNotes] = useState<OrderWpNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [noteText, setNoteText] = useState("");
  const [customerNote, setCustomerNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNotConnected(false);
    try {
      const result = await listOrderWpNotes(orderId);
      setNotes(result.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotConnected(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setBanner(null);
    try {
      await addOrderWpNote(orderId, { note: trimmed, customerNote });
      setNoteText("");
      setCustomerNote(false);
      setBanner({
        tone: "success",
        message: customerNote
          ? "تمت إضافة الملاحظة وإرسالها للعميل."
          : "تمت إضافة الملاحظة الخاصة.",
      });
      await load();
    } catch (err) {
      setBanner({
        tone: "error",
        message:
          err instanceof Error ? err.message : "تعذّر إضافة الملاحظة.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          ملاحظات ووكومرس
        </CardTitle>
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

        {loading ? (
          <LoadingState />
        ) : notConnected ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            المتجر غير متصل بووردبريس — لا يمكن عرض ملاحظات ووكومرس حالياً.
          </p>
        ) : error ? (
          <ErrorState
            description="تعذّر تحميل ملاحظات ووكومرس."
            onRetry={() => void load()}
          />
        ) : notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            لا توجد ملاحظات على هذا الطلب في ووكومرس بعد.
          </p>
        ) : (
          <ol className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.noteId}
                className="rounded-md border border-border/60 bg-muted/20 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={
                      note.customerNote ? "ملاحظة للعميل" : "ملاحظة خاصة"
                    }
                    tone={note.customerNote ? "info" : "neutral"}
                  />
                  <span className="text-xs text-muted-foreground">
                    {note.addedBy || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(note.dateCreated)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{note.note}</p>
              </li>
            ))}
          </ol>
        )}

        {canAddNotes && !notConnected ? (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="اكتب ملاحظة تُضاف إلى الطلب في ووكومرس…"
              rows={3}
              maxLength={2000}
              disabled={submitting}
              aria-label="ملاحظة ووكومرس جديدة"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="wp-note-customer"
                  checked={customerNote}
                  onCheckedChange={setCustomerNote}
                  disabled={submitting}
                />
                <Label htmlFor="wp-note-customer">إرسال للعميل</Label>
              </div>
              <Button
                onClick={() => void handleSubmit()}
                disabled={submitting || noteText.trim().length === 0}
              >
                <Send className="h-4 w-4" />
                {submitting ? "جارٍ الإضافة…" : "إضافة الملاحظة"}
              </Button>
            </div>
            {customerNote ? (
              <p className="text-xs text-muted-foreground">
                الملاحظات الموجهة للعميل قد يرسلها ووكومرس بالبريد الإلكتروني.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
