import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PendingAction } from "./MissingInMapTypes";

type ActionMeta = {
  actionLabel: string;
  description: string;
};

type MissingInMapActionDialogProps = {
  pendingAction: PendingAction | null;
  actionMeta: ActionMeta | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function MissingInMapActionDialog({
  pendingAction,
  actionMeta,
  isSubmitting,
  onClose,
  onConfirm,
}: MissingInMapActionDialogProps) {
  return (
    <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={!isSubmitting} className="max-w-md rounded-md border border-slate-200 bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-text-main">{actionMeta?.actionLabel}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{actionMeta?.description}</DialogDescription>
        </DialogHeader>

        <div className="border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {pendingAction?.displayId}
        </div>

        <DialogFooter className="mt-2 gap-2 border-0 bg-transparent p-0 pt-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang xử lý..." : "Xác nhận"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
