import { apiClient } from './wayfinding-client';
import { MapNode, MapEdge, Building } from '@/types';

export const editorApi = {
  getBuildings: async () => {
    const res = await apiClient.get<Building[]>("/api/buildings");
    return res.data;
  },

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

  getNodes: async (mapId: number) => {
    const res = await apiClient.get<MapNode[]>("/api/nodes", {
      params: { map_id: mapId },
    });
    return res.data;
  },

  getNodeById: async (id: number) => {
    const res = await apiClient.get<MapNode>(`/api/nodes/${id}`);
    return res.data;
  },

  getEdges: async (mapId: number) => {
    const res = await apiClient.get<MapEdge[]>("/api/edges", {
      params: { map_id: mapId },
    });
    return res.data;
  },
};
