'use client';

import { useMemo, useState, useEffect } from 'react';
import { Footprints } from 'lucide-react';
import { getFullImageUrl } from '@/services/wayfinding-client';
import { wayfindingMapApi } from '@/services/wayfinding-map-api';
import { MapData, MapNode, Instruction } from '@/types';
import { MapWithData } from '@/types';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

interface RouteData {
  type: string;
  start_name: string;
  end_name: string;
  map: MapData;
  floors?: { map_id: number; name: string; floor_level: number | null; path_coords: number[][]; instructions: Instruction[] }[];
  path_coords: number[][];
  path_node_ids: number[];
  total_distance_m: number;
  instructions: Instruction[];
  route_maps?: { map: MapData; nodes: MapNode[] }[];
  is_multi_floor?: boolean;
  floor_count?: number;
}

interface MiniNavProps {
  routeData: RouteData;
}

function MiniFloorMap({ 
  floor, 
  isActive
}: { 
  floor: { map_id: number; name: string; floor_level: number | null; path_coords: number[][]; instructions: Instruction[] };
  isActive: boolean;
}) {
  const [allMaps, setAllMaps] = useState<MapWithData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const maps = await wayfindingMapApi.getAllMaps();
        const data = await Promise.all(maps.map(m => wayfindingMapApi.getMapWithData(m.id)));
        setAllMaps(data);
      } catch (err) {
        console.error('Failed to load maps:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const currentFloorMap = allMaps.find(m => m.map.id === floor.map_id) || allMaps[floor.map_id - 1] || allMaps[0];
  const currentMap = currentFloorMap?.map;
  const currentNodes = currentFloorMap?.nodes || [];
  
  const pathData = useMemo(() => {
    if (!floor.path_coords || floor.path_coords.length < 2 || !currentNodes.length) return '';
    
    const nodeMap = new Map(currentNodes.map(n => [n.id, n]));
    
    const floorPathCoords: number[][] = [];
    for (const coord of floor.path_coords) {
      const matchingNode = currentNodes.find(n => Math.abs(n.x - coord[0]) < 2 && Math.abs(n.y - coord[1]) < 2);
      if (matchingNode) {
        floorPathCoords.push(coord);
      }
    }
    
    if (floorPathCoords.length < 2) return '';
    return `M ${floorPathCoords.map(c => `${c[0]} ${c[1]}`).join(' L ')}`;
  }, [floor.path_coords, currentNodes]);

  const viewBox = useMemo(() => {
    if (!floor.path_coords || floor.path_coords.length === 0) return `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
    
    const xs = floor.path_coords.map(c => c[0]);
    const ys = floor.path_coords.map(c => c[1]);
    const pathMinX = Math.min(...xs);
    const pathMinY = Math.min(...ys);
    const pathMaxX = Math.max(...xs);
    const pathMaxY = Math.max(...ys);
    
    const centerX = (pathMinX + pathMaxX) / 2;
    const centerY = (pathMinY + pathMaxY) / 2;
    const range = Math.max(pathMaxX - pathMinX, pathMaxY - pathMinY) + 100;
    
    return `${centerX - range/2} ${centerY - range/2} ${range} ${range}`;
  }, [floor.path_coords]);

  const startCoord = floor.path_coords?.[0];
  const endCoord = floor.path_coords?.[floor.path_coords.length - 1];
  
  const showStartMarker = useMemo(() => {
    if (!startCoord || !currentNodes.length) return false;
    return currentNodes.some(n => Math.abs(n.x - startCoord[0]) < 2 && Math.abs(n.y - startCoord[1]) < 2);
  }, [startCoord, currentNodes]);
  
  const showEndMarker = useMemo(() => {
    if (!endCoord || !currentNodes.length) return false;
    return currentNodes.some(n => Math.abs(n.x - endCoord[0]) < 2 && Math.abs(n.y - endCoord[1]) < 2);
  }, [endCoord, currentNodes]);

  if (!isActive) return null;

  if (loading) {
    return (
      <div className="relative bg-muted/30 rounded-lg overflow-hidden flex items-center justify-center h-40">
        <span className="material-symbols-outlined text-muted-foreground animate-spin">sync</span>
      </div>
    );
  }

  return (
    <div className="relative bg-muted/30 rounded-lg overflow-hidden" style={{ height: '300px' }}>
      <svg
        viewBox={viewBox}
        className="w-full h-full"
      >
        {currentMap && (
          <image
            href={getFullImageUrl(currentMap.image_url)}
            x="0"
            y="0"
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            preserveAspectRatio="xMidYMid meet"
            opacity="0.85"
          />
        )}

        {floor.path_coords && floor.path_coords.length > 0 && (
          <path
            d={pathData}
            fill="none"
            stroke="#2563eb"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-lg"
          />
        )}

        {showStartMarker && startCoord && (
          <g>
            <circle cx={startCoord[0]} cy={startCoord[1]} r="12" fill="#2563eb" />
            <circle cx={startCoord[0]} cy={startCoord[1]} r="6" fill="white" />
            <text x={startCoord[0] + 18} y={startCoord[1] + 4} fill="#1e40af" fontSize="11" fontWeight="bold">
              START
            </text>
          </g>
        )}

        {showEndMarker && endCoord && (
          <g>
            <circle cx={endCoord[0]} cy={endCoord[1]} r="12" fill="#dc2626" />
            <circle cx={endCoord[0]} cy={endCoord[1]} r="6" fill="white" />
            <text x={endCoord[0] + 18} y={endCoord[1] + 4} fill="#991b1b" fontSize="11" fontWeight="bold">
              END
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function MiniNavigation({ routeData }: MiniNavProps) {
  const floors = useMemo(() => {
    if (routeData.floors && routeData.floors.length > 0) {
      return routeData.floors;
    }
    if (routeData.route_maps && routeData.route_maps.length > 0) {
      return routeData.route_maps.map((rm, idx) => ({
        map_id: rm.map?.id || idx + 1,
        name: rm.map?.name || `Tầng ${idx + 1}`,
        floor_level: rm.map?.floor_level ?? idx,
        path_coords: routeData.path_coords,
        instructions: routeData.instructions,
      }));
    }
    return [{
      map_id: routeData.map?.id || 1,
      name: routeData.map?.name || 'Bản đồ',
      floor_level: 0,
      path_coords: routeData.path_coords,
      instructions: routeData.instructions,
    }];
  }, [routeData]);

  const startCoord = routeData.path_coords?.[0];
  const startFloor = useMemo(() => {
    if (startCoord) {
      const idx = floors.findIndex(f => 
        f.path_coords?.some(c => Math.abs(c[0] - startCoord[0]) < 2 && Math.abs(c[1] - startCoord[1]) < 2)
      );
      return idx !== -1 ? idx : 0;
    }
    return 0;
  }, [startCoord, floors]);
  const [activeFloor, setActiveFloor] = useState(startFloor);

  useEffect(() => {
    if (startCoord && floors.length > 0) {
      const idx = floors.findIndex(f => 
        f.path_coords?.some(c => Math.abs(c[0] - startCoord[0]) < 2 && Math.abs(c[1] - startCoord[1]) < 2)
      );
      if (idx !== -1) setActiveFloor(idx);
    }
  }, [startCoord, floors]);
  
  const currentFloor = floors[activeFloor];
  const estimatedMinutes = Math.ceil(routeData.total_distance_m / 80);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-lg">
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Footprints className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground">
                {routeData.start_name} → {routeData.end_name}
              </h4>
              <p className="text-xs text-muted-foreground">
                ~{estimatedMinutes} phút • {Math.round(routeData.total_distance_m)}m
              </p>
            </div>
          </div>
        </div>

        {floors.length > 1 && (
          <div className="flex items-center gap-2 py-2">
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">layers</span>
              Đường đi qua {floors.length} tầng
            </span>
            <div className="flex gap-1 overflow-x-auto">
              {floors.map((floor, idx) => (
                <button
                  key={floor.map_id}
                  onClick={() => setActiveFloor(idx)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    activeFloor === idx
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {floor.floor_level === null ? 'Campus' : `Tầng ${floor.floor_level}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <MiniFloorMap 
        floor={currentFloor} 
        isActive={true}
      />

      {currentFloor.instructions && currentFloor.instructions.length > 0 && (
        <div className="p-3 max-h-30 overflow-y-auto">
          <div className="space-y-0.5">
            {currentFloor.instructions.map((inst, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 py-1 text-xs"
              >
                <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">
                  {inst.step}
                </span>
                <span className="flex-1 text-foreground truncate">{inst.text}</span>
                {inst.distance_m > 0 && (
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {inst.distance_m}m
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface MapPreviewProps {
  map: MapData;
  nodes: MapNode[];
  pathCoords: number[][];
  instructions: Instruction[];
  totalDistance: number;
  startName?: string;
  endName?: string;
  floors?: RouteData['floors'];
}

export function MapPreview({
  map,
  nodes,
  pathCoords,
  instructions,
  totalDistance,
  startName,
  endName,
  floors,
}: MapPreviewProps) {
  const routeData: RouteData = {
    type: 'route',
    start_name: startName || '',
    end_name: endName || '',
    map,
    floors,
    path_coords: pathCoords,
    path_node_ids: [],
    total_distance_m: totalDistance,
    instructions,
  };

  return <MiniNavigation routeData={routeData} />;
}

interface MapToolResultProps {
  toolContent: string;
}

export function MapToolResult({ toolContent }: MapToolResultProps) {
  let routeData: RouteData | null = null;
  
  try {
    const data = JSON.parse(toolContent);
    if (data.type === 'route') {
      routeData = data;
    }
  } catch {
    // Not JSON
  }
  
  if (routeData) {
    return <MiniNavigation routeData={routeData} />;
  }
  
  return null;
}
