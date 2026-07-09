import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { replyReview, type ReviewDto } from "@/lib/reviews-api";

interface ReviewReplyDialogProps {
  open: boolean;
  /** The review being replied to; null closes the dialog. */
  review: ReviewDto | null;
  onOpenChange: (open: boolean) => void;
  onReplied: () => void;
}

/**
 * A small dialog to post a public reply to a product review. The reply is
 * sent to WooCommerce as a threaded comment via the reviews module.
 */
export function ReviewReplyDialog({
  open,
  review,
  onOpenChange,
  onReplied,
}: ReviewReplyDialogProps) {
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReply("");
    setError(null);
    setSubmitting(false);
  }, [open, review]);

  const replyInvalid = reply.trim().length === 0;

  async function handleSubmit() {
    if (!review || replyInvalid) return;
    setSubmitting(true);
    setError(null);
    try {
      await replyReview(review.id, reply.trim());
      onReplied();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال الرد.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>الرد على التقييم</DialogTitle>
          <DialogDescription>
            {review?.productName
              ? `رد عام على تقييم المنتج «${review.productName}».`
              : "رد عام على هذا التقييم."}
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

        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="اكتب ردّك على هذا التقييم…"
          rows={5}
          maxLength={5000}
          disabled={submitting}
          aria-label="نص الرد"
        />

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || replyInvalid}
          >
            {submitting ? "جارٍ الإرسال…" : "إرسال الرد"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
