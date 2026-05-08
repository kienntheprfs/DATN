'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { wayfindingApi } from '@/services/wayfinding-api';
import { wayfindingMapApi } from '@/services/wayfinding-map-api';
import { buildingApi } from '@/services/building-api';
import { useBuildingStore } from '@/stores/building.store';
import { RouteResponse, MapData, MapNode, MapEdge, Building, Instruction } from '@/types';
import { getFullImageUrl } from '@/services/wayfinding-client';
import { LocationSearch } from './LocationSearch';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Navigation, RefreshCw, Map as MapIcon, ChevronLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { UnifiedMapView } from './UnifiedMapView';

const ACTION_ICONS: Record<string, string> = {
  start: 'trip_origin',
  straight: 'straight',
  slight_left: 'turn_slight_left',
  slight_right: 'turn_slight_right',
  turn_left: 'turn_left',
  turn_right: 'turn_right',
  use_elevator: 'elevator',
  use_stairs: 'stairs',
  enter_elevator: 'elevator',
  enter_stairs: 'stairs',
  arrive: 'flag',
};

const NODE_COLORS: Record<string, string> = {
  path: '#6b7280',
  room: '#8b5cf6',
  entrance: '#22c55e',
  stairs: '#f59e0b',
  elevator: '#3b82f6',
};

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

interface FloorMap {
  map: MapData;
  nodes: MapNode[];
  edges: MapEdge[];
  isCampus?: boolean;
}

interface FloorSegment {
  floorIndex: number;
  pathCoords: number[][];
  instructions: Instruction[];
  floorChangeNode?: { x: number; y: number; type: string };
}

