import { useState } from "react";
import { ImagePlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { uploadCatalogMedia } from "@/lib/catalog-api";

type ProductMediaSectionProps = {
  wpProductId: number;
  /** Refresh the parent product after a successful upload. */
  onUploaded: (message: string) => void;
};

export function ProductMediaSection({
  wpProductId,
  onUploaded,
}: ProductMediaSectionProps) {
  const [open, setOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [asFeatured, setAsFeatured] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSourceUrl("");
    setAltText("");
    setAsFeatured(true);
    setError(null);
  }

  async function handleUpload() {
    const trimmed = sourceUrl.trim();
    if (!trimmed) return;
    setUploading(true);
    setError(null);
    try {
      await uploadCatalogMedia({
        sourceUrl: trimmed,
        attachToWpProductId: wpProductId,
        asFeatured,
        altText: altText.trim() || undefined,
      });
      setOpen(false);
      reset();
      onUploaded("تمت إضافة الصورة إلى المنتج بنجاح.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذّرت إضافة الصورة. حاول مرة أخرى.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>الوسائط</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <ImagePlus className="h-4 w-4" />
          إضافة صورة عبر رابط
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground">
          أضف صورة إلى هذا المنتج عبر رابط مباشر، مع خيار تعيينها كصورة رئيسية.
        </p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة صورة عبر رابط</DialogTitle>
            <DialogDescription>
              أدخل رابط الصورة المباشر ليتم رفعها وربطها بالمنتج.
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

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="media-url">رابط الصورة</Label>
              <Input
                id="media-url"
                dir="ltr"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="media-alt">النص البديل (اختياري)</Label>
              <Input
                id="media-alt"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="وصف الصورة"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="media-featured">تعيين كصورة رئيسية</Label>
              <Switch
                id="media-featured"
                checked={asFeatured}
                onCheckedChange={setAsFeatured}
                aria-label="تعيين كصورة رئيسية"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => void handleUpload()}
              disabled={uploading || sourceUrl.trim().length === 0}
            >
              {uploading ? "جارٍ الرفع…" : "رفع"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={uploading}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
