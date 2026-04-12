// src/shared/types/index.ts

export interface Coordinate {
  x: number;
  y: number;
}

export interface MapNode {
  id: number;
  map_id: number;
  map?: MapData;
  x: number;
  y: number;
  name: string;
  type: 'path' | 'room' | 'entrance' | 'stairs' | 'elevator';
  aliases?: string[];
  building_id?: number;
  building?: Building;
  linked_node_ids?: number[];
  linked_campus_node_id?: number;
  flags?: {
    wheelchair?: boolean;
    hidden?: boolean;
  };
}

export interface MapEdge {
  id: number;
  start_node_id: number;
  end_node_id: number;
  weight: number;
  type: 'walk' | 'stairs' | 'elevator';
  bidirectional?: boolean;
  polyline?: number[][]; 
}

export interface Building {
    id: number;
    name: string;
    description?: string;
    maps?: MapData[]; 
}

export interface MapData {
  id: number;
  name: string;
  image_url: string;
  scale_ratio: number;
  floor_level?: number;
  building_id?: number;
  building?: Building;
}

export interface Instruction {
  step: number;
  text: string;
  action: string;
  distance_m: number;
  coordinate: [number, number];
}

export interface RouteResponse {
  map_id: number;
  path_coords: number[][];
  path_node_ids: number[];
  total_distance_m: number;
  instructions: Instruction[];
}