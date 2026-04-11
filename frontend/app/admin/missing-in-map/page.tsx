"use client";

import { useMemo, useState } from "react";
import {
  INITIAL_LOCATIONS,
  INITIAL_ROUTES,
  LOCATION_TOTAL,
  PAGE_SIZE,
  ROUTE_TOTAL,
} from "@/components/admin/missingInMap/MissingInMapData";
import { MissingInMapActionDialog } from "@/components/admin/missingInMap/MissingInMapActionDialog";
import { MissingInMapControls } from "@/components/admin/missingInMap/MissingInMapControls";
import { MissingInMapHeader } from "@/components/admin/missingInMap/MissingInMapHeader";
import { MissingInMapLocationTable } from "@/components/admin/missingInMap/MissingInMapLocationTable";
import { MissingInMapPagination } from "@/components/admin/missingInMap/MissingInMapPagination";
import { MissingInMapRouteTable } from "@/components/admin/missingInMap/MissingInMapRouteTable";
import { MissingInMapStats } from "@/components/admin/missingInMap/MissingInMapStats";
import { getActionMeta } from "@/components/admin/missingInMap/MissingInMapUtils";
import type {
  LocationRow,
  PendingAction,
  RouteRow,
  Status,
  TabKey,
} from "@/components/admin/missingInMap/MissingInMapTypes";

export default function MissingInMapPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("location");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  const [locationRows, setLocationRows] = useState(INITIAL_LOCATIONS);
  const [routeRows, setRouteRows] = useState(INITIAL_ROUTES);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return locationRows.filter((row) => {
      const matchesSearch =
        query.length === 0 ||
        row.id.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.buildingName.toLowerCase().includes(query) ||
        row.requestedBy.toLowerCase().includes(query) ||
        row.adminNote.toLowerCase().includes(query);

      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [locationRows, search, statusFilter]);

  const filteredRoutes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return routeRows.filter((row) => {
      const matchesSearch =
        query.length === 0 ||
        row.id.toLowerCase().includes(query) ||
        row.startPoint.toLowerCase().includes(query) ||
        row.endPoint.toLowerCase().includes(query) ||
        row.reportedBy.toLowerCase().includes(query) ||
        row.reason.toLowerCase().includes(query);

      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [routeRows, search, statusFilter]);

  const currentRows = activeTab === "location" ? filteredLocations : filteredRoutes;
  const totalResults = activeTab === "location" ? LOCATION_TOTAL : ROUTE_TOTAL;
  const pageCount = Math.max(1, Math.ceil(currentRows.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, pageCount);

  const pageRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return currentRows.slice(start, start + PAGE_SIZE);
  }, [currentRows, safeCurrentPage]);

  const rangeStart = pageRows.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = pageRows.length === 0 ? 0 : rangeStart + pageRows.length - 1;

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value: "ALL" | Status) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const actionMeta = useMemo(() => getActionMeta(pendingAction), [pendingAction]);

  async function confirmAction() {
    if (!pendingAction) {
      return;
    }

    setIsSubmitting(true);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 650);
    });

    if (activeTab === "location") {
      setLocationRows((prev) =>
        prev.map((row) => {
          if (row.id !== pendingAction.id) {
            return row;
          }

          if (pendingAction.type === "remove") {
            return {
              ...row,
              status: "REMOVED",
              adminNote: "Đã loại bỏ theo xác nhận của quản trị viên.",
            };
          }

          return {
            ...row,
            status: "IN_PROGRESS",
            adminNote: "Đã chuyển cho đội bản đồ xử lý.",
          };
        })
      );
    } else {
      setRouteRows((prev) =>
        prev.map((row) => {
          if (row.id !== pendingAction.id) {
            return row;
          }

          if (pendingAction.type === "remove") {
            return {
              ...row,
              status: "REMOVED",
              reason: "Báo cáo đã được xác định là trùng lặp và loại bỏ.",
            };
          }

          return {
            ...row,
            status: "RESOLVED",
            reason: "Đã vẽ và đồng bộ tuyến đường vào dữ liệu bản đồ.",
          };
        })
      );
    }

    setIsSubmitting(false);
    setPendingAction(null);
  }

  return (
    <div className="max-w-400 mx-auto w-full flex flex-col">
      <MissingInMapHeader activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-140">
        <MissingInMapControls
          activeTab={activeTab}
          search={search}
          statusFilter={statusFilter}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          totalResults={totalResults}
          onTabChange={handleTabChange}
          onSearchChange={handleSearchChange}
          onStatusFilterChange={handleStatusFilterChange}
        />

        <div className="overflow-x-auto flex-1">
          {activeTab === "location" ? (
            <MissingInMapLocationTable
              rows={pageRows as LocationRow[]}
              isSubmitting={isSubmitting}
              pendingActionId={pendingAction?.id ?? null}
              onAddLocation={(id) => setPendingAction({ id, type: "add-location" })}
              onRemove={(id) => setPendingAction({ id, type: "remove" })}
            />
          ) : (
            <MissingInMapRouteTable
              rows={pageRows as RouteRow[]}
              isSubmitting={isSubmitting}
              pendingActionId={pendingAction?.id ?? null}
              onDrawRoute={(id) => setPendingAction({ id, type: "draw-route" })}
              onRemove={(id) => setPendingAction({ id, type: "remove" })}
            />
          )}
        </div>

        <MissingInMapPagination
          safeCurrentPage={safeCurrentPage}
          pageCount={pageCount}
          onPageChange={setCurrentPage}
        />
      </div>

      <MissingInMapStats activeTab={activeTab} />

      <MissingInMapActionDialog
        pendingAction={pendingAction}
        actionMeta={actionMeta}
        isSubmitting={isSubmitting}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </div>
  );
}

