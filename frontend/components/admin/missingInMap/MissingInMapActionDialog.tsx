import { useState, useEffect } from "react";
import Link from "next/link";
import { LocationSearch } from "@/components/features/navigation/LocationSearch";
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
  onConfirm: (selectedNodeId?: number, startNodeId?: number, endNodeId?: number) => void;
};

export function MissingInMapActionDialog({
  pendingAction,
  actionMeta,
  isSubmitting,
  onClose,
  onConfirm,
}: MissingInMapActionDialogProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | undefined>(undefined);
  const [selectedName, setSelectedName] = useState<string>("");

  const [startNodeId, setStartNodeId] = useState<number | undefined>(undefined);
  const [startName, setStartName] = useState<string>("");
  const [endNodeId, setEndNodeId] = useState<number | undefined>(undefined);
  const [endName, setEndName] = useState<string>("");

  useEffect(() => {
    if (!pendingAction) {
      setSelectedNodeId(undefined);
      setSelectedName("");
      setStartNodeId(undefined);
      setStartName("");
      setEndNodeId(undefined);
      setEndName("");
    }
  }, [pendingAction]);

  const isConfirmDisabled =
    isSubmitting ||
    (pendingAction?.type === "add-location" && !selectedNodeId) ||
    (pendingAction?.type === "draw-route" && (!startNodeId || !endNodeId));

  const handleConfirm = () => {
    if (pendingAction?.type === "add-location") {
      onConfirm(selectedNodeId);
    } else if (pendingAction?.type === "draw-route") {
      onConfirm(undefined, startNodeId, endNodeId);
    } else {
      onConfirm();
    }
  };

  return (
    <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={!isSubmitting} className="max-w-md rounded-md border border-slate-200 bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-text-main">{actionMeta?.actionLabel}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{actionMeta?.description}</DialogDescription>
        </DialogHeader>

        <div className="border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 font-mono">
          {pendingAction?.displayId}
        </div>

        {pendingAction?.type === "add-location" && (
          <div className="flex flex-col gap-2 my-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Chọn điểm liên kết trên bản đồ:
            </label>
            <LocationSearch
              value={selectedName}
              selectedNodeId={selectedNodeId}
              onChange={(val, nodeId) => {
                setSelectedName(val);
                setSelectedNodeId(nodeId);
              }}
              icon="none"
              placeholder="Nhập tên điểm hoặc chọn..."
            />
            <div className="text-xs text-slate-500 mt-1">
              Chưa có điểm này?{" "}
              <Link
                href="/navigation/editor"
                className="text-primary font-semibold hover:underline"
              >
                Đi đến Editor để tạo mới
              </Link>
            </div>
          </div>
        )}

        {pendingAction?.type === "draw-route" && (
          <div className="flex flex-col gap-4 my-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Chọn điểm bắt đầu:
              </label>
              <LocationSearch
                value={startName}
                selectedNodeId={startNodeId}
                onChange={(val, nodeId) => {
                  setStartName(val);
                  setStartNodeId(nodeId);
                }}
                icon="origin"
                placeholder="Nhập tên điểm bắt đầu hoặc chọn..."
              />
              <div className="text-xs text-slate-500 mt-1">
                Chưa có điểm này?{" "}
                <Link
                  href="/navigation/editor"
                  className="text-primary font-semibold hover:underline"
                >
                  Đi đến Editor để tạo mới
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Chọn điểm kết thúc:
              </label>
              <LocationSearch
                value={endName}
                selectedNodeId={endNodeId}
                onChange={(val, nodeId) => {
                  setEndName(val);
                  setEndNodeId(nodeId);
                }}
                icon="destination"
                placeholder="Nhập tên điểm kết thúc hoặc chọn..."
              />
              <div className="text-xs text-slate-500 mt-1">
                Chưa có điểm này?{" "}
                <Link
                  href="/navigation/editor"
                  className="text-primary font-semibold hover:underline"
                >
                  Đi đến Editor để tạo mới
                </Link>
              </div>
            </div>
          </div>
        )}

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
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang xử lý..." : "Xác nhận"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



