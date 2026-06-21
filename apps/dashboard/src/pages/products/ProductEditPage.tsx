import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ProductForm,
  type ProductFormValues,
} from "@/components/products/ProductForm";
import { getProduct, updateProduct, type ProductDto } from "@/lib/products-api";

function toDefaults(product: ProductDto): Partial<ProductFormValues> {
  return {
    name: product.name,
    shortDescription: product.shortDescription ?? "",
    description: product.description ?? "",
    price: Number(product.price),
    stockQuantity: product.stockQuantity,
    status: product.status,
    imageUrl: product.imageUrl ?? "",
  };
}

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      setProduct(await getProduct(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(values: ProductFormValues) {
    if (!id) return;
    await updateProduct(id, {
      name: values.name,
      shortDescription: values.shortDescription || null,
      description: values.description || null,
      price: values.price,
      stockQuantity: values.stockQuantity,
      status: values.status,
      imageUrl: values.imageUrl || null,
    });
    navigate(`/products/${id}`);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="تعديل المنتج"
        description="حدّث بيانات المنتج."
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(id ? `/products/${id}` : "/products")}
          >
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
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
        <Card className="max-w-3xl">
          <CardContent className="pt-6">
            <ProductForm
              defaultValues={toDefaults(product)}
              submitLabel="حفظ التغييرات"
              onSubmit={handleSubmit}
              onCancel={() => navigate(`/products/${product.id}`)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
