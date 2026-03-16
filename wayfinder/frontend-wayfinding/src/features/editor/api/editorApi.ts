import { apiClient } from "@/shared/api/client"; // Axios instance bạn đã tạo
import { MapNode, MapEdge } from "@/shared/types";

export const editorApi = {
  // --- NODES ---
  createNode: async (data: Partial<MapNode>) => {
    const res = await apiClient.post<MapNode>("/api/nodes", data);
    return res.data;
  },

  updateNode: async (id: number, data: Partial<MapNode>) => {
    const res = await apiClient.patch<MapNode>(`/api/nodes/${id}`, data);
    return res.data;
  },

  deleteNode: async (id: number) => {
    await apiClient.delete(`/api/nodes/${id}`);
    return id;
  },

  // --- EDGES ---
  createEdge: async (data: Partial<MapEdge>) => {
    const res = await apiClient.post<MapEdge>("/api/edges", data);
    return res.data;
  },

  updateEdge: async (id: number, data: Partial<MapEdge>) => {
    const res = await apiClient.patch<MapEdge>(`/api/edges/${id}`, data);
    return res.data;
  },
  
  deleteEdge: async (id: number) => {
    await apiClient.delete(`/api/edges/${id}`);
    return id;
  },

  // 1. Lấy danh sách Nodes theo Map ID
  getNodes: async (mapId: number) => {
    const res = await apiClient.get<MapNode[]>("/api/nodes", {
      params: { map_id: mapId },
    });
    return res.data;
  },

  // Lấy chi tiết một node
  getNodeById: async (id: number) => {
    const res = await apiClient.get<MapNode>(`/api/nodes/${id}`);
    return res.data;
  },

  // 2. Lấy danh sách Edges theo Map ID
  getEdges: async (mapId: number) => {
    const res = await apiClient.get<MapEdge[]>("/api/edges", {
      params: { map_id: mapId },
    });
    return res.data;
  },
};