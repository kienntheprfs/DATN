import { apiClient } from "@/shared/api/client";
import { Building } from "@/shared/types";

export const buildingApi = {
    // 1. Lấy danh sách tòa nhà
    getAll: async () => {
        const res = await apiClient.get<Building[]>("/api/buildings");
        return res.data;
    },

    // 2. Lấy chi tiết (kèm danh sách map/floor)
    getDetail: async (id: number) => {
        const res = await apiClient.get<Building>(`/api/buildings/${id}`);
        return res.data;
    },

    // 3. Tạo tòa nhà mới
    create: async (data: { name: string; description?: string }) => {
        const res = await apiClient.post<Building>("/api/buildings", data);
        return res.data;
    },

    // 4. Cập nhật
    update: async (id: number, data: Partial<Building>) => {
        const res = await apiClient.patch<Building>(`/api/buildings/${id}`, data);
        return res.data;
    },

    // 5. Xóa
    delete: async (id: number) => {
        await apiClient.delete(`/api/buildings/${id}`);
    }
};