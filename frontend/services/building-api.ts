import { apiClient } from './auth-api'
import { Building } from '@/types';

export const buildingApi = {
    getAll: async () => {
        const res = await apiClient.get<Building[]>("/wayfinder/api/buildings");
        return res.data;
    },

    getDetail: async (id: number) => {
        const res = await apiClient.get<Building>(`/wayfinder/api/buildings/${id}`);
        return res.data;
    },

    create: async (data: { name: string; description?: string }) => {
        const res = await apiClient.post<Building>("/wayfinder/api/buildings", data);
        return res.data;
    },

    update: async (id: number, data: Partial<Building>) => {
        const res = await apiClient.patch<Building>(`/wayfinder/api/buildings/${id}`, data);
        return res.data;
    },

    delete: async (id: number) => {
        await apiClient.delete(`/wayfinder/api/buildings/${id}`);
    }
};
