export type Status = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "REMOVED";
export type TabKey = "location" | "route";

export type LocationRow = {
  id: string;
  name: string;
  buildingName: string;
  floor: string;
  requestedBy: string;
  requesterRole: "SV" | "GV" | "NV";
  adminNote: string;
  createdAt: string;
  status: Status;
};

export type RouteRow = {
  id: string;
  startPoint: string;
  startMeta: string;
  endPoint: string;
  endMeta: string;
  reason: string;
  reportedBy: string;
  reporterRole: "SV" | "GV" | "NV";
  createdAt: string;
  status: Status;
};

export type PendingAction = {
  id: string;
  type: "add-location" | "draw-route" | "remove";
};
