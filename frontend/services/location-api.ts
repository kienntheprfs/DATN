import { apiClient } from './wayfinding-client';
import { LocationSuggestion } from '@/types';

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
