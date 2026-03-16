import { apiClient } from "@/shared/api/client";
import { RouteResponse } from "@/shared/types";

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
  // Route bằng node IDs trực tiếp
  findRoute: async (params: FindRouteParams): Promise<RouteResponse> => {
    const res = await apiClient.get<RouteResponse>("/api/find", { params });
    return res.data;
  },

  // Route bằng natural language query
  // Ví dụ: "từ Sảnh A đến Thang máy"
  // Hoặc dùng cx, cy để tìm node gần nhất
  queryRoute: async (params: QueryRouteParams): Promise<RouteResponse> => {
    const res = await apiClient.get<RouteResponse>("/api/query", { params });
    return res.data;
  },

  // Tìm node gần nhất với tọa độ (helper)
  findNearestNode: async (mapId: number, x: number, y: number): Promise<number | null> => {
    try {
      const res = await apiClient.get<RouteResponse>("/api/query", {
        params: {
          map_id: mapId,
          q: "", // Empty query, will use cx, cy
          cx: x,
          cy: y,
        },
      });
      return res.data.path_coords.length > 0 ? res.data.path_coords[0] as any : null;
    } catch (error) {
      console.error("Error finding nearest node:", error);
      return null;
    }
  },
};
