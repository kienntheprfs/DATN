'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MapPin, Footprints } from 'lucide-react';
import { getFullImageUrl } from '@/services/wayfinding-client';
import { MapData, MapNode, Instruction } from '@/types';

interface RouteData {
  type: string;
  start_name: string;
  end_name: string;
  map: MapData;
  floors?: { map_id: number; name: string; floor_level: number; path_coords: number[][]; instructions: Instruction[] }[];
  path_coords: number[][];
  path_node_ids: number[];
  total_distance_m: number;
  instructions: Instruction[];
}

interface MiniNavProps {
  routeData: RouteData;
}

function MiniFloorMap({ 
  floor, 
  isActive 
}: { 
  floor: { map_id: number; name: string; floor_level: number; path_coords: number[][]; instructions: Instruction[] };
  isActive: boolean;
}) {
  const pathData = useMemo(() => {
    if (!floor.path_coords || floor.path_coords.length < 2) return '';
    return `M ${floor.path_coords.map(c => `${c[0]} ${c[1]}`).join(' L ')}`;
  }, [floor.path_coords]);

  const viewBox = useMemo(() => {
    if (!floor.path_coords || floor.path_coords.length === 0) return `0 0 300 200`;
    
    const xs = floor.path_coords.map(c => c[0]);
    const ys = floor.path_coords.map(c => c[1]);
    const minX = Math.min(...xs) - 30;
    const minY = Math.min(...ys) - 30;
    const maxX = Math.max(...xs) + 30;
    const maxY = Math.max(...ys) + 30;
    
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [floor.path_coords]);

  const startCoord = floor.path_coords?.[0];
  const endCoord = floor.path_coords?.[floor.path_coords.length - 1];

  if (!isActive) return null;

  return (
    <div className="relative bg-muted/30 rounded-lg overflow-hidden">
      <svg
        viewBox={viewBox}
        className="w-full h-auto"
        style={{ aspectRatio: '3/2' }}
      >
        {floor.path_coords && floor.path_coords.length > 0 && (
          <path
            d={pathData}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {startCoord && (
          <g>
            <circle cx={startCoord[0]} cy={startCoord[1]} r="8" fill="#2563eb" />
            <circle cx={startCoord[0]} cy={startCoord[1]} r="4" fill="white" />
          </g>
        )}

        {endCoord && (
          <g>
            <circle cx={endCoord[0]} cy={endCoord[1]} r="8" fill="#dc2626" />
            <circle cx={endCoord[0]} cy={endCoord[1]} r="4" fill="white" />
          </g>
        )}
      </svg>
    </div>
  );
}

export function MiniNavigation({ routeData }: MiniNavProps) {
  const [activeFloor, setActiveFloor] = useState(0);
  
  const floors = routeData.floors || [{
    map_id: routeData.map?.id || 1,
    name: routeData.map?.name || 'Bản đồ',
    floor_level: 0,
    path_coords: routeData.path_coords,
    instructions: routeData.instructions,
  }];
  
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
          <Link
            href={`/navigation?start=${encodeURIComponent(routeData.start_name)}&end=${encodeURIComponent(routeData.end_name)}`}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <ExternalLink className="w-3 h-3" />
            Xem chi tiết
          </Link>
        </div>

        {floors.length > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
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
        )}
      </div>

      <MiniFloorMap 
        floor={currentFloor} 
        isActive={true}
      />

      {currentFloor.instructions && currentFloor.instructions.length > 0 && (
        <div className="p-3 max-h-40 overflow-y-auto">
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
  try {
    const data = JSON.parse(toolContent);
    
    if (data.type === 'route') {
      return <MiniNavigation routeData={data} />;
    }
  } catch {
    // Not JSON
  }
  return null;
}
