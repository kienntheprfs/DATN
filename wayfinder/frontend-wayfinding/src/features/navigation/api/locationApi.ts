import { apiClient } from "@/shared/api/client";

export interface LocationSuggestion {
  node_id: number;
  alias_id: number;
  name: string;
  score: number;
  map_id?: number;
  floor?: number;
  building_id?: number;
  node_type?: string;
}

export const locationApi = {
  getAll: async (mapId?: number): Promise<LocationSuggestion[]> => {
    const params = mapId ? { map_id: mapId } : {};
    const res = await apiClient.get<LocationSuggestion[]>("/api/aliases/all", { params });
    return res.data;
  },

  search: async (query: string, limit: number = 10): Promise<LocationSuggestion[]> => {
    if (!query || query.trim().length < 1) {
      return [];
    }
    const res = await apiClient.get<LocationSuggestion[]>("/api/aliases/search", {
      params: { q: query, limit },
    });
    return res.data;
  },
};
