import { apiClient, getFullImageUrl } from './wayfinding-client';
import { MapData } from '@/types';

export const mapApi = {
  getAll: async () => {
    const res = await apiClient.get<MapData[]>('/api/maps');
    return res.data.map(m => ({ ...m, image_url: getFullImageUrl(m.image_url) }));
  },

  getCampus: async () => {
    const res = await apiClient.get<MapData[]>('/api/maps/campus');
    return res.data.map(m => ({ ...m, image_url: getFullImageUrl(m.image_url) }));
  },

  upload: async (formData: FormData) => {
    const res = await apiClient.post<MapData>('/api/maps', formData);
    return { ...res.data, image_url: getFullImageUrl(res.data.image_url) };
  },

  delete: async (id: number) => {
    await apiClient.delete(`/api/maps/${id}`);
  },

  updateMap: async (id: number, data: Partial<MapData>) => {
    const res = await apiClient.patch<MapData>(`/api/maps/${id}`, data);
    return { ...res.data, image_url: getFullImageUrl(res.data.image_url) };
  }
};
