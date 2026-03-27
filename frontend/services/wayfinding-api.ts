import { apiClient } from './wayfinding-client';
import { RouteResponse } from '@/types';

export interface FindRouteParams {
  map_id: number;
  start_node_id: number;
  end_node_id: number;
}

export interface QueryRouteParams {
  map_id: number;
  q: string;
  cx?: number;
  cy?: number;
}

export const wayfindingApi = {
  findRoute: async (params: FindRouteParams): Promise<RouteResponse> => {
    const res = await apiClient.get<RouteResponse>("/api/find", { params });
    return res.data;
  },

  queryRoute: async (params: QueryRouteParams): Promise<RouteResponse> => {
    const res = await apiClient.get<RouteResponse>("/api/query", { params });
    return res.data;
  },

  findNearestNode: async (mapId: number, x: number, y: number): Promise<number[] | null> => {
    try {
      const res = await apiClient.get<RouteResponse>("/api/query", {
        params: {
          map_id: mapId,
          q: "",
          cx: x,
          cy: y,
        },
      });
      return res.data.path_coords.length > 0 ? res.data.path_coords[0] : null;
    } catch (error) {
      console.error("Error finding nearest node:", error);
      return null;
    }
  },

  refreshCache: async (): Promise<{ message: string; node_count: number }> => {
    const res = await apiClient.post("/api/refresh-cache");
    return res.data;
  },
};
