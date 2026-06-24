import { useState } from "react";
import { Unplug } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { ConnectionStatusDto } from "@/lib/connector-api";

const STEPS = [
  "ولّد مفتاح API من البطاقة المجاورة وانسخه فورًا.",
  "ثبّت إضافة «SaaS Connector» وفعّلها داخل ووردبريس.",
  "الصق المفتاح في إعدادات الإضافة لإتمام الربط من جهة ووردبريس.",
  "اضغط «تحديث الحالة» بالأعلى لتظهر حالة الاتصال هنا.",
];

type Props = {
  status: ConnectionStatusDto;
  onDisconnect: () => void;
  disconnecting: boolean;
  /** Whether the user may disconnect the store (settings.edit). */
  canManage: boolean;
};

export function ConnectStoreCard({
  status,
  onDisconnect,
  disconnecting,
  canManage,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isDisconnected = status.status === "disconnected";

  return (
    <Card>
      <CardHeader>
        <CardTitle>ربط المتجر</CardTitle>
        <CardDescription>
          يتم الربط من إضافة ووردبريس باستخدام مفتاح API. اتبع الخطوات التالية،
          ثم تابع حالة الاتصال من بطاقة «حالة الاتصال».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2 text-sm text-muted-foreground">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="font-medium text-foreground">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {status.siteUrl ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">رابط المتجر</span>
            <span className="truncate text-sm font-medium" dir="ltr">
              {status.siteUrl}
            </span>
          </div>
        ) : null}

        {!isDisconnected && canManage ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={disconnecting}
          >
            <Unplug />
            فصل المتجر
          </Button>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="فصل المتجر؟"
        description="سيتم إبطال مفتاح API وإزالة بيانات الربط. يمكنك إعادة الربط لاحقًا بتوليد مفتاح جديد."
        confirmLabel="فصل المتجر"
        destructive
        loading={disconnecting}
        onConfirm={() => {
          setConfirmOpen(false);
          onDisconnect();
        }}
      />
    </Card>
  );
}