export default function NavigationPage() {
  const buildings = useBuildingStore((state) => state.buildings);


  const fetchBuildings = useBuildingStore((state) => state.fetchBuildings);
  const isMobile = useIsMobile();

  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [floorMaps, setFloorMaps] = useState<FloorMap[]>([]);
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);
  const floorIndexRef = useRef(0);
  const routeRef = useRef<any>(null);
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [allNodes, setAllNodes] = useState<MapNode[]>([]);
  const [allEdges, setAllEdges] = useState<MapEdge[]>([]);
  const [startLocation, setStartLocation] = useState('');
  const [startNodeId, setStartNodeId] = useState<number | undefined>();
  const [endLocation, setEndLocation] = useState('');
  const [endNodeId, setEndNodeId] = useState<number | undefined>();
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [floorSegments, setFloorSegments] = useState<FloorSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [floorChangeNotice, setFloorChangeNotice] = useState<{ show: boolean; text: string }>({ show: false, text: '' });
  const [highlightedCoord, setHighlightedCoord] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Group floorMaps by building for the smart selector
  const groupedFloors = useMemo(() => {
    const groups: { [key: string]: { id: string | number; name: string; floors: any[] } } = {};

    floorMaps.forEach((fm, idx) => {
      const bId = fm.map.building_id || 'campus';
      const bName = fm.isCampus ? 'Khuôn viên' : (buildings.find(b => b.id === fm.map.building_id)?.name || 'Tòa nhà');

      if (!groups[bId]) {
        groups[bId] = { id: bId, name: bName, floors: [] };
      }

      groups[bId].floors.push({
        ...fm,
        originalIndex: idx,
        shortLabel: fm.isCampus ? 'CP' : (fm.map.floor_level === 0 ? 'G' : fm.map.floor_level?.toString() || '??')
      });
    });

    // Sort floors within each building (highest floor on top)
    Object.values(groups).forEach(group => {
      group.floors.sort((a, b) => (b.map.floor_level || 0) - (a.map.floor_level || 0));
    });

    return Object.values(groups);
  }, [floorMaps, buildings]);

  // Find the group containing the current floor
  const currentGroup = useMemo(() => {
    return groupedFloors.find(group =>
      group.floors.some(f => f.originalIndex === currentFloorIndex)
    ) || groupedFloors[0];
  }, [groupedFloors, currentFloorIndex]);

  // Auto-center map on load
  useEffect(() => {
    if (floorMaps.length > 0 && !mapLoading) {
      // Small delay to ensure container is rendered
      const timer = setTimeout(() => {
        if (svgRef.current) {
          const container = svgRef.current.closest('.flex-1');
          if (container) {
            const rect = container.getBoundingClientRect();
            setPosition({
              x: (rect.width - 800) / 2,
              y: (rect.height - 600) / 2
            });
            setScale(1);
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [floorMaps.length, mapLoading]);

  useEffect(() => {
    fetchBuildings().then(() => {
      if (buildings.length === 0) {
        useBuildingStore.getState().buildings.length > 0 && setSelectedBuildingId(useBuildingStore.getState().buildings[0].id);
      }
    });
  }, [fetchBuildings]);

  useEffect(() => {
    if (buildings.length > 0 && !selectedBuildingId) {
      setSelectedBuildingId(buildings[0].id);
    }
  }, [buildings, selectedBuildingId]);

  useEffect(() => {
    const loadMaps = async () => {
      setMapLoading(true);
      try {
        // Load all maps (campus + all buildings)
        const allMaps = await wayfindingMapApi.getAllMaps();
        console.log('[Nav] All maps:', allMaps.map(m => ({ id: m.id, name: m.name, floor: m.floor_level, building: m.building_id })));

        // Load nodes/edges for all maps
        const allFloorData: FloorMap[] = await Promise.all(
          allMaps.map(async (m) => {
            const data = await wayfindingMapApi.getMapWithData(m.id);
            return {
              map: data.map,
              nodes: data.nodes,
              edges: data.edges,
              isCampus: m.floor_level === null,
            };
          })
        );

        // Sort: campus first, then by floor level
        allFloorData.sort((a, b) => {
          if (a.isCampus) return -1;
          if (b.isCampus) return 1;
          return (a.map.floor_level || 0) - (b.map.floor_level || 0);
        });

        setFloorMaps(allFloorData);
        setCurrentFloorIndex(0);
        setCurrentMap(allFloorData[0].map);
        setNodes(allFloorData[0].nodes);
        setEdges(allFloorData[0].edges);

        const allNodesCombined = allFloorData.flatMap(f => f.nodes);
        const allEdgesCombined = allFloorData.flatMap(f => f.edges);
        setAllNodes(allNodesCombined);
        setAllEdges(allEdgesCombined);

        console.log('[Nav] Total floors:', allFloorData.length);
        console.log('[Nav] Maps loaded successfully');
      } catch (err) {
        console.error('Failed to load maps:', err);
      } finally {
        setMapLoading(false);
      }
    };
    loadMaps();
  }, []);

  const searchParams = useSearchParams();
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!mapLoading && allNodes.length > 0 && !initialLoadDone.current) {
      const startId = searchParams.get('start');
      const endId = searchParams.get('end');

      if (startId && endId) {
        const sId = parseInt(startId);
        const eId = parseInt(endId);

        const startNode = allNodes.find(n => n.id === sId);
        const endNode = allNodes.find(n => n.id === eId);

        if (startNode && endNode) {
          setStartLocation(startNode.name);
          setStartNodeId(sId);
          setEndLocation(endNode.name);
          setEndNodeId(eId);
          initialLoadDone.current = true;
        }
      }
    }
  }, [mapLoading, allNodes, searchParams]);

  // Trigger find route automatically when IDs are set from URL
  useEffect(() => {
    if (initialLoadDone.current && startNodeId && endNodeId && !route && !loading) {
      handleFindRoute();
    }
  }, [startNodeId, endNodeId, route, loading, initialLoadDone.current]);

  // Use separate effect for floor change
  useEffect(() => {
    console.log('[Nav] Effect triggered, index:', currentFloorIndex, 'map id:', floorMaps[currentFloorIndex]?.map?.id, 'len:', floorMaps.length);
    if (floorMaps.length > 0) {
      const newMap = floorMaps[currentFloorIndex];
      if (newMap) {
        setCurrentMap(newMap.map);
        setNodes(newMap.nodes);
        setEdges(newMap.edges);
        console.log('[Nav] Switched to floor:', currentFloorIndex, 'map id:', newMap.map.id);
      }
    }
  }, [currentFloorIndex]);

  useEffect(() => {
    if (svgRef.current && position === null) {
      const rect = svgRef.current.getBoundingClientRect();
      setPosition({
        x: (rect.width - MAP_WIDTH) / 2,
        y: (rect.height - MAP_HEIGHT) / 2,
      });
    }
  }, [currentMap, position]);

  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setPosition({
          x: (rect.width - MAP_WIDTH) / 2,
          y: (rect.height - MAP_HEIGHT) / 2,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRefreshCache = async () => {
    try {
      const result = await wayfindingApi.refreshCache();
      toast.success('Đã cập nhật cache', {
        description: `${result.node_count} nodes đã được làm mới.`,
      });
    } catch (err) {
      toast.error('Lỗi khi refresh cache');
    }
  };

  const handleFindRoute = async () => {
    if (!startNodeId || !endNodeId) {
      setError('Please select both start and destination');
      return;
    }

    const mapId = 1;

    setLoading(true);
    setError('');

    try {
      const result = await wayfindingApi.findRoute({
        map_id: mapId,
        start_node_id: startNodeId,
        end_node_id: endNodeId,
      });
      setRoute(result);

      // Group path_coords by floor based on path_node_ids (more accurate than coords)
      const floorPathMap = new Map<number, { coords: number[][], nodes: number[] }>();

      // Determine initial floor from first node ID
      let currentFloorIdx = 0;
      if (result.path_node_ids.length > 0) {
        const firstNodeId = Number(result.path_node_ids[0]); // Ensure number
        const firstNode = allNodes.find(n => n.id === firstNodeId);
        console.log('[Nav] First node:', firstNodeId, 'type:', typeof firstNodeId, 'found:', !!firstNode, 'map_id:', firstNode?.map_id);
        if (firstNode) {
          const initialFloorIdx = floorMaps.findIndex(f => f.map.id === firstNode.map_id);
          console.log('[Nav] Initial floor idx:', initialFloorIdx, 'target map id:', firstNode.map_id);
          if (initialFloorIdx !== -1) {
            currentFloorIdx = initialFloorIdx;
          }
        }
      }

      // NOTE: Don't init - let it be created naturally when adding first node

      // Set initial floor to start node's floor
      console.log('[Nav] Setting floor index to:', currentFloorIdx, 'floorMaps length:', floorMaps.length);
      setCurrentFloorIndex(currentFloorIdx);

      // Also directly set state
      if (currentFloorIdx < floorMaps.length) {
        const targetFloor = floorMaps[currentFloorIdx];
        setCurrentMap(targetFloor.map);
        setNodes(targetFloor.nodes);
        setEdges(targetFloor.edges);
        console.log('[Nav] Direct set map id:', targetFloor.map.id);
      }

      // Build map from node ID to node
      const nodeMap = new Map(allNodes.map(n => [n.id, n]));

      // Process each node in path to determine floor
      let currentCoords: number[][] = [];
      let currentNodes: number[] = [];
      let currentMapId = floorMaps[currentFloorIdx]?.map.id;

      for (let i = 0; i < result.path_node_ids.length; i++) {
        const nodeId = result.path_node_ids[i];
        const coord = result.path_coords[i];
        const node = nodeMap.get(nodeId);

        if (!node) {
          console.log(`[Nav] node ${i}: NOT FOUND in nodeMap`);
          currentCoords.push(coord);
          continue;
        }

        console.log(`[Nav] node ${i}: found, adding to currentFloorIdx=${currentFloorIdx}`);

        // Check if this is a transition node (entrance/stairs/elevator)
        const isTransitionNode = node.type === 'entrance' || node.type === 'stairs' || node.type === 'elevator';

        // Check if map changed - split segment when moving to different map
        const nodeMapId = node.map_id || node.map?.id;
        console.log(`[Nav] node ${i}: nodeMapId=${nodeMapId}, currentMapId=${currentMapId}, currentFloorIdx=${currentFloorIdx}`);

        if (nodeMapId !== currentMapId && currentNodes.length > 0) {
          // Map changed! Save current segment and start new one
          if (!floorPathMap.has(currentFloorIdx)) {
            floorPathMap.set(currentFloorIdx, { coords: [...currentCoords], nodes: [...currentNodes] });
          }
          // Find the new floor index
          const newFloorIdx = floorMaps.findIndex(f => f.map.id === nodeMapId);
          if (newFloorIdx !== -1) {
            currentFloorIdx = newFloorIdx;
            if (nodeMapId !== undefined) currentMapId = nodeMapId;
            currentCoords = [coord];
            currentNodes = [nodeId];
            continue;
          }
        }

        if (isTransitionNode && currentNodes.length > 0) {
          // Find new floor
          const newFloorIdx = floorMaps.findIndex(f => f.map.id === nodeMapId);

          // Only switch floor if it's actually a different floor
          if (newFloorIdx !== -1 && newFloorIdx !== currentFloorIdx) {
            // Save current segment before switching floor (include transition node)
            if (!floorPathMap.has(currentFloorIdx)) {
              floorPathMap.set(currentFloorIdx, { coords: [...currentCoords], nodes: [...currentNodes] });
            }
            // Start new segment with transition node as starting point
            currentFloorIdx = newFloorIdx;
            if (nodeMapId !== undefined) currentMapId = nodeMapId;
            currentCoords = [coord];  // Start new segment with transition node
            currentNodes = [nodeId];
            continue;  // Skip adding coord again below
          }
        }

        // Add to current segment
        currentCoords.push(coord);
        currentNodes.push(nodeId);
      }

      // Save last segment
      if (currentCoords.length > 0) {
        if (!floorPathMap.has(currentFloorIdx)) {
          floorPathMap.set(currentFloorIdx, { coords: currentCoords, nodes: currentNodes });
        }
      }

      // Convert to segments
      const segments: FloorSegment[] = [];
      for (const [floorIdx, data] of floorPathMap.entries()) {
        console.log(`[Nav] floor ${floorIdx} path coords:`, data.coords);
      }
      floorPathMap.forEach((data, floorIdx) => {
        // Find floor change node for this floor (first stairs/elevator in path)
        let floorChangeNode: { x: number; y: number; type: string } | undefined;

        for (const nodeId of data.nodes) {
          const node = nodeMap.get(nodeId);
          if (node && (node.type === 'stairs' || node.type === 'elevator')) {
            floorChangeNode = { x: node.x, y: node.y, type: node.type };
            break;
          }
        }

        segments.push({
          floorIndex: floorIdx,
          pathCoords: data.coords,
          instructions: [],
          floorChangeNode,
        });
      });

      // Sort segments by floor index
      segments.sort((a, b) => a.floorIndex - b.floorIndex);

      // Add instructions to appropriate segments based on floor transition logic
      let instrFloorIdx = 0;
      for (const instr of result.instructions) {
        const coord = instr.coordinate;

        // Check if this instruction is at a transition node
        const transitionNode = allNodes.find(n =>
          (n.type === 'entrance' || n.type === 'stairs' || n.type === 'elevator') &&
          Math.abs(n.x - coord[0]) < 2 && Math.abs(n.y - coord[1]) < 2
        );

        if (transitionNode) {
          const newFloorIdx = floorMaps.findIndex(f => f.map.id === transitionNode.map_id);
          if (newFloorIdx !== -1) {
            instrFloorIdx = newFloorIdx;
          }
        }

        const seg = segments.find(s => s.floorIndex === instrFloorIdx);
        if (seg) {
          seg.instructions.push(instr);
        }
      }

      setFloorSegments(segments);
      console.log('[Nav] Segments:', segments.map(s => ({ floorIndex: s.floorIndex, pathCoordsCount: s.pathCoords.length })));
      console.log('[Nav] floorMaps ids:', floorMaps.map(f => f.map.id));
    } catch (err) {
      const errorMsg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Could not find route. Please try different locations.';
      setError(errorMsg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstructionClick = (coord: number[]) => {
    const node = allNodes.find(n =>
      Math.abs(n.x - coord[0]) < 1 && Math.abs(n.y - coord[1]) < 1
    );

    if (node) {
      const floorIdx = floorMaps.findIndex(f => f.map.id === node.map_id);
      if (floorIdx !== -1 && floorIdx !== currentFloorIndex) {
        setCurrentFloorIndex(floorIdx);
      }

      setHighlightedCoord({ x: node.x, y: node.y });

      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const mapCenterX = MAP_WIDTH / 2;
        const mapCenterY = MAP_HEIGHT / 2;
        setPosition({
          x: rect.width / 2 - node.x * scale,
          y: rect.height / 2 - node.y * scale,
        });
      }
    } else {
      setHighlightedCoord({ x: coord[0], y: coord[1] });
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setPosition({
          x: rect.width / 2 - coord[0] * scale,
          y: rect.height / 2 - coord[1] * scale,
        });
      }
    }
  };

  const handleFloorSwitch = (floorIndex: number) => {
    setHighlightedCoord(null);
    const currentFloor = floorMaps[currentFloorIndex];
    const targetFloor = floorMaps[floorIndex];
    const targetFloorLevel = targetFloor?.map.floor_level;
    const currentFloorLevel = currentFloor?.map.floor_level;
    const targetBuildingName = targetFloor?.map.building?.name;

    let noticeText = '';
    if (targetFloor?.isCampus) {
      noticeText = 'Chuyển qua Campus';
    } else if (targetBuildingName) {
      noticeText = `Chuyển sang ${targetBuildingName} tầng ${targetFloorLevel}`;
    } else if (targetFloorLevel !== undefined && currentFloorLevel !== undefined) {
      if (targetFloorLevel > currentFloorLevel) {
        noticeText = `Chuyển lên tầng ${targetFloorLevel}`;
      } else if (targetFloorLevel < currentFloorLevel) {
        noticeText = `Chuyển xuống tầng ${Math.abs(targetFloorLevel)}`;
      }
    }

    if (noticeText) {
      setFloorChangeNotice({ show: true, text: noticeText });
      setTimeout(() => setFloorChangeNotice({ show: false, text: '' }), 2000);
    }

    setCurrentFloorIndex(floorIndex);
  };

  const handleSwap = () => {
    const tempLocation = startLocation;
    const tempNodeId = startNodeId;
    setStartLocation(endLocation);
    setStartNodeId(endNodeId);
    setEndLocation(tempLocation);
    setEndNodeId(tempNodeId);
  };

  // Map pan/zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.5), 3));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setPosition((p) => p ? { x: p.x + dx, y: p.y + dy } : null);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Get path d string for edge (matching editor style)
  const getEdgePath = (edge: MapEdge) => {
    const startNode = nodes.find((n) => n.id === edge.start_node_id);
    const endNode = nodes.find((n) => n.id === edge.end_node_id);
    if (!startNode || !endNode) return '';

    let d = `M ${startNode.x} ${startNode.y}`;

    if (edge.polyline && edge.polyline.length > 0) {
      edge.polyline.forEach((p) => {
        if (Array.isArray(p) && p.length >= 2) {
          d += ` L ${p[0]} ${p[1]}`;
        }
      });
    }

    d += ` L ${endNode.x} ${endNode.y}`;
    return d;
  };

  const getFloorName = (index: number) => {
    const map = floorMaps[index]?.map;
    if (!map) return '';
    return map.floor_level !== null && map.floor_level !== undefined
      ? (map.floor_level >= 0 ? `Tầng ${map.floor_level}` : `B${Math.abs(map.floor_level)}`)
      : map.name;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-border bg-card px-4 py-3 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.href = '/'}
            className="hover:bg-muted"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="size-8 bg-primary rounded-lg flex items-center justify-center">
            <MapIcon className="size-5 text-primary-foreground" />
          </div>
          <h2 className="text-card-foreground text-base sm:text-lg font-bold leading-tight truncate max-w-[150px] sm:max-w-none">
            {currentMap?.name || 'Campus Pathfinding'}
          </h2>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar - Only show on desktop */}
        {!isMobile && (
          <aside className="w-[320px] lg:w-[420px] border-r border-border flex flex-col bg-card overflow-y-visible z-10 shadow-lg relative">
            <div className="p-4 space-y-4">
              {/* Search */}
              <div className="flex flex-col gap-2">
                <LocationSearch
                  value={startLocation}
                  onChange={(val, nodeId) => {
                    setStartLocation(val);
                    setStartNodeId(nodeId);
                  }}
                  placeholder="Start location..."
                  icon="origin"
                />

                <div className="flex justify-center -my-2 relative z-10">
                  <Button
                    size="icon"
                    onClick={handleSwap}
                    className="rounded-full"
                  >
                    <ArrowUpDown className="size-5" />
                  </Button>
                </div>

                <LocationSearch
                  value={endLocation}
                  onChange={(val, nodeId) => {
                    setEndLocation(val);
                    setEndNodeId(nodeId);
                  }}
                  placeholder="Destination..."
                  icon="destination"
                />
              </div>

              {/* Find Route Button */}
              <Button
                onClick={handleFindRoute}
                disabled={loading || !startNodeId || !endNodeId}
                className="w-full"
                size="lg"
                data-testid="find-route-btn"
              >
                {loading ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Finding route...
                  </>
                ) : (
                  <>
                    <Navigation className="size-4" />
                    Find Route
                  </>
                )}
              </Button>

              <Button
                variant="secondary"
                onClick={handleRefreshCache}
                className="w-full"
                data-testid="refresh-cache-btn"
              >
                <RefreshCw className="size-4" />
                Refresh Map Cache
              </Button>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Separator />

              {/* Directions */}
              {route && (
                <div className="flex flex-col">
                  <div className="flex items-center justify-between px-2 pb-4">
                    <h3 className="text-card-foreground text-lg font-bold leading-tight">Hướng dẫn</h3>
                    <span className="text-xs text-muted-foreground">~{Math.ceil(route.total_distance_m / 80)} phút • {Math.round(route.total_distance_m)}m</span>
                  </div>

                  {floorSegments.length > 1 && (
                    <div className="mb-3 p-3 bg-accent border border-border rounded-lg">
                      <div className="flex items-center gap-2 text-accent-foreground">
                        <span className="material-symbols-outlined">layers</span>
                        <span className="text-sm font-medium">
                          Đường đi qua {floorSegments.length} tầng
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 overflow-y-auto max-h-96 pr-2 custom-scrollbar">
                    {route.instructions.map((instruction, idx) => {
                      const isFloorChange = instruction.action === 'use_stairs' || instruction.action === 'use_elevator';
                      return (
                        <div
                          key={idx}
                          onClick={() => handleInstructionClick(instruction.coordinate)}
                          className={`flex gap-4 p-3 rounded-lg cursor-pointer ${instruction.action === 'start' || instruction.action === 'arrive'
                            ? 'bg-primary/10 border-l-4 border-primary'
                            : isFloorChange
                              ? 'bg-accent border-l-4 border-primary'
                              : 'hover:bg-muted border-l-4 border-transparent'
                            } transition-colors`}
                          data-testid="instruction-item"
                        >
                          <div className="flex flex-col items-center">
                            <div className={`p-2 rounded-full ${instruction.action === 'start' || instruction.action === 'arrive'
                              ? 'bg-primary/10'
                              : isFloorChange
                                ? 'bg-primary/10'
                                : 'bg-muted'
                              }`}>
                              <span className={`material-symbols-outlined ${instruction.action === 'start' || instruction.action === 'arrive'
                                ? 'text-primary'
                                : isFloorChange
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                                }`}>
                                {ACTION_ICONS[instruction.action] || 'straight'}
                              </span>
                            </div>
                            {idx < route.instructions.length - 1 && (
                              <div className="w-0.5 h-full bg-border my-1"></div>
                            )}
                          </div>
                          <div className="flex flex-col justify-center flex-1">
                            <p className="text-sm font-medium text-foreground">{instruction.text}</p>
                            {instruction.distance_m > 0 && (
                              <p className="text-muted-foreground text-xs">{instruction.distance_m}m</p>
                            )}
                          </div>
                          <div className="flex items-center">
                            <span className="material-symbols-outlined text-muted-foreground text-sm">near_me</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!route && !loading && !error && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="material-symbols-outlined text-muted-foreground text-6xl mb-4">directions</span>
                  <p className="text-muted-foreground text-sm">Enter start and destination to find a route</p>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main Map Area */}
        <main className="flex-1 relative bg-muted flex flex-col">
          {/* Mobile Search Form */}
          {isMobile && (
            <div className="bg-card border-b border-border p-3 space-y-2 shadow-sm">
              <div className="flex flex-col gap-2">
                <LocationSearch
                  value={startLocation}
                  onChange={(val, nodeId) => {
                    setStartLocation(val);
                    setStartNodeId(nodeId);
                  }}
                  placeholder="Điểm bắt đầu..."
                  icon="origin"
                />

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <LocationSearch
                      value={endLocation}
                      onChange={(val, nodeId) => {
                        setEndLocation(val);
                        setEndNodeId(nodeId);
                      }}
                      placeholder="Điểm đến..."
                      icon="destination"
                    />
                  </div>
                  <Button
                    onClick={handleSwap}
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                  >
                    <ArrowUpDown className="size-4" />
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleFindRoute}
                disabled={loading || !startNodeId || !endNodeId}
                className="w-full"
              >
                {loading ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Đang tìm...
                  </>
                ) : (
                  <>
                    <Navigation className="size-4" />
                    Tìm đường
                  </>
                )}
              </Button>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 rounded-lg text-xs">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Map Container */}
          <div
            className="flex-1 relative overflow-hidden"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Smart Vertical Floor Selector */}
            {groupedFloors.length > 0 && (
              <div className={`absolute top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3 transition-all duration-300 ${isMobile ? 'right-3' : 'right-6'}`}>
                {/* Building Switcher (if multiple buildings) */}
                {groupedFloors.length > 1 && (
                  <div className="bg-card/80 backdrop-blur-md p-1 rounded-full shadow-lg border border-white/20 flex flex-col items-center gap-1">
                    {groupedFloors.map(group => {
                      const isActive = group.id === currentGroup?.id;
                      return (
                        <Button
                          key={group.id}
                          variant={isActive ? "default" : "ghost"}
                          size="icon"
                          className={`size-8 rounded-full transition-all ${isActive ? 'scale-110 shadow-md' : 'opacity-60 hover:opacity-100'}`}
                          onClick={() => {
                            // Switch to the first floor of this building
                            if (group.floors.length > 0) {
                              setCurrentFloorIndex(group.floors[group.floors.length - 1].originalIndex);
                            }
                          }}
                          title={group.name}
                        >
                          <span className="material-symbols-outlined text-sm">
                            {group.id === 'campus' ? 'park' : 'domain'}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                )}

                {/* Floor Stack */}
                <div className="bg-card/80 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-white/20 flex flex-col gap-1.5 min-w-[40px]">
                  <div className="text-[10px] font-bold text-muted-foreground text-center mb-1 uppercase tracking-wider">
                    {currentGroup?.name.split(' ').pop()}
                  </div>
                  <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto no-scrollbar py-0.5">
                    {currentGroup?.floors.map((f) => {
                      const isActive = f.originalIndex === currentFloorIndex;
                      return (
                        <button
                          key={f.map.id}
                          onClick={() => {
                            setHighlightedCoord(null);
                            setCurrentFloorIndex(f.originalIndex);
                          }}
                          className={`
                            relative size-9 flex items-center justify-center rounded-xl font-bold text-sm transition-all duration-300
                            ${isActive
                              ? 'bg-primary text-primary-foreground scale-110 shadow-lg z-10'
                              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary bg-white/5'
                            }
                          `}
                        >
                          {f.shortLabel}
                          {isActive && (
                            <div className="absolute -left-1 w-1 h-4 bg-primary rounded-full animate-in fade-in slide-in-from-right-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Map Controls - adjusted for mobile */}
            <div className={`absolute flex flex-col gap-1 z-40 ${isMobile ? 'bottom-4 right-4' : 'bottom-6 right-6'}`}>
              <Button
                variant="outline"
                size="icon"
                className={isMobile ? 'size-9' : 'size-10'}
                onClick={() => setScale((s) => Math.min(s * 1.2, 3))}
              >
                <span className="material-symbols-outlined text-lg">add</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={isMobile ? 'size-9' : 'size-10'}
                onClick={() => setScale((s) => Math.max(s * 0.8, 0.5))}
              >
                <span className="material-symbols-outlined text-lg">remove</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={isMobile ? 'size-9' : 'size-10'}
                onClick={() => {
                  setScale(1);
                  if (svgRef.current) {
                    const rect = svgRef.current.getBoundingClientRect();
                    setPosition({ x: (rect.width - MAP_WIDTH) / 2, y: (rect.height - MAP_HEIGHT) / 2 });
                  }
                }}
              >
                <span className="material-symbols-outlined text-lg">fit_screen</span>
              </Button>
            </div>

            {/* Legend - desktop only */}
            {!isMobile && (
              <div className="absolute top-6 left-6 z-40 flex items-center gap-3 bg-card/90 backdrop-blur px-4 py-2 rounded-lg border border-border shadow-md">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-primary rounded-full"></div>
                  <span className="text-xs text-muted-foreground">Route</span>
                </div>
                <div className="w-px h-4 bg-border"></div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-muted-foreground rounded-full"></div>
                  <span className="text-xs text-muted-foreground">Path</span>
                </div>
                <div className="w-px h-4 bg-border"></div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                  <span className="text-xs text-muted-foreground">Stairs</span>
                </div>
              </div>
            )}

            {mapLoading ? (
              <div className="flex items-center justify-center h-full">
                <span className="material-symbols-outlined text-4xl animate-spin text-muted-foreground">sync</span>
              </div>
            ) : floorMaps.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <span className="material-symbols-outlined text-6xl mb-4">domain</span>
                  <p>No buildings found. Please create a building first.</p>
                </div>
              </div>
            ) : (
              <UnifiedMapView
                floorMaps={floorMaps}
                floorSegments={floorSegments}
                currentFloorIndex={currentFloorIndex}
                scale={scale}
                position={position}
                isDragging={isDragging}
                svgRef={svgRef}
                getFullImageUrl={getFullImageUrl}
                renderFloorContent={(floorIndex, is3D) => {
                  const isTargetFloor = floorIndex === currentFloorIndex;
                  const fm = floorMaps[floorIndex];
                  if (!fm) return null;

                  const fmNodes = fm.nodes;
                  const fmEdges = fm.edges;

                  return (
                    <g>
                      {/* Edges - Hidden by default as requested to keep the map clean */}

                      {/* Route Path animated dashed line for 2D mode */}
                      {!is3D && route && (() => {
                        const currentSegs = floorSegments.filter(seg => seg.floorIndex === floorIndex);
                        return currentSegs.map((segment, idx) => {
                          const pathData = `M ${segment.pathCoords.map(c => `${c[0]} ${c[1]}`).join(' L ')}`;
                          return (
                            <path
                              key={`route-seg-${idx}`}
                              d={pathData}
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="drop-shadow-lg"
                            />
                          );
                        });
                      })()}

                      {/* Nodes - only show all nodes if not in 3D */}
                      {!is3D && isTargetFloor && fmNodes.map((node) => (
                        <g key={node.id}>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.type === 'room' ? 12 : 8}
                            fill={NODE_COLORS[node.type] || NODE_COLORS.path}
                            stroke="white"
                            strokeWidth={2}
                          />
                          {node.name && node.name !== 'New Node' && (
                            <text
                              x={node.x}
                              y={node.y - 15}
                              textAnchor="middle"
                              fill="#1f2937"
                              fontSize="10"
                              fontWeight="500"
                            >
                              {node.name}
                            </text>
                          )}
                        </g>
                      ))}

                      {/* Start/End Markers */}
                      {route && (() => {
                        const startCoord = route.path_coords[0];
                        const startNode = allNodes.find(n =>
                          Math.abs(n.x - startCoord[0]) < 2 && Math.abs(n.y - startCoord[1]) < 2
                        );
                        const startFloorIdx = startNode
                          ? floorMaps.findIndex(f => f.map.id === startNode.map_id)
                          : -1;

                        const endCoord = route.path_coords[route.path_coords.length - 1];
                        const endNode = allNodes.find(n =>
                          Math.abs(n.x - endCoord[0]) < 2 && Math.abs(n.y - endCoord[1]) < 2
                        );
                        const endFloorIdx = endNode
                          ? floorMaps.findIndex(f => f.map.id === endNode.map_id)
                          : -1;

                        return (
                          <>
                            {startFloorIdx === floorIndex && (
                              <g>
                                <circle cx={startCoord[0]} cy={startCoord[1]} r={is3D ? "20" : "14"} fill="#2563eb" />
                                <circle cx={startCoord[0]} cy={startCoord[1]} r={is3D ? "12" : "8"} fill="white" />
                                {!is3D && (
                                  <text x={startCoord[0] + 20} y={startCoord[1] + 5} fill="#1e40af" fontSize="12" fontWeight="bold">
                                    BẮT ĐẦU
                                  </text>
                                )}
                              </g>
                            )}
                            {endFloorIdx === floorIndex && (
                              <g>
                                <circle cx={endCoord[0]} cy={endCoord[1]} r={is3D ? "20" : "14"} fill="#dc2626" />
                                <circle cx={endCoord[0]} cy={endCoord[1]} r={is3D ? "12" : "8"} fill="white" />
                                {!is3D && (
                                  <text x={endCoord[0] + 20} y={endCoord[1] + 5} fill="#991b1b" fontSize="12" fontWeight="bold">
                                    ĐÍCH ĐẾN
                                  </text>
                                )}
                              </g>
                            )}
                          </>
                        );
                      })()}

                      {/* Highlighted instruction marker */}
                      {!is3D && isTargetFloor && highlightedCoord && (
                        <g>
                          <circle cx={highlightedCoord.x} cy={highlightedCoord.y} r="20" fill="#10b981" fillOpacity="0.3" />
                          <circle cx={highlightedCoord.x} cy={highlightedCoord.y} r="12" fill="#10b981" stroke="white" strokeWidth="3" />
                          <circle cx={highlightedCoord.x} cy={highlightedCoord.y} r="5" fill="white" />
                        </g>
                      )}

                      {/* TRANSITION BUTTONS */}
                      {!is3D && isTargetFloor && route && floorSegments.length > 1 && (() => {
                        const currentSeg = floorSegments.find(s => s.floorIndex === currentFloorIndex);
                        const transitionNodes = fmNodes.filter(n =>
                          (n.type === 'stairs' || n.type === 'elevator') &&
                          currentSeg?.pathCoords.some(coord => Math.abs(n.x - coord[0]) < 2 && Math.abs(n.y - coord[1]) < 2)
                        );

                        return transitionNodes.map((node, idx) => {
                          const firstCoord = currentSeg?.pathCoords[0];
                          const lastCoord = currentSeg?.pathCoords[currentSeg.pathCoords.length - 1];
                          const isEntryPoint = firstCoord && Math.abs(node.x - firstCoord[0]) < 2 && Math.abs(node.y - firstCoord[1]) < 2;
                          const isExitPoint = lastCoord && Math.abs(node.x - lastCoord[0]) < 2 && Math.abs(node.y - lastCoord[1]) < 2;

                          let nextFloorIdx = -1;
                          let prevFloorIdx = -1;
                          const currentSegIdx = floorSegments.findIndex(s => s.floorIndex === currentFloorIndex);
                          if (currentSegIdx < floorSegments.length - 1) nextFloorIdx = floorSegments[currentSegIdx + 1].floorIndex;
                          if (currentSegIdx > 0) prevFloorIdx = floorSegments[currentSegIdx - 1].floorIndex;

                          return (
                            <g key={`trans-${currentFloorIndex}-${idx}`}>
                              {isEntryPoint && prevFloorIdx !== -1 && (
                                <g onClick={(e) => { e.stopPropagation(); handleFloorSwitch(prevFloorIdx); }} className="cursor-pointer">
                                  <circle cx={node.x - 50} cy={node.y} r="24" fill="#fbbf24" stroke="white" strokeWidth="2" className="hover:fill-amber-500 transition-all" />
                                  <path d={`M${node.x - 40},${node.y - 6} L${node.x - 58},${node.y} L${node.x - 40},${node.y + 6}`} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                                  <text x={node.x - 50} y={node.y + 40} textAnchor="middle" fill="#b45309" fontSize="10" fontWeight="600">
                                    {floorMaps[prevFloorIdx]?.isCampus ? 'Campus' : `Tầng ${floorMaps[prevFloorIdx]?.map.floor_level}`}
                                  </text>
                                </g>
                              )}
                              {isExitPoint && nextFloorIdx !== -1 && (
                                <g onClick={(e) => { e.stopPropagation(); handleFloorSwitch(nextFloorIdx); }} className="cursor-pointer">
                                  <circle cx={node.x + 50} cy={node.y} r="24" fill="#fbbf24" stroke="white" strokeWidth="2" className="hover:fill-amber-500 transition-all" />
                                  <path d={`M${node.x + 40},${node.y - 6} L${node.x + 58},${node.y} L${node.x + 40},${node.y + 6}`} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                                  <text x={node.x + 50} y={node.y + 40} textAnchor="middle" fill="#b45309" fontSize="10" fontWeight="600">
                                    {floorMaps[nextFloorIdx]?.isCampus ? 'Campus' : `Tầng ${floorMaps[nextFloorIdx]?.map.floor_level}`}
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        });
                      })()}
                    </g>
                  );
                }}
              />
            )}

            {/* Floor Change Notice Overlay */}
            {floorChangeNotice.show && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
                <div className="bg-primary text-primary-foreground px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-pulse">
                  <span className="material-symbols-outlined text-2xl">floor</span>
                  <span className="text-lg font-semibold">{floorChangeNotice.text}</span>
                </div>
              </div>
            )}

            {/* Mobile Bottom Sheet Directions */}
            {isMobile && route && (
              <div className="absolute bottom-0 left-0 right-0 z-20 bg-card rounded-t-2xl shadow-2xl max-h-[50vh] flex flex-col">
                {/* Handle */}
                <div className="flex justify-center py-2">
                  <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Navigation className="size-5 text-primary" />
                    <span className="font-semibold">Hướng dẫn</span>
                    <span className="text-xs text-muted-foreground">• ~{Math.ceil(route.total_distance_m / 80)} phút</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                    {isSidebarOpen ? 'Thu gọn' : 'Mở rộng'}
                  </Button>
                </div>

                {/* Floor indicator */}
                {floorSegments.length > 1 && (
                  <div className="px-4 pb-2">
                    <div className="flex items-center gap-2 text-xs bg-accent px-3 py-1.5 rounded-full w-fit">
                      <span className="material-symbols-outlined text-sm">layers</span>
                      <span>Qua {floorSegments.length} tầng</span>
                    </div>
                  </div>
                )}

                {/* Instructions list */}
                <div className="overflow-y-auto px-2 pb-4 flex-1 custom-scrollbar">
                  {isSidebarOpen ? (
                    <div className="space-y-1 px-2">
                      {route.instructions.map((instruction, idx) => {
                        const isFloorChange = instruction.action === 'use_stairs' || instruction.action === 'use_elevator';
                        return (
                          <div
                            key={idx}
                            onClick={() => handleInstructionClick(instruction.coordinate)}
                            className={`flex gap-3 p-2.5 rounded-lg cursor-pointer ${instruction.action === 'start' || instruction.action === 'arrive'
                              ? 'bg-primary/10'
                              : isFloorChange
                                ? 'bg-accent'
                                : 'hover:bg-muted'
                              } transition-colors`}
                            data-testid="instruction-item"
                          >
                            <div className="flex flex-col items-center">
                              <div className={`p-1.5 rounded-full ${instruction.action === 'start' || instruction.action === 'arrive'
                                ? 'bg-primary/20'
                                : isFloorChange
                                  ? 'bg-primary/20'
                                  : 'bg-muted'
                                }`}>
                                <span className={`material-symbols-outlined ${instruction.action === 'start' || instruction.action === 'arrive'
                                  ? 'text-primary'
                                  : isFloorChange
                                    ? 'text-primary'
                                    : 'text-muted-foreground'
                                  }`} style={{ fontSize: '18px' }}>
                                  {ACTION_ICONS[instruction.action] || 'straight'}
                                </span>
                              </div>
                              {idx < route.instructions.length - 1 && (
                                <div className="w-0.5 flex-1 min-h-[20px] bg-border my-1" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                              <p className="text-sm font-medium text-foreground leading-tight">{instruction.text}</p>
                              {instruction.distance_m > 0 && (
                                <p className="text-xs text-muted-foreground mt-0.5">{instruction.distance_m}m</p>
                              )}
                            </div>
                            <div className="flex items-center pt-1">
                              <span className="material-symbols-outlined text-muted-foreground" style={{ fontSize: '16px' }}>near_me</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex gap-2 px-2 overflow-x-auto pb-2 custom-scrollbar">
                      {route.instructions.slice(0, 5).map((instruction, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            handleInstructionClick(instruction.coordinate);
                            setIsSidebarOpen(true);
                          }}
                          className={`flex-shrink-0 flex items-center gap-2 p-2 rounded-lg cursor-pointer ${instruction.action === 'start' || instruction.action === 'arrive'
                            ? 'bg-primary/10'
                            : instruction.action === 'use_stairs' || instruction.action === 'use_elevator'
                              ? 'bg-accent'
                              : 'bg-muted hover:bg-muted/80'
                            }`}
                        >
                          <span className="material-symbols-outlined text-sm">trip_origin</span>
                          <span className="text-xs font-medium truncate max-w-[120px]">{instruction.text}</span>
                        </div>
                      ))}
                      {route.instructions.length > 5 && (
                        <div className="flex-shrink-0 flex items-center gap-1 p-2 rounded-lg bg-muted text-muted-foreground">
                          <span className="text-xs">+{route.instructions.length - 5}</span>
                          <span className="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
