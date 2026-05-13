import { apiClient } from "./auth-api";

 export type MissingLocationStatus = "pending" | "approved" | "resolved" | "rejected";
 export type MissingRouteStatus = "pending" | "resolved" | "rejected";

export type MissingLocationItem = {
  id: number;
  name: string;
  building_name: string | null;
  floor_level: number | null;
  description: string | null;
  requested_by: string | null;
  status: MissingLocationStatus;
  resolved_node_id: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  admin_note: string | null;
  created_at: string | null;
};

export type MissingRouteItem = {
  id: number;
  start_node_id: number | null;
  start_name: string;
  start_building: string | null;
  start_floor: number | null;
  end_node_id: number | null;
  end_name: string;
  end_building: string | null;
  end_floor: number | null;
  reason: string | null;
  status: MissingRouteStatus;
  resolved_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  reported_by: string | null;
  created_at: string | null;
};

export type MissingLocationStats = {
  total: number;
  pending: number;
  approved: number;
  resolved: number;
  rejected: number;
};

export type MissingRouteStats = {
  total: number;
  pending: number;
  resolved: number;
};

export const missingInMapApi = {
  listLocations: async (params?: {
    status?: MissingLocationStatus;
    building?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get<MissingLocationItem[]>("/wayfinder/api/missing-locations", {
      params,
    });
    return response.data;
  },

  getLocationStats: async () => {
    const response = await apiClient.get<MissingLocationStats>("/wayfinder/api/missing-locations/stats");
    return response.data;
  },

  updateLocation: async (
    id: number,
    payload: Partial<{
      status: MissingLocationStatus;
      admin_note: string;
      resolved_node_id: number;
      resolved_by: string;
      resolved_at: string;
      requested_by: string;
      description: string;
      name: string;
      building_name: string;
      floor_level: number;
    }>
  ) => {
    const response = await apiClient.patch<MissingLocationItem>(`/wayfinder/api/missing-locations/${id}`, payload);
    return response.data;
  },

  deleteLocation: async (id: number) => {
    const response = await apiClient.delete<{ message: string }>(`/wayfinder/api/missing-locations/${id}`);
    return response.data;
  },

  updateLocationStatus: async (id: number, status: MissingLocationStatus, admin_note?: string) => {
    const response = await apiClient.patch<MissingLocationItem>(`/wayfinder/api/missing-locations/${id}/status`, null, {
      params: {
        status,
        ...(admin_note ? { admin_note } : {}),
      },
    });
    return response.data;
  },

  listRoutes: async (params?: {
    status?: MissingRouteStatus;
    building?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get<MissingRouteItem[]>("/wayfinder/api/missing-routes", {
      params,
    });
    return response.data;
  },

  getRouteStats: async () => {
    const response = await apiClient.get<MissingRouteStats>("/wayfinder/api/missing-routes/stats");
    return response.data;
  },

  resolveRoute: async (id: number, resolved_note: string, resolved_by?: string) => {
    const response = await apiClient.post<MissingRouteItem>(`/wayfinder/api/missing-routes/${id}/resolve`, null, {
      params: {
        resolved_note,
        ...(resolved_by ? { resolved_by } : {}),
      },
    });
    return response.data;
  },

  deleteRoute: async (id: number) => {
    const response = await apiClient.delete<{ message: string }>(`/wayfinder/api/missing-routes/${id}`);
    return response.data;
  },

  updateRoute: async (
    id: number,
    payload: Partial<{
      status: MissingRouteStatus;
      resolved_note: string;
      resolved_by: string;
      resolved_at: string;
      reported_by: string;
      reason: string;
      start_name: string;
      start_building: string;
      start_floor: number;
      end_name: string;
      end_building: string;
      end_floor: number;
    }>
  ) => {
    const response = await apiClient.patch<MissingRouteItem>(`/wayfinder/api/missing-routes/${id}`, payload);
    return response.data;
  },

  updateRouteStatus: async (id: number, status: MissingRouteStatus, resolved_note?: string) => {
    const response = await apiClient.patch<MissingRouteItem>(`/wayfinder/api/missing-routes/${id}/status`, null, {
      params: {
        status,
        ...(resolved_note ? { resolved_note } : {}),
      },
    });
    return response.data;
  },
};
