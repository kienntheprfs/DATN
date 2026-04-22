export type Status = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "REMOVED";
export type TabKey = "location" | "route";
export type RoleTag = "SV" | "GV" | "NV";

export type StatusFilterOption = {
  value: "ALL" | Status;
  label: string;
};

export type LocationRow = {
  rowId: number;
  id: string;
  name: string;
  buildingName: string;
  floor: string;
  requestedBy: string;
  requesterRole: RoleTag;
  adminNote: string;
  createdAt: string;
  status: Status;
};

export type RouteRow = {
  rowId: number;
  id: string;
  startPoint: string;
  startMeta: string;
  endPoint: string;
  endMeta: string;
  reason: string;
  reportedBy: string;
  reporterRole: RoleTag;
  createdAt: string;
  status: Status;
};

export type PendingAction = {
  rowId: number;
  displayId: string;
  type: "add-location" | "draw-route" | "remove";
};

export type MissingInMapStatsData = {
  total: number;
  pending: number;
  resolved: number;
  inProgress: number;
  removed: number;
};
