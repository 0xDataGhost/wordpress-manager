import { Lock, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { groupPermissionsByModule } from "@/components/team/permission-catalog";
import type { RoleDto } from "@/lib/roles-api";

interface RoleDetailsDialogProps {
  /** Role to show, or null when the dialog is closed. */
  role: RoleDto | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Read-only details for one role: its description and the permissions it grants,
 * grouped by module. The backend exposes no role-edit endpoints, so every
 * permission is shown as a static badge — there are deliberately no edit controls.
 */
export function RoleDetailsDialog({ role, onOpenChange }: RoleDetailsDialogProps) {
  const open = role !== null;
  const groups = role ? groupPermissionsByModule(role.permissions) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {role?.name ?? "تفاصيل الدور"}
          </DialogTitle>
          <DialogDescription>
            {role?.description?.trim() || "لا يوجد وصف لهذا الدور."}
          </DialogDescription>
        </DialogHeader>

        {role ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {role.permissions.length} صلاحية
              </Badge>
              {role.isSystem ? (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" />
                  دور نظامي — للقراءة فقط
                </Badge>
              ) : (
                <Badge variant="default">دور مخصّص</Badge>
              )}
            </div>

            {groups.length === 0 ? (
              <EmptyState
                title="لا توجد صلاحيات"
                description="هذا الدور لا يملك أي صلاحيات حالياً."
              />
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div
                    key={group.moduleKey}
                    className="rounded-lg border bg-card/50 p-3"
                  >
                    <h4 className="mb-2 text-sm font-semibold">
                      {group.moduleLabel}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {group.permissions.map((perm) => (
                        <Badge key={perm.key} variant="secondary">
                          {perm.actionLabel}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
