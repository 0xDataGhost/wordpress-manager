import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { deleteProductFromWp } from "@/lib/catalog-api";
import type { ProductDto } from "@/lib/products-api";

type ProductWpDeleteSectionProps = {
  productId: string;
  /** Reflect the refreshed product (its wpProductId is cleared on success). */
  onDeleted: (product: ProductDto) => void;
  onError: (message: string) => void;
};

export function ProductWpDeleteSection({
  productId,
  onDeleted,
  onError,
}: ProductWpDeleteSectionProps) {
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const updated = await deleteProductFromWp(productId, force);
      setOpen(false);
      onDeleted(updated);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "تعذّر حذف المنتج من ووردبريس.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">منطقة الخطر</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-sm text-muted-foreground">
            حذف هذا المنتج من ووردبريس. افتراضياً يُنقل إلى المهملات، ويمكنك
            اختيار الحذف النهائي.
          </p>
          <Button
            variant="destructive"
            onClick={() => {
              setForce(false);
              setOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            حذف من ووردبريس
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="حذف من ووردبريس"
        description="سيتم حذف المنتج من متجر ووردبريس. هذا الإجراء قد لا يكون قابلاً للتراجع."
        confirmLabel="حذف"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
      >
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="wp-delete-force">
            حذف نهائي بدلاً من النقل للمهملات
          </Label>
          <Switch
            id="wp-delete-force"
            checked={force}
            onCheckedChange={setForce}
            disabled={deleting}
            aria-label="حذف نهائي بدلاً من النقل للمهملات"
          />
        </div>
      </ConfirmDialog>
    </Card>
  );
}
