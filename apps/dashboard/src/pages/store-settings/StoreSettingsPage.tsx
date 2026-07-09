import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/components/auth/AuthProvider";
import { SettingsGroupForm } from "./SettingsGroupForm";
import { GENERAL_FIELDS, PRODUCTS_FIELDS } from "./settings-fields";
import { TaxesTab } from "./TaxesTab";
import { ShippingTab } from "./ShippingTab";
import { GatewaysTab } from "./GatewaysTab";

/** The five store-settings surfaces, in display order. */
const TAB_VALUES = [
  "general",
  "products",
  "taxes",
  "shipping",
  "gateways",
] as const;

type StoreSettingsTab = (typeof TAB_VALUES)[number];

const TAB_LABELS: Record<StoreSettingsTab, string> = {
  general: "عام",
  products: "المنتجات",
  taxes: "الضرائب",
  shipping: "الشحن",
  gateways: "بوابات الدفع",
};

export function StoreSettingsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("store_settings.view");
  const canManageSettings = hasPermission("store_settings.manage");
  const canManageShipping = hasPermission("shipping.manage");
  const canManageTaxes = hasPermission("taxes.manage");
  const canToggleGateways = hasPermission("gateways.toggle");

  const [activeTab, setActiveTab] = useState<StoreSettingsTab>("general");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="إعدادات المتجر"
        description="أدر إعدادات ووكومرس: العام والمنتجات والضرائب والشحن وبوابات الدفع."
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض إعدادات المتجر»."
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="أقسام إعدادات المتجر"
            className="mb-4 inline-flex rounded-lg border bg-card p-1"
          >
            {TAB_VALUES.map((value) => {
              const isActive = value === activeTab;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(value)}
                  className={
                    isActive
                      ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {TAB_LABELS[value]}
                </button>
              );
            })}
          </div>

          {/* Remount on tab change so each surface owns fresh load/save state. */}
          <StoreSettingsTabPanel
            key={activeTab}
            tab={activeTab}
            canManageSettings={canManageSettings}
            canManageShipping={canManageShipping}
            canManageTaxes={canManageTaxes}
            canToggleGateways={canToggleGateways}
          />
        </>
      )}
    </div>
  );
}

function StoreSettingsTabPanel({
  tab,
  canManageSettings,
  canManageShipping,
  canManageTaxes,
  canToggleGateways,
}: {
  tab: StoreSettingsTab;
  canManageSettings: boolean;
  canManageShipping: boolean;
  canManageTaxes: boolean;
  canToggleGateways: boolean;
}) {
  switch (tab) {
    case "general":
      return (
        <SettingsGroupForm
          group="general"
          fields={GENERAL_FIELDS}
          canManage={canManageSettings}
          title="الإعدادات العامة"
          description="عنوان المتجر والعملة وتنسيق الأسعار"
        />
      );
    case "products":
      return (
        <SettingsGroupForm
          group="products"
          fields={PRODUCTS_FIELDS}
          canManage={canManageSettings}
          title="إعدادات المنتجات"
          description="الوحدات والتقييمات والمخزون"
        />
      );
    case "taxes":
      return <TaxesTab canManage={canManageTaxes} />;
    case "shipping":
      return <ShippingTab canManage={canManageShipping} />;
    case "gateways":
      return <GatewaysTab canToggle={canToggleGateways} />;
  }
}
