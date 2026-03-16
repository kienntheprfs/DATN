import { apiClient } from "@/shared/api/client";
import { MapData, MapNode, MapEdge } from "@/shared/types";

export interface MapWithData {
  map: MapData;
  nodes: MapNode[];
  edges: MapEdge[];
}

export const mapApi = {
  getMapWithData: async (mapId: number): Promise<MapWithData> => {
    const [mapRes, nodesRes, edgesRes] = await Promise.all([
      apiClient.get<MapData>(`/api/maps/${mapId}`),
      apiClient.get<MapNode[]>("/api/nodes", { params: { map_id: mapId } }),
      apiClient.get<MapEdge[]>("/api/edges", { params: { map_id: mapId } }),
    ]);
    return {
      map: mapRes.data,
      nodes: nodesRes.data,
      edges: edgesRes.data,
    };
  },

  getMapsByBuilding: async (buildingId: number): Promise<MapData[]> => {
    const res = await apiClient.get<MapData[]>("/api/maps", { 
      params: { building_id: buildingId } 
    });
    return res.data;
  },

  getAllMaps: async (): Promise<MapData[]> => {
    const res = await apiClient.get<MapData[]>("/api/maps");
    return res.data;
  },
};
