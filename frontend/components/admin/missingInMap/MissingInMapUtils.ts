import type { PendingAction, Status } from "./MissingInMapTypes";

export function formatStatus(status: Status) {
  if (status === "IN_PROGRESS") {
    return "IN PROGRESS";
  }
  if (status === "RESOLVED") {
    return "ĐÃ XỬ LÝ";
  }
  if (status === "REMOVED") {
    return "ĐÃ LOẠI BỎ";
  }
  return status;
}

export function statusClasses(status: Status) {
  if (status === "PENDING") {
    return "bg-amber-100 text-amber-700 border border-amber-200";
  }
  if (status === "IN_PROGRESS") {
    return "bg-blue-100 text-blue-700 border border-blue-200";
  }
  if (status === "RESOLVED") {
    return "bg-green-600 text-white border border-green-700";
  }
  return "bg-slate-500 text-white border border-slate-600";
}

export function getActionMeta(pendingAction: PendingAction | null) {
  if (!pendingAction) {
    return null;
  }

  const actionLabel =
    pendingAction.type === "add-location"
      ? "Thêm địa điểm"
      : pendingAction.type === "draw-route"
        ? "Vẽ tuyến đường"
        : "Loại bỏ";

  return {
    actionLabel,
    description:
      pendingAction.type === "remove"
        ? "Yêu cầu này sẽ được chuyển sang trạng thái ĐÃ LOẠI BỎ và ẩn khỏi danh sách xử lý chính."
        : "Yêu cầu sẽ được chuyển trạng thái để đội vận hành tiếp tục xử lý trên bản đồ số.",
  };
}
