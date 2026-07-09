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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/http";
import {
  updateCustomerWp,
  type CustomerAddressDto,
  type CustomerDetailsDto,
  type CustomerWpUpdateInput,
} from "@/lib/customers-api";

/** Address fields the dialog edits, in display order. */
const ADDRESS_FIELDS: readonly { key: keyof AddressState; label: string }[] = [
  { key: "firstName", label: "الاسم الأول" },
  { key: "lastName", label: "اسم العائلة" },
  { key: "company", label: "الشركة" },
  { key: "address1", label: "العنوان" },
  { key: "address2", label: "تفاصيل إضافية" },
  { key: "city", label: "المدينة" },
  { key: "state", label: "المنطقة" },
  { key: "postcode", label: "الرمز البريدي" },
  { key: "country", label: "الدولة (رمز ISO)" },
  { key: "phone", label: "الهاتف" },
  { key: "email", label: "البريد الإلكتروني" },
];

type AddressState = Required<{
  [K in keyof CustomerAddressDto]: string;
}>;

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  billing: AddressState;
  shipping: AddressState;
}

interface CustomerEditDialogProps {
  open: boolean;
  customer: CustomerDetailsDto;
  onOpenChange: (open: boolean) => void;
  /** Called with the refreshed top-level customer fields on a successful save. */
  onSaved: (updated: {
    name: string;
    phone: string | null;
    billing: CustomerAddressDto | null;
    shipping: CustomerAddressDto | null;
  }) => void;
}

const EMPTY_ADDRESS: AddressState = {
  firstName: "",
  lastName: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postcode: "",
  country: "",
  phone: "",
  email: "",
};

/** Split a "First Last" display name into first/last for prefilling. */
function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (trimmed === "") return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  const [first, ...rest] = parts;
  return { firstName: first, lastName: rest.join(" ") };
}

/** Prefill an address form from the (possibly null) synced address. */
function toAddressState(address: CustomerAddressDto | null): AddressState {
  if (!address) return { ...EMPTY_ADDRESS };
  return {
    firstName: address.firstName ?? "",
    lastName: address.lastName ?? "",
    company: address.company ?? "",
    address1: address.address1 ?? "",
    address2: address.address2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postcode: address.postcode ?? "",
    country: address.country ?? "",
    phone: address.phone ?? "",
    email: address.email ?? "",
  };
}

/**
 * Build an address payload from filled fields only. Returns `undefined` when
 * every field is blank so the key is omitted from the request body.
 */
function toAddressPayload(state: AddressState): CustomerAddressDto | undefined {
  const entries = (Object.keys(state) as (keyof AddressState)[])
    .map((key) => [key, state[key].trim()] as const)
    .filter(([, value]) => value !== "");
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as CustomerAddressDto;
}

export function CustomerEditDialog({
  open,
  customer,
  onOpenChange,
  onSaved,
}: CustomerEditDialogProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(customer));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialState(customer));
    setError(null);
    setSubmitting(false);
  }, [open, customer]);

  function setTop<K extends "firstName" | "lastName" | "phone">(
    key: K,
    value: string,
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setAddress(
    scope: "billing" | "shipping",
    key: keyof AddressState,
    value: string,
  ) {
    setForm((prev) => ({
      ...prev,
      [scope]: { ...prev[scope], [key]: value },
    }));
  }

  async function handleSubmit() {
    setError(null);

    const body: CustomerWpUpdateInput = {};
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const phone = form.phone.trim();
    if (firstName !== "") body.firstName = firstName;
    if (lastName !== "") body.lastName = lastName;
    if (phone !== "") body.phone = phone;

    const billing = toAddressPayload(form.billing);
    const shipping = toAddressPayload(form.shipping);
    if (billing) body.billing = billing;
    if (shipping) body.shipping = shipping;

    if (Object.keys(body).length === 0) {
      setError("لا توجد بيانات لتحديثها — عدّل حقلاً واحداً على الأقل.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateCustomerWp(customer.id, body);
      onSaved({
        name: updated.name,
        phone: updated.phone,
        billing: updated.billing,
        shipping: updated.shipping,
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          "تم تعديل العميل في ووردبريس — حدّث الصفحة وحاول مجدداً",
        );
      } else {
        setError(
          err instanceof Error ? err.message : "تعذّر تعديل بيانات العميل.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات العميل</DialogTitle>
          <DialogDescription>
            تُحفظ التعديلات في ملف العميل داخل متجر ووردبريس.
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

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">البيانات الأساسية</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-first">الاسم الأول</Label>
                <Input
                  id="cust-first"
                  value={form.firstName}
                  onChange={(e) => setTop("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-last">اسم العائلة</Label>
                <Input
                  id="cust-last"
                  value={form.lastName}
                  onChange={(e) => setTop("lastName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">الهاتف</Label>
                <Input
                  id="cust-phone"
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => setTop("phone", e.target.value)}
                />
              </div>
            </div>
          </section>

          <AddressFieldset
            legend="عنوان الفوترة"
            scope="billing"
            state={form.billing}
            onChange={setAddress}
          />
          <AddressFieldset
            legend="عنوان الشحن"
            scope="shipping"
            state={form.shipping}
            onChange={setAddress}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? "جارٍ الحفظ…" : "حفظ"}
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

function buildInitialState(customer: CustomerDetailsDto): FormState {
  const nameParts = splitName(customer.name);
  return {
    firstName: customer.billing?.firstName ?? nameParts.firstName,
    lastName: customer.billing?.lastName ?? nameParts.lastName,
    phone: customer.phone ?? customer.billing?.phone ?? "",
    billing: toAddressState(customer.billing),
    shipping: toAddressState(customer.shipping),
  };
}

interface AddressFieldsetProps {
  legend: string;
  scope: "billing" | "shipping";
  state: AddressState;
  onChange: (
    scope: "billing" | "shipping",
    key: keyof AddressState,
    value: string,
  ) => void;
}

function AddressFieldset({
  legend,
  scope,
  state,
  onChange,
}: AddressFieldsetProps) {
  const ltrKeys: ReadonlySet<keyof AddressState> = new Set([
    "phone",
    "email",
    "postcode",
    "country",
  ]);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{legend}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ADDRESS_FIELDS.map((field) => {
          const inputId = `${scope}-${field.key}`;
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                dir={ltrKeys.has(field.key) ? "ltr" : undefined}
                value={state[field.key]}
                onChange={(e) => onChange(scope, field.key, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
