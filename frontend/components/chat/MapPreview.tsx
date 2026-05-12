'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

import { UnifiedMapView } from '@/components/features/navigation/UnifiedMapView';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Layers, Navigation2, Maximize2, ChevronRight, ChevronLeft } from 'lucide-react';
import { wayfindingMapApi } from '@/services/wayfinding-map-api';
import { getFullImageUrl } from '@/services/wayfinding-client';
import { MapData, MapNode, Instruction, MapWithData } from '@/types/wayfinding';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

interface RouteData {
  type: string;
  start_name: string;
  end_name: string;
  start_node_id?: number;
  end_node_id?: number;
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



export function MiniNavigation({ routeData }: MiniNavProps) {
  const router = useRouter();
  const [allMaps, setAllMaps] = useState<MapWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

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

  const floors = useMemo(() => {
    if (routeData.floors && routeData.floors.length > 0) {
      return routeData.floors;
    }
    // Logic fallback to build floors from route_maps if not provided
    // (Existing logic kept for robustness)
    if (routeData.route_maps && routeData.route_maps.length > 0) {
      const pathNodeIds = routeData.path_node_ids || [];
      const fullPath = routeData.path_coords || [];
      
      return routeData.route_maps.map((rm, idx) => {
        const mapId = rm.map?.id;
        const mapFloor = rm.map?.floor_level;
        const floorNodes = rm.nodes || [];
        const floorNodeIds = new Set(floorNodes.map(n => n.id));
        const floorPathNodeIds = pathNodeIds.filter(id => floorNodeIds.has(id));
        const nodeIdToIdx = new Map(pathNodeIds.map((id, i) => [id, i]));
        const floorPathCoords: number[][] = [];
        const usedIndices = new Set<number>();
        
        for (const nodeId of floorPathNodeIds) {
          const idx = nodeIdToIdx.get(nodeId);
          if (idx !== undefined && fullPath[idx] && !usedIndices.has(idx)) {
            floorPathCoords.push(fullPath[idx]);
            usedIndices.add(idx);
          }
        }
        
        return {
          map_id: mapId || idx + 1,
          name: rm.map?.name || (mapFloor === null ? 'Campus' : `Tầng ${mapFloor}`),
          floor_level: mapFloor ?? idx,
          path_coords: floorPathCoords,
          instructions: routeData.instructions,
        };
      });
    }
    return [{
      map_id: routeData.map?.id || 1,
      name: routeData.map?.name || 'Bản đồ',
      floor_level: 0,
      path_coords: routeData.path_coords,
      instructions: routeData.instructions,
    }];
  }, [routeData]);

  // Convert floors to FloorSegment for UnifiedMapView
  const floorSegments = useMemo(() => {
    return floors.map((f, idx) => {
      // Find the index in allMaps that matches f.map_id
      const allMapsIdx = allMaps.findIndex(m => m.map.id === f.map_id);
      return {
        floorIndex: allMapsIdx !== -1 ? allMapsIdx : idx,
        pathCoords: f.path_coords,
        instructions: f.instructions || [],
      };
    });
  }, [floors, allMaps]);

  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (routeData.path_node_ids?.[0] && allMaps.length > 0) {
      const startNode = allMaps.flatMap(m => m.nodes).find(n => n.id === routeData.path_node_ids[0]);
      if (startNode) {
        const floorIdx = allMaps.findIndex(m => m.map.id === startNode.map_id);
        if (floorIdx !== -1) setActiveFloorIdx(floorIdx);
      }
    }
  }, [routeData.path_node_ids, allMaps]);

  const currentInstructions = useMemo(() => routeData.instructions || [], [routeData]);
  const activeStep = currentInstructions[currentStep];

  // Auto-center map on current step
  const centerOnStep = () => {
    if (activeStep && activeStep.coordinate && viewportRef.current) {
      const { width, height } = viewportRef.current.getBoundingClientRect();
      if (width === 0 || height === 0) return; // Wait for layout
      
      const [x, y] = activeStep.coordinate;
      const S = 1.3; // matching scale prop
      setPosition({
        x: width / 2 - x * S,
        y: height / 2 - y * S
      });
    }
  };

  useEffect(() => {
    centerOnStep();
    // Add a small delay to handle cases where layout might take a moment
    const timer = setTimeout(centerOnStep, 100);
    return () => clearTimeout(timer);
  }, [activeStep, activeFloorIdx, loading]);

  // Initial floor selection based on first instruction
  useEffect(() => {
    if (!loading && activeStep && activeStep.coordinate && allMaps.length > 0) {
      // Find which map contains this coordinate
      const [x, y] = activeStep.coordinate;
      const targetMap = allMaps.find(m => 
        m.nodes.some(n => Math.abs(n.x - x) < 5 && Math.abs(n.y - y) < 5)
      );
      if (targetMap) {
        const floorIdx = allMaps.findIndex(m => m.map.id === targetMap.map.id);
        if (floorIdx !== -1 && floorIdx !== activeFloorIdx) {
          setActiveFloorIdx(floorIdx);
        }
      }
    }
  }, [loading, activeStep, allMaps]);

  const handleNextStep = () => {
    if (currentStep < currentInstructions.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      // Auto switch floor if step coordinate belongs to another floor
      const coord = currentInstructions[nextStep].coordinate;
      const targetMap = allMaps.find(m => 
        m.nodes.some(n => Math.abs(n.x - coord[0]) < 2 && Math.abs(n.y - coord[1]) < 2)
      );
      if (targetMap) {
        const floorIdx = allMaps.findIndex(m => m.map.id === targetMap.map.id);
        if (floorIdx !== -1) setActiveFloorIdx(floorIdx);
      }
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      const coord = currentInstructions[prevStep].coordinate;
      const targetMap = allMaps.find(m => 
        m.nodes.some(n => Math.abs(n.x - coord[0]) < 2 && Math.abs(n.y - coord[1]) < 2)
      );
      if (targetMap) {
        const floorIdx = allMaps.findIndex(m => m.map.id === targetMap.map.id);
        if (floorIdx !== -1) setActiveFloorIdx(floorIdx);
      }
    }
  };

  const goToNavigation = () => {
    const params = new URLSearchParams();
    if (routeData.start_node_id) params.set('start', routeData.start_node_id.toString());
    if (routeData.end_node_id) params.set('end', routeData.end_node_id.toString());
    router.push(`/navigation?${params.toString()}`);
  };

  if (loading) return (
    <div className="h-64 flex items-center justify-center bg-muted/20 rounded-xl border border-dashed border-border">
      <Navigation2 className="w-6 h-6 animate-pulse text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex flex-col border border-border rounded-2xl overflow-hidden bg-card shadow-xl max-w-full">
      {/* Header */}
      <div className="p-4 bg-gradient-to-br from-primary/5 to-transparent border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="px-1.5 py-0.5 rounded bg-primary/20 text-[10px] font-bold text-primary uppercase tracking-wider">
                Route Found
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                {Math.round(routeData.total_distance_m)}m • {Math.ceil(routeData.total_distance_m / 80)} min
              </span>
            </div>
            <h4 className="font-bold text-sm truncate text-foreground leading-tight">
              {routeData.start_name} <span className="text-muted-foreground font-normal mx-1">→</span> {routeData.end_name}
            </h4>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={goToNavigation}
            className="shrink-0 h-8 gap-1.5 rounded-full border-primary/20 hover:bg-primary/5"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">XEM LỚN</span>
          </Button>
        </div>
      </div>
      {/* Map Viewport */}
      <div 
        ref={viewportRef}
        className="relative h-[350px] bg-slate-950/5 overflow-hidden border-b border-border"
      >
        <UnifiedMapView
          floorMaps={allMaps}
          floorSegments={floorSegments}
          currentFloorIndex={activeFloorIdx}
          scale={1.3}
          position={position}
          isDragging={false}
          svgRef={{ current: null }}
          getFullImageUrl={getFullImageUrl}
          renderFloorContent={(idx, is3D) => {
            const floorSegs = floorSegments.filter(s => s.floorIndex === idx);
            if (floorSegs.length === 0) return null;
            
            const isCurrentStepOnThisFloor = activeStep && activeStep.coordinate && activeFloorIdx === idx;
            
            return (
              <g>
                {floorSegs.map((seg, sIdx) => (
                  <path
                    key={`path-seg-${idx}-${sIdx}`}
                    d={`M ${seg.pathCoords.map(c => `${c[0]} ${c[1]}`).join(' L ')}`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-lg opacity-80"
                  />
                ))}
                
                {isCurrentStepOnThisFloor && (
                  <circle
                    cx={activeStep.coordinate[0]}
                    cy={activeStep.coordinate[1]}
                    r="8"
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="3"
                    className="drop-shadow-xl"
                  />
                )}
              </g>
            );
          }}
        />
      </div>

      {/* Step-by-Step Content (Now Outside) */}
      <div className="bg-background p-4 flex flex-col gap-3">
         <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
               <div className="text-[10px] uppercase font-black text-muted-foreground tracking-tighter mb-0.5">
                  Bước {currentStep + 1} / {currentInstructions.length}
               </div>
               <div className="text-sm font-bold leading-snug line-clamp-2">
                  {activeStep?.text || 'Bắt đầu di chuyển'}
               </div>
            </div>
            <div className="flex items-center gap-1">
               <Button 
                variant="outline" 
                size="icon" 
                className="h-9 w-9 rounded-full border-border hover:bg-muted" 
                disabled={currentStep === 0}
                onClick={handlePrevStep}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-9 w-9 rounded-full border-border hover:bg-muted" 
                disabled={currentStep === currentInstructions.length - 1}
                onClick={handleNextStep}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

      {/* Multi-floor Tabs */}
      {allMaps.length > 1 && (
        <div className="flex items-center gap-1.5 p-2 bg-muted/20 border-t border-border overflow-x-auto no-scrollbar">
          <Layers className="w-3.5 h-3.5 text-muted-foreground ml-1 mr-1" />
          {allMaps.map((m, idx) => {
            const isActive = activeFloorIdx === idx;
            return (
              <button
                key={m.map.id}
                onClick={() => setActiveFloorIdx(idx)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all whitespace-nowrap
                  ${isActive 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                {m.map.floor_level === null ? 'Campus' : `Tầng ${m.map.floor_level}`}
              </button>
            );
          })}
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
