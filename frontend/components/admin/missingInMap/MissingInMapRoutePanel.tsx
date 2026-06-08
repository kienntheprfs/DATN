"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MissingInMapActionDialog } from "./MissingInMapActionDialog";
import { MissingInMapDetailModal } from "./MissingInMapDetailModal";
import { MissingInMapControls } from "./MissingInMapControls";
import { MissingInMapPagination } from "./MissingInMapPagination";
import { MissingInMapRouteTable } from "./MissingInMapRouteTable";
import { MissingInMapStats } from "./MissingInMapStats";
import { getActionMeta } from "./MissingInMapUtils";
import type {
  MissingInMapStatsData,
  PendingAction,
  RouteRow,
  Status,
  StatusFilterOption,
  TabKey,
  TimeFilter,
  TimeFilterOption,
} from "./MissingInMapTypes";
import { missingInMapApi, wayfindingApi } from "@/services";

const PAGE_SIZE = 5;
const ROUTE_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "PENDING", label: "Chờ xử lý" },
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

function mapRouteStatus(status: string): Status {
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
    return "FL-?";
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

type MissingInMapRoutePanelProps = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export function MissingInMapRoutePanel({ activeTab, onTabChange }: MissingInMapRoutePanelProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("1m");
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [detailRow, setDetailRow] = useState<RouteRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const routesQuery = useQuery({
    queryKey: ["missing-routes"],
    queryFn: () => missingInMapApi.listRoutes({ limit: 500 }),
  });

  const routeStatsQuery = useQuery({
    queryKey: ["missing-route-stats"],
    queryFn: () => missingInMapApi.getRouteStats(),
  });

  const locationStatsQuery = useQuery({
    queryKey: ["missing-location-stats"],
    queryFn: () => missingInMapApi.getLocationStats(),
  });

  const resolveRouteMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => missingInMapApi.resolveRoute(id, note),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["missing-routes"] }),
        queryClient.invalidateQueries({ queryKey: ["missing-route-stats"] }),
      ]);
    },
  });

  const updateRouteMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      missingInMapApi.updateRoute(id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["missing-routes"] }),
        queryClient.invalidateQueries({ queryKey: ["missing-route-stats"] }),
      ]);
    },
  });

  const rows = useMemo<RouteRow[]>(() => {
    const data = routesQuery.data ?? [];
    return data.map((item) => ({
      rowId: item.id,
      id: `#RT-${String(item.id).padStart(4, "0")}`,
      startPoint: item.start_name,
      startMeta: `${item.start_building ?? "BLD-?"} / ${formatFloor(item.start_floor)}`,
      endPoint: item.end_name,
      endMeta: `${item.end_building ?? "BLD-?"} / ${formatFloor(item.end_floor)}`,
      reason: item.reason ?? item.resolved_note ?? "--",
      reportedBy: item.reported_by ?? "Ẩn danh",
      reporterRole: "SV",
      createdAt: formatDateTime(item.created_at),
      status: mapRouteStatus(item.status),
    }));
  }, [routesQuery.data]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();

    return rows.filter((row) => {
      // Search filter
      const matchesSearch =
        query.length === 0 ||
        row.id.toLowerCase().includes(query) ||
        row.startPoint.toLowerCase().includes(query) ||
        row.endPoint.toLowerCase().includes(query) ||
        row.reportedBy.toLowerCase().includes(query) ||
        row.reason.toLowerCase().includes(query);

      // Status filter
      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;

      // Time filter
      let matchesTime = true;
      if (timeFilter !== "all") {
        // We need to use the original data's createdAt for accurate filtering
        const originalItem = routesQuery.data?.find((item) => item.id === row.rowId);
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
  }, [rows, search, statusFilter, timeFilter, routesQuery.data]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, pageCount);

  const pageRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safeCurrentPage]);

  const rangeStart = pageRows.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = pageRows.length === 0 ? 0 : rangeStart + pageRows.length - 1;

  const routeTotal = routeStatsQuery.data?.total ?? rows.length;
  const locationTotal = locationStatsQuery.data?.total ?? 0;

  const routeStats: MissingInMapStatsData = {
    total: routeStatsQuery.data?.total ?? rows.length,
    pending: routeStatsQuery.data?.pending ?? 0,
    resolved: routeStatsQuery.data?.resolved ?? 0,
    inProgress: 0,
    removed: routeStatsQuery.data?.rejected ?? 0,
  };

  const actionMeta = useMemo(() => getActionMeta(pendingAction), [pendingAction]);

  async function confirmAction(_?: number, startNodeId?: number, endNodeId?: number) {
    if (!pendingAction) {
      return;
    }

    setActionError(null);

    try {
      if (pendingAction.type === "draw-route") {
        if (!startNodeId || !endNodeId) {
          setActionError("Vui lòng chọn điểm bắt đầu và kết thúc.");
          toast.error("Vui lòng chọn điểm bắt đầu và kết thúc.");
          return;
        }

        // Verify that a path exists between the selected nodes
        try {
          await wayfindingApi.findRoute({
            map_id: 0,
            start_node_id: startNodeId,
            end_node_id: endNodeId,
          });
        } catch (error) {
          setActionError("Không tìm thấy đường đi giữa hai điểm này trên bản đồ. Vui lòng vẽ tuyến đường trước.");
          toast.error("Không tìm thấy đường đi giữa hai điểm này.");
          return;
        }

        await updateRouteMutation.mutateAsync({
          id: pendingAction.rowId,
          payload: {
            status: "resolved",
            start_node_id: startNodeId,
            end_node_id: endNodeId,
            resolved_note: "Đã liên kết tuyến đường và đồng bộ vào dữ liệu bản đồ.",
          },
        });
        toast.success("Đã cập nhật tuyến đường thành công.");
      }

      if (pendingAction.type === "remove") {
        await updateRouteMutation.mutateAsync({
          id: pendingAction.rowId,
          payload: {
            status: "rejected",
            resolved_note: "Đã loại bỏ theo xác nhận của quản trị viên.",
          },
        });
        toast.success("Đã loại bỏ yêu cầu thành công.");
      }

      setPendingAction(null);
    } catch {
      setActionError("Không thể cập nhật yêu cầu. Vui lòng thử lại.");
      toast.error("Không thể cập nhật tuyến đường. Vui lòng thử lại.");
    }
  }

  const isSubmitting = updateRouteMutation.isPending;
  const isLoading = routesQuery.isLoading || routeStatsQuery.isLoading;

  return (
    <>
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-140">
        <MissingInMapControls
          activeTab={activeTab}
          locationTotal={locationTotal}
          routeTotal={routeTotal}
          search={search}
          statusFilter={statusFilter}
          statusOptions={ROUTE_STATUS_OPTIONS}
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

        {routesQuery.isError && (
          <div className="mx-4 mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Không thể tải danh sách tuyến đường thiếu. Vui lòng thử lại.
            <button
              type="button"
              onClick={() => routesQuery.refetch()}
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
          <MissingInMapRouteTable
            rows={pageRows}
            isSubmitting={isSubmitting}
            pendingActionId={pendingAction?.rowId ?? null}
            isLoading={routesQuery.isLoading}
            onDrawRoute={(row) => setPendingAction({ rowId: row.rowId, displayId: row.id, type: "draw-route" })}
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
        stats={routeStats}
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
        type="route"
      />
    </>
  );
}
