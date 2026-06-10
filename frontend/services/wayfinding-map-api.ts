import { apiClient } from './auth-api';
import {getFullImageUrl} from './wayfinding-client'
import { MapData, MapNode, MapEdge, MapWithData } from '@/types';

export const wayfindingMapApi = {
  getMapWithData: async (mapId: number): Promise<MapWithData> => {
    const [mapRes, nodesRes, edgesRes] = await Promise.all([
      apiClient.get<MapData>(`/wayfinder/api/maps/${mapId}`),
      apiClient.get<MapNode[]>("/wayfinder/api/nodes", { params: { map_id: mapId } }),
      apiClient.get<MapEdge[]>("/wayfinder/api/edges", { params: { map_id: mapId } }),
    ]);
    return {
      map: { ...mapRes.data, image_url: getFullImageUrl(mapRes.data.image_url) },
      nodes: nodesRes.data,
      edges: edgesRes.data,
    };
  },

  getMapsByBuilding: async (buildingId: number): Promise<MapData[]> => {
    const res = await apiClient.get<MapData[]>("/wayfinder/api/maps", { 
      params: { building_id: buildingId } 
    });
    return res.data.map(m => ({ ...m, image_url: getFullImageUrl(m.image_url) }));
  },

  getAllMaps: async (): Promise<MapData[]> => {
    const res = await apiClient.get<MapData[]>("/wayfinder/api/maps");
    return res.data.map(m => ({ ...m, image_url: getFullImageUrl(m.image_url) }));
  },

  getAllMapsWithData: async (): Promise<MapWithData[]> => {
    const res = await apiClient.get<MapWithData[]>("/wayfinder/api/maps/with-data");
    return res.data.map(item => ({
      ...item,
      map: { ...item.map, image_url: getFullImageUrl(item.map.image_url) },
    }));
  },
};
