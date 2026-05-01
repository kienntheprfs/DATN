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
  description?: string;
  real_image_url?: string;
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
    real_image_url?: string;
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

export interface LocationSuggestion {
  node_id: number;
  alias_id: number;
  name: string;
  score: number;
  map_id?: number;
  floor?: number | null;
  building_id?: number;
  building_name?: string;
  node_type?: string;
}

export interface MapWithData {
  map: MapData;
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface FloorSegment {
  floorIndex: number;
  pathCoords: number[][];
  instructions: Instruction[];
  floorChangeNode?: { x: number; y: number; type: string };
}

export type ToolType = 'select' | 'add-node' | 'add-edge';
export type SelectionType = 'node' | 'edge' | null;

export interface Alias {
  id?: number;
  name: string;
}

export interface NodeFormData {
  id: number;
  map_id: number;
  x: number;
  y: number;
  name: string;
  type: 'path' | 'room' | 'entrance' | 'stairs' | 'elevator';
  aliases: Alias[];
  linked_node_ids: number[];
  building_id?: number;
  linked_campus_node_id?: number;
  flags?: {
    wheelchair?: boolean;
    hidden?: boolean;
  };
  description?: string;
  real_image_url?: string;
}

export type EdgeFormData = MapEdge;
