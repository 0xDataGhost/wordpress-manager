import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <ProductForm
            submitLabel="حفظ المنتج"
            onSubmit={handleSubmit}
            onCancel={() => navigate("/products")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
