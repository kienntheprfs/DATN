// src/features/maps/api/maps.ts
import { apiClient, getFullImageUrl } from '@/shared/api/client';
import { MapData } from '@/shared/types';

export const mapApi = {
  // Lấy tất cả map
  getAll: async () => {
    const res = await apiClient.get<MapData[]>('/api/maps');
    // Map lại image_url cho đúng chuẩn
    return res.data.map(m => ({ ...m, image_url: getFullImageUrl(m.image_url) }));
  },

  // Lấy map campus (tự động chọn)
  getCampus: async () => {
    const res = await apiClient.get<MapData[]>('/api/maps/campus');
    return res.data.map(m => ({ ...m, image_url: getFullImageUrl(m.image_url) }));
  },

  // Upload map mới
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