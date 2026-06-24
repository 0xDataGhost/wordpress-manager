import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDateTime } from "@/lib/utils";
import type { ConnectionStatusDto } from "@/lib/connector-api";

const COPIED_RESET_MS = 2000;

type Props = {
  status: ConnectionStatusDto;
  /** Plaintext key shown once, immediately after generation. */
  revealedKey: string | null;
  onGenerate: () => void;
  generating: boolean;
  /** Whether the user may generate/rotate the key (settings.edit). */
  canManage: boolean;
};

export function ApiKeyCard({
  status,
  revealedKey,
  onGenerate,
  generating,
  canManage,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasKey = status.hasApiKey;

  async function copyKey() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  }

  function requestGenerate() {
    if (hasKey) setConfirmOpen(true);
    else onGenerate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>مفتاح API</CardTitle>
        <CardDescription>
          مفتاح يُدخل في إضافة ووردبريس لربط متجرك. يظهر مرة واحدة فقط عند توليده.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {revealedKey ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                انسخ المفتاح الآن واحفظه في مكان آمن — لن يظهر مرة أخرى بعد مغادرة
                الصفحة.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                dir="ltr"
                value={revealedKey}
                className="font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
                aria-label="مفتاح API"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyKey}
                aria-label="نسخ المفتاح"
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
            {copied ? <p className="text-xs text-success">تم نسخ المفتاح.</p> : null}
          </div>
        ) : hasKey ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium" dir="ltr">
                {status.apiKeyPrefix}…
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                وُلّد في {formatDateTime(status.apiKeyGeneratedAt)}
              </p>
            </div>
            <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لم يتم توليد مفتاح بعد.</p>
        )}

        {canManage ? (
          <Button onClick={requestGenerate} disabled={generating}>
            <KeyRound />
            {hasKey ? "إعادة توليد المفتاح" : "توليد مفتاح API"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            تحتاج صلاحية «تعديل الإعدادات» لتوليد مفتاح API.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="إعادة توليد المفتاح؟"
        description="سيتم إبطال المفتاح الحالي فورًا، وستحتاج إلى إدخال المفتاح الجديد في إضافة ووردبريس لإعادة الربط."
        confirmLabel="إعادة التوليد"
        destructive
        loading={generating}
        onConfirm={() => {
          setConfirmOpen(false);
          onGenerate();
        }}
      />
    </Card>
  );
}
