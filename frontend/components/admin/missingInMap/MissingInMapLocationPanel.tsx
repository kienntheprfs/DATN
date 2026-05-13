"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MissingInMapActionDialog } from "./MissingInMapActionDialog";
import { MissingInMapDetailModal } from "./MissingInMapDetailModal";
import { MissingInMapControls } from "./MissingInMapControls";
import { MissingInMapLocationTable } from "./MissingInMapLocationTable";
import { MissingInMapPagination } from "./MissingInMapPagination";
import { MissingInMapStats } from "./MissingInMapStats";
import { getActionMeta } from "./MissingInMapUtils";
import type {
  LocationRow,
  MissingInMapStatsData,
  PendingAction,
  Status,
  StatusFilterOption,
  TabKey,
  TimeFilter,
  TimeFilterOption,
} from "./MissingInMapTypes";
import { missingInMapApi } from "@/services";

const PAGE_SIZE = 5;
const LOCATION_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "PENDING", label: "Chờ xử lý" },
  // { value: "IN_PROGRESS", label: "Đang xử lý" },
  { value: "RESOLVED", label: "Đã xử lý" },
  { value: "REMOVED", label: "Đã loại bỏ" },
];

const TIME_FILTER_OPTIONS: TimeFilterOption[] = [
  { value: "all", label: "Tất cả thời gian" },
  { value: "1d", label: "Trong 24 giờ qua" },
  { value: "1w", label: "Trong 1 tuần qua" },
  { value: "2w", label: "Trong 2 tuần qua" },
  { value: "1m", label: "Trong 1 tháng qua" },
];

function mapLocationStatus(status: string): Status {
  if (status === "approved") {
    return "IN_PROGRESS";
  }
  if (status === "resolved") {
    return "RESOLVED";
  }
  if (status === "rejected") {
    return "REMOVED";
  }
  return "PENDING";
}

