import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Pencil, UploadCloud, Archive } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRODUCT_STATUS_META } from "@/components/products/product-status";
import { DigitalFulfillmentSummary } from "@/components/products/DigitalFulfillmentSummary";
import { ProductMediaSection } from "@/components/catalog/ProductMediaSection";
import { ProductVariationsSection } from "@/components/catalog/ProductVariationsSection";
import { ProductWpDeleteSection } from "@/components/catalog/ProductWpDeleteSection";
import {
  archiveProduct,
  getProduct,
  publishProduct,
  type ProductDto,
} from "@/lib/products-api";
import {
  getDigitalSettings,
  type DigitalSettingsDto,
} from "@/lib/digital-products-api";
import { formatDateTime } from "@/lib/utils";

type Banner = { tone: "success" | "error"; message: string };

function formatPrice(price: string): string {
  const value = Number(price);
  if (Number.isNaN(value)) return price;
  return `${value.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ر.س`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

export function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("products.edit");
  const canArchive = hasPermission("products.delete");
  const canDelete = hasPermission("products.delete");
  const canManageMedia = hasPermission("products.manage_media");
  const canViewDigital = hasPermission("digital_inventory.view");
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [digital, setDigital] = useState<DigitalSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    // Product is critical; digital settings are best-effort (an empty/failed
    // digital read must not break the details page). Fetched in parallel.
    const [productResult, digitalResult] = await Promise.allSettled([
      getProduct(id),
      canViewDigital ? getDigitalSettings(id) : Promise.resolve(null),
    ]);
    if (productResult.status === "fulfilled") {
      setProduct(productResult.value);
      setDigital(
        digitalResult.status === "fulfilled" ? digitalResult.value : null,
      );
    } else {
      setError(true);
    }
    setLoading(false);
  }, [id, canViewDigital]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePublish() {
    if (!id) return;
    setPublishing(true);
    setBanner(null);
    try {
      const result = await publishProduct(id);
      // Reflect the WooCommerce id and refreshed sync time immediately.
      setProduct(result.product);
      setBanner({
        tone: "success",
        message: result.wpProductId
          ? `تم نشر المنتج إلى ووكومرس بنجاح (المعرّف #${result.wpProductId}).`
          : "تم نشر المنتج إلى ووكومرس بنجاح.",
      });
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "تعذّر نشر المنتج.",
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    if (!id) return;
    setArchiving(true);
    try {
      const updated = await archiveProduct(id);
      setProduct(updated);
      setArchiveOpen(false);
      setBanner({ tone: "success", message: "تم أرشفة المنتج." });
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "تعذّر أرشفة المنتج.",
      });
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={product?.name ?? "تفاصيل المنتج"}
        description="عرض تفاصيل المنتج وإدارته."
        actions={
          <>
            {digital?.is_enabled ? <Badge variant="success">رقمي</Badge> : null}
            <Button variant="outline" onClick={() => navigate("/products")}>
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Button>
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error || !product ? (
        <ErrorState
          description="تعذّر تحميل المنتج. يرجى المحاولة مرة أخرى."
          onRetry={() => void load()}
        />
      ) : (
        <div className="space-y-4">
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

          {canEdit || canArchive ? (
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button asChild>
                    <Link to={`/products/${product.id}/edit`}>
                      <Pencil className="h-4 w-4" />
                      تعديل
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handlePublish()}
                    disabled={publishing}
                  >
                    <UploadCloud className="h-4 w-4" />
                    نشر إلى ووكومرس
                  </Button>
                </>
              ) : null}
              {canArchive ? (
                <Button
                  variant="outline"
                  onClick={() => setArchiveOpen(true)}
                  disabled={product.status === "archived"}
                >
                  <Archive className="h-4 w-4" />
                  أرشفة
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              لديك صلاحية العرض فقط لهذا المنتج.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>البيانات الأساسية</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <DetailRow label="الاسم">{product.name}</DetailRow>
                <DetailRow label="الحالة">
                  <StatusBadge
                    label={PRODUCT_STATUS_META[product.status].label}
                    tone={PRODUCT_STATUS_META[product.status].tone}
                  />
                </DetailRow>
                <DetailRow label="السعر">
                  <span dir="ltr">{formatPrice(product.price)}</span>
                </DetailRow>
                <DetailRow label="المخزون">{product.stockQuantity}</DetailRow>
                <DetailRow label="الوصف المختصر">
                  {product.shortDescription || "—"}
                </DetailRow>
                <DetailRow label="الوصف الكامل">
                  {product.description || "—"}
                </DetailRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>المزامنة والصورة</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="mb-4 overflow-hidden rounded-md border bg-muted/30">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center text-sm text-muted-foreground">
                      لا توجد صورة
                    </div>
                  )}
                </div>
                <DetailRow label="معرّف ووكومرس">
                  {product.wpProductId ? (
                    <span dir="ltr">#{product.wpProductId}</span>
                  ) : (
                    "غير منشور"
                  )}
                </DetailRow>
                <DetailRow label="آخر مزامنة">
                  {formatDateTime(product.lastSyncedAt)}
                </DetailRow>
                <DetailRow label="أُنشئ في">
                  {formatDateTime(product.createdAt)}
                </DetailRow>
                <DetailRow label="آخر تحديث">
                  {formatDateTime(product.updatedAt)}
                </DetailRow>
              </CardContent>
            </Card>
          </div>

          {canViewDigital && digital ? (
            <DigitalFulfillmentSummary settings={digital} />
          ) : null}

          {/* Catalog-control actions (Phase 26) — only for products linked to
              WooCommerce, since they act on the store entity directly. */}
          {product.wpProductId != null ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {canManageMedia ? (
                <ProductMediaSection
                  wpProductId={product.wpProductId}
                  onUploaded={(message) => {
                    setBanner({ tone: "success", message });
                    void load();
                  }}
                />
              ) : null}
              {canEdit ? (
                <ProductVariationsSection
                  productId={product.id}
                  onMessage={(tone, message) => setBanner({ tone, message })}
                />
              ) : null}
              {canDelete ? (
                <div className="lg:col-span-2">
                  <ProductWpDeleteSection
                    productId={product.id}
                    onDeleted={(updated) => {
                      setProduct(updated);
                      setBanner({
                        tone: "success",
                        message: "تم حذف المنتج من ووردبريس.",
                      });
                    }}
                    onError={(message) => setBanner({ tone: "error", message })}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="أرشفة المنتج"
        description="سيتم نقل المنتج إلى الأرشيف ولن يظهر كمنتج نشط. يمكنك إعادة تفعيله لاحقًا بتعديل حالته."
        confirmLabel="أرشفة"
        destructive
        loading={archiving}
        onConfirm={() => void handleArchive()}
      />
    </div>
  );
}
