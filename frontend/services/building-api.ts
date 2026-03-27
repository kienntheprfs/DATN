import { apiClient } from './wayfinding-client';
import { Building } from '@/types';

export const buildingApi = {
    getAll: async () => {
        const res = await apiClient.get<Building[]>("/api/buildings");
        return res.data;
    },

    getDetail: async (id: number) => {
        const res = await apiClient.get<Building>(`/api/buildings/${id}`);
        return res.data;
    },

    create: async (data: { name: string; description?: string }) => {
        const res = await apiClient.post<Building>("/api/buildings", data);
        return res.data;
    },

    update: async (id: number, data: Partial<Building>) => {
        const res = await apiClient.patch<Building>(`/api/buildings/${id}`, data);
        return res.data;
    },

    delete: async (id: number) => {
        await apiClient.delete(`/api/buildings/${id}`);
    }
};