function formatFloor(floor: number | null): string {
  if (floor === null || floor === undefined) {
    return "--";
  }
  return `FL-${String(floor).padStart(2, "0")}`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

type MissingInMapLocationPanelProps = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export function MissingInMapLocationPanel({ activeTab, onTabChange }: MissingInMapLocationPanelProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("1m");
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [detailRow, setDetailRow] = useState<LocationRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const locationsQuery = useQuery({
    queryKey: ["missing-locations"],
    queryFn: () => missingInMapApi.listLocations({ limit: 500 }),
  });

  const locationStatsQuery = useQuery({
    queryKey: ["missing-location-stats"],
    queryFn: () => missingInMapApi.getLocationStats(),
  });

  const routeStatsQuery = useQuery({
    queryKey: ["missing-route-stats"],
    queryFn: () => missingInMapApi.getRouteStats(),
  });

  const updateLocationStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: any; note?: string }) =>
      missingInMapApi.updateLocationStatus(id, status, note),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["missing-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["missing-location-stats"] }),
      ]);
    },
  });

  function showActionSuccess(actionType: PendingAction["type"]) {
    if (actionType === "add-location") {
      toast.success("Đã cập nhật địa điểm thành công.");
      return;
    }

    if (actionType === "remove") {
      toast.success("Đã loại bỏ yêu cầu thành công.");
    }
  }

  const rows = useMemo<LocationRow[]>(() => {
    const data = locationsQuery.data ?? [];
    return data.map((item) => ({
      rowId: item.id,
      id: `#LOC-${String(item.id).padStart(4, "0")}`,
      name: item.name,
      buildingName: item.building_name ?? "--",
      floor: formatFloor(item.floor_level),
      requestedBy: item.requested_by ?? "Ẩn danh",
      requesterRole: "SV",
      adminNote: item.admin_note ?? item.description ?? "--",
      createdAt: formatDateTime(item.created_at),
      status: mapLocationStatus(item.status),
    }));
  }, [locationsQuery.data]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();

    return rows.filter((row) => {
      // Search filter
      const matchesSearch =
        query.length === 0 ||
        row.id.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.buildingName.toLowerCase().includes(query) ||
        row.requestedBy.toLowerCase().includes(query) ||
        row.adminNote.toLowerCase().includes(query);

      // Status filter
      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;

      // Time filter
      let matchesTime = true;
      if (timeFilter !== "all") {
        // We need to use the original data's createdAt for accurate filtering
        const originalItem = locationsQuery.data?.find((item) => item.id === row.rowId);
        if (originalItem?.created_at) {
          const createdAt = new Date(originalItem.created_at);
          const diffMs = now.getTime() - createdAt.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);

          if (timeFilter === "1d") matchesTime = diffDays <= 1;
          else if (timeFilter === "1w") matchesTime = diffDays <= 7;
          else if (timeFilter === "2w") matchesTime = diffDays <= 14;
          else if (timeFilter === "1m") matchesTime = diffDays <= 30;
        }
      }

      return matchesSearch && matchesStatus && matchesTime;
    });
  }, [rows, search, statusFilter, timeFilter, locationsQuery.data]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, pageCount);

  const pageRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safeCurrentPage]);

  const rangeStart = pageRows.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = pageRows.length === 0 ? 0 : rangeStart + pageRows.length - 1;

  const locationTotal = locationStatsQuery.data?.total ?? rows.length;
  const routeTotal = routeStatsQuery.data?.total ?? 0;

  const locationStats: MissingInMapStatsData = {
    total: locationStatsQuery.data?.total ?? rows.length,
    pending: locationStatsQuery.data?.pending ?? 0,
    resolved: locationStatsQuery.data?.resolved ?? 0,
    inProgress: locationStatsQuery.data?.approved ?? 0,
    removed: locationStatsQuery.data?.rejected ?? 0,
  };

  const actionMeta = useMemo(() => getActionMeta(pendingAction), [pendingAction]);

  async function confirmAction() {
    if (!pendingAction) {
      return;
    }

    setActionError(null);

    try {
      if (pendingAction.type === "add-location") {
        await updateLocationStatusMutation.mutateAsync({
          id: pendingAction.rowId,
          status: "resolved",
          note: "Đã chuyển cho đội bản đồ xử lý.",
        });
        showActionSuccess(pendingAction.type);
        router.push("/navigation/editor");
      }

      if (pendingAction.type === "remove") {
        await updateLocationStatusMutation.mutateAsync({
          id: pendingAction.rowId,
          status: "rejected",
          note: "Đã loại bỏ theo xác nhận của quản trị viên.",
        });
        showActionSuccess(pendingAction.type);
      }

      setPendingAction(null);
    } catch {
      setActionError("Không thể cập nhật yêu cầu. Vui lòng thử lại.");
      toast.error("Không thể cập nhật địa điểm. Vui lòng thử lại.");
    }
  }

  const isSubmitting = updateLocationStatusMutation.isPending;
  const isLoading = locationsQuery.isLoading || locationStatsQuery.isLoading;

  return (
    <>
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-140">
        <MissingInMapControls
          activeTab={activeTab}
          locationTotal={locationTotal}
          routeTotal={routeTotal}
          search={search}
          statusFilter={statusFilter}
          statusOptions={LOCATION_STATUS_OPTIONS}
          timeFilter={timeFilter}
          timeOptions={TIME_FILTER_OPTIONS}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          totalResults={filteredRows.length}
          isLoading={isLoading}
          onTabChange={onTabChange}
          onSearchChange={(value) => {
            setSearch(value);
            setCurrentPage(1);
          }}
          onStatusFilterChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
          onTimeFilterChange={(value) => {
            setTimeFilter(value);
            setCurrentPage(1);
          }}
        />

        {locationsQuery.isError && (
          <div className="mx-4 mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Không thể tải danh sách địa điểm thiếu. Vui lòng thử lại.
            <button
              type="button"
              onClick={() => locationsQuery.refetch()}
              className="ml-3 font-semibold underline decoration-red-400 underline-offset-2"
            >
              Tải lại
            </button>
          </div>
        )}

        {actionError && (
          <div className="mx-4 mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
        )}

        <div className="overflow-x-auto flex-1">
          <MissingInMapLocationTable
            rows={pageRows}
            isSubmitting={isSubmitting}
            pendingActionId={pendingAction?.rowId ?? null}
            isLoading={locationsQuery.isLoading}
            onAddLocation={(row) => setPendingAction({ rowId: row.rowId, displayId: row.id, type: "add-location" })}
            onRemove={(row) => setPendingAction({ rowId: row.rowId, displayId: row.id, type: "remove" })}
            onRowClick={(row) => setDetailRow(row)}
          />
        </div>

        <MissingInMapPagination
          safeCurrentPage={safeCurrentPage}
          pageCount={pageCount}
          onPageChange={setCurrentPage}
        />
      </div>

      <MissingInMapStats
        activeTab={activeTab}
        stats={locationStats}
        isLoading={isLoading}
      />

      <MissingInMapActionDialog
        pendingAction={pendingAction}
        actionMeta={actionMeta}
        isSubmitting={isSubmitting}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmAction}
      />

      <MissingInMapDetailModal
        isOpen={!!detailRow}
        onClose={() => setDetailRow(null)}
        data={detailRow}
        type="location"
      />
    </>
  );
}
