import { apiClient } from './auth-api';
import { MapNode, MapEdge, Building } from '@/types';

export const editorApi = {
  getBuildings: async () => {
    const res = await apiClient.get<Building[]>("/wayfinder/api/buildings");
    return res.data;
  },

  createNode: async (data: Partial<MapNode>) => {
    const res = await apiClient.post<MapNode>("/wayfinder/api/nodes", data);
    return res.data;
  },

  updateNode: async (id: number, data: Partial<MapNode>) => {
    const res = await apiClient.patch<MapNode>(`/wayfinder/api/nodes/${id}`, data);
    return res.data;
  },

  deleteNode: async (id: number) => {
    await apiClient.delete(`/wayfinder/api/nodes/${id}`);
    return id;
  },

  createEdge: async (data: Partial<MapEdge>) => {
    const res = await apiClient.post<MapEdge>("/wayfinder/api/edges", data);
    return res.data;
  },

  updateEdge: async (id: number, data: Partial<MapEdge>) => {
    const res = await apiClient.patch<MapEdge>(`/wayfinder/api/edges/${id}`, data);
    return res.data;
  },
  
  deleteEdge: async (id: number) => {
    await apiClient.delete(`/wayfinder/api/edges/${id}`);
    return id;
  },

  getNodes: async (mapId: number) => {
    const res = await apiClient.get<MapNode[]>("/wayfinder/api/nodes", {
      params: { map_id: mapId },
    });
    return res.data;
  },

  getNodeById: async (id: number) => {
    const res = await apiClient.get<MapNode>(`/wayfinder/api/nodes/${id}`);
    return res.data;
  },

  getEdges: async (mapId: number) => {
    const res = await apiClient.get<MapEdge[]>("/wayfinder/api/edges", {
      params: { map_id: mapId },
    });
    return res.data;
  },

  uploadImage: async (formData: FormData) => {
    const res = await apiClient.post<{ url: string }>("/wayfinder/api/uploads/image", formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
};
