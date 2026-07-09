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
import { Textarea } from "@/components/ui/textarea";
import type {
  Taxonomy,
  TaxonomyTermDto,
  TaxonomyTermInput,
} from "@/lib/catalog-api";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type TaxonomyTermDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taxonomy: Taxonomy;
  /** The term being edited, or null when creating a new one. */
  term: TaxonomyTermDto | null;
  /** Loaded categories, used to populate the parent select (categories only). */
  parentOptions: TaxonomyTermDto[];
  loading: boolean;
  errorMessage: string | null;
  onSubmit: (input: TaxonomyTermInput) => void;
};

export function TaxonomyTermDialog({
  open,
  onOpenChange,
  taxonomy,
  term,
  parentOptions,
  loading,
  errorMessage,
  onSubmit,
}: TaxonomyTermDialogProps) {
  const isEdit = term !== null;
  const isCategory = taxonomy === "categories";

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [parentWpId, setParentWpId] = useState("");

  // Re-seed the fields whenever the dialog opens or the target term changes.
  useEffect(() => {
    if (!open) return;
    setName(term?.name ?? "");
    setSlug(term?.slug ?? "");
    setDescription(term?.description ?? "");
    setParentWpId(term?.parentWpId != null ? String(term.parentWpId) : "");
  }, [open, term]);

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const input: TaxonomyTermInput = {
      name: trimmedName,
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
    };
    if (isCategory) {
      input.parentWpId = parentWpId ? Number(parentWpId) : null;
    }
    onSubmit(input);
  }

  // A category cannot be its own parent.
  const parentChoices = parentOptions.filter(
    (option) => option.wpTermId != null && option.id !== term?.id,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل العنصر" : "إضافة عنصر"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "عدّل بيانات العنصر ثم احفظ."
              : "أدخل بيانات العنصر الجديد."}
          </DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="term-name">الاسم</Label>
            <Input
              id="term-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم العنصر"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="term-slug">
              المُعرّف اللطيف (اختياري)
            </Label>
            <Input
              id="term-slug"
              dir="ltr"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug"
            />
          </div>

          {isCategory ? (
            <div className="space-y-2">
              <Label htmlFor="term-parent">التصنيف الأب (اختياري)</Label>
              <select
                id="term-parent"
                value={parentWpId}
                onChange={(e) => setParentWpId(e.target.value)}
                className={selectClass}
              >
                <option value="">بدون أب</option>
                {parentChoices.map((option) => (
                  <option key={option.id} value={String(option.wpTermId)}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="term-description">الوصف (اختياري)</Label>
            <Textarea
              id="term-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف موجز"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading || name.trim().length === 0}
          >
            {loading ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
