import { useNavigate } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ProductForm,
  type ProductFormValues,
} from "@/components/products/ProductForm";
import { createProduct } from "@/lib/products-api";

function toInput(values: ProductFormValues) {
  return {
    name: values.name,
    shortDescription: values.shortDescription || null,
    description: values.description || null,
    price: values.price,
    stockQuantity: values.stockQuantity,
    status: values.status,
    imageUrl: values.imageUrl || null,
  };
}

export function ProductCreatePage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("products.create");

  async function handleSubmit(values: ProductFormValues) {
    const created = await createProduct(toInput(values));
    navigate(`/products/${created.id}`);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="منتج جديد"
        description="أضف منتجًا جديدًا إلى كتالوجك."
        actions={
          <Button variant="outline" onClick={() => navigate("/products")}>
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        }
      />

      {!canCreate ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «إنشاء المنتجات» لإضافة منتج جديد."
        />
      ) : (
        <Card className="max-w-3xl">
          <CardContent className="pt-6">
            <ProductForm
              submitLabel="حفظ المنتج"
              onSubmit={handleSubmit}
              onCancel={() => navigate("/products")}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
