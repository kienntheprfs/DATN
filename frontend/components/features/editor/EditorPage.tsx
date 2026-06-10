'use client';

import { useState, useRef, useEffect, useMemo, useCallback, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/stores/editor.store';
import { useBuildingStore } from '@/stores/building.store';
import { mapApi } from '@/services/maps-api';
import { editorApi } from '@/services/editor-api';
import { useConfirmStore } from '@/stores/confirm.store';
import { MapData, MapNode, MapEdge, ToolType, Building } from '@/types';
import { getFullImageUrl } from '@/services/wayfinding-client';
import { BuildingModal } from './BuildingModal';
import { EditorInspector } from './EditorInspector';
import { EditorHeader } from './EditorHeader';
import { MapOverlay } from './MapOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

const NODE_COLORS: Record<string, string> = {
  path: '#6b7280',
  room: '#8b5cf6',
  entrance: '#22c55e',
  stairs: '#f59e0b',
  elevator: '#3b82f6',
};

const TOOLS = [
  { id: 'select' as ToolType, label: 'Chọn', icon: 'near_me', description: 'Chọn và di chuyển đối tượng' },
  { id: 'add-node' as ToolType, label: 'Thêm điểm', icon: 'add_circle', description: 'Thêm điểm mới vào bản đồ' },
  { id: 'add-edge' as ToolType, label: 'Nối đường', icon: 'conversion_path', description: 'Nối hai điểm với nhau' },
];

export default function EditorPage() {
  const { maps, currentMap, nodes, edges, activeTool, selectedId, selectedType, isEditing, setMap, setMaps, setNodes, setEdges, setTool, selectItem, addNode, updateNode, deleteNode, addEdge, deleteEdge, setEditing, updateMapInList } = useEditorStore();
  const buildings = useBuildingStore((state) => state.buildings);
  const fetchBuildings = useBuildingStore((state) => state.fetchBuildings);
  const confirm = useConfirmStore((state) => state.confirm);

  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isWheeling, setIsWheeling] = useState(false);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [edgeStartNodeId, setEdgeStartNodeId] = useState<number | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [virtualMouse, setVirtualMouse] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false); // For node positions
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false); // For inspector fields

  const [localScaleRatio, setLocalScaleRatio] = useState<string>('1.0');
  const [isSavingScale, setIsSavingScale] = useState(false);
  const [isLoadingMapData, setIsLoadingMapData] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const startPanRef = useRef({ x: 0, y: 0 });
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const [buildingNodes, setBuildingNodes] = useState<MapNode[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges || hasUnsavedEdits) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, hasUnsavedEdits]);

  useEffect(() => {
    if (currentMap) {
      setLocalScaleRatio(currentMap.scale_ratio.toString());
    }
  }, [currentMap?.id]);

  // Reset edge drawing state when switching tools
  useEffect(() => {
    setEdgeStartNodeId(null);
    setDrawingPath([]);
  }, [activeTool]);

  // Cancel edge drawing with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeTool === 'add-edge' && edgeStartNodeId !== null) {
          setEdgeStartNodeId(null);
          setDrawingPath([]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, edgeStartNodeId]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [mapsData] = await Promise.all([
          mapApi.getAll(),
          fetchBuildings()
        ]);
        setMaps(mapsData);
        if (mapsData.length > 0 && !currentMap) {
          setMap(mapsData[0]);
        }
      } catch (error) {
        console.error('Failed to load maps:', error);
      }
    };
    loadData();
  }, [fetchBuildings, setMaps, setMap, currentMap]);

  useEffect(() => {
    if (!currentMap?.id) return;

    const loadData = async () => {
      setIsLoadingMapData(true);
      try {
        const [fetchedNodes, fetchedEdges] = await Promise.all([
          editorApi.getNodes(currentMap.id),
          editorApi.getEdges(currentMap.id)
        ]);
        setNodes(fetchedNodes);
        setEdges(fetchedEdges);
      } catch (error) {
        console.error('Failed to load map data:', error);
      } finally {
        setIsLoadingMapData(false);
      }
    };
    loadData();
  }, [currentMap?.id]);

  const selectedNode = useMemo(() => 
    selectedType === 'node' ? nodes.find(n => n.id === selectedId) : null
  , [nodes, selectedId, selectedType]);

  const nodeCache = useRef<Record<number, MapNode[]>>({});
  const [buildingMaps, setBuildingMaps] = useState<MapData[]>([]);

  // Calculate building maps based on current building/node
  useEffect(() => {
    const buildingId = currentMap?.building_id || selectedNode?.building_id;
    if (!buildingId || !maps.length) {
      setBuildingMaps([]);
      return;
    }

    const bMaps = maps.filter((m) => 
      m.building_id === buildingId && 
      m.id !== currentMap?.id
    );
    setBuildingMaps(bMaps);
  }, [maps, currentMap?.id, currentMap?.building_id, selectedNode?.building_id]);

  useEffect(() => {
    if (!buildingMaps.length) {
      setBuildingNodes([]);
      return;
    }
    
    let isCurrent = true;
    const loadBuildingNodes = async () => {
      try {
        const results = await Promise.all(buildingMaps.map(async (m) => {
          if (!isCurrent) return [];
          if (nodeCache.current[m.id]) {
            return nodeCache.current[m.id];
          }
          const fetchedNodes = await editorApi.getNodes(m.id);
          nodeCache.current[m.id] = fetchedNodes;
          return fetchedNodes;
        }));
        if (isCurrent) setBuildingNodes(results.flat());
      } catch (error) {
        if (isCurrent) console.error('Failed to load building nodes:', error);
      }
    };

    loadBuildingNodes();
    return () => { isCurrent = false; };
  }, [buildingMaps]);

  const getMapCoordinates = (e: MouseEvent) => {
    const svg = svgRef.current;
    const group = groupRef.current;
    if (!svg || !group) return { x: 0, y: 0 };

    let point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;

    const ctm = group.getScreenCTM();
    if (ctm) {
      point = point.matrixTransform(ctm.inverse());
    }
    return { x: point.x, y: point.y };
  };

  const zoomWithAnchor = useCallback(
    (nextScale: number, anchor?: { clientX: number; clientY: number }) => {
      const clampedScale = Math.min(Math.max(nextScale, 0.5), 5);
      if (clampedScale === scale) return;

      const svg = svgRef.current;
      if (!svg) {
        setScale(clampedScale);
        return;
      }

      const rect = svg.getBoundingClientRect();
      // If no anchor provided, use center of SVG
      const clientX = anchor ? anchor.clientX : rect.left + rect.width / 2;
      const clientY = anchor ? anchor.clientY : rect.top + rect.height / 2;

      const ratio = clampedScale / scale;
      
      const newX = clientX - (clientX - position.x) * ratio;
      const newY = clientY - (clientY - position.y) * ratio;

      setScale(clampedScale);
      setPosition({ x: newX, y: newY });
    },
    [scale, position]
  );

  useEffect(() => {
    const handleNativeWheel = (e: WheelEvent) => {
      const svg = svgRef.current;
      if (!svg) return;

      // Check if mouse is over the SVG or its children
      const isOverSvg = svg.contains(e.target as Node);
      if (!isOverSvg) return;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Use a slightly smaller factor for smoother zoom
        const delta = Math.max(-120, Math.min(120, e.deltaY));
        const zoomFactor = Math.exp(-delta * 0.0015);
        zoomWithAnchor(scale * zoomFactor, { clientX: e.clientX, clientY: e.clientY });
      } else {
        // Panning with touchpad (2 fingers) or mouse wheel
        e.preventDefault();
        
        setIsWheeling(true);
        if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        wheelTimeoutRef.current = setTimeout(() => setIsWheeling(false), 100);

        setPosition(pos => ({
          x: pos.x - e.deltaX,
          y: pos.y - e.deltaY
        }));
      }
    };

    window.addEventListener('wheel', handleNativeWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleNativeWheel, true);
  }, [scale, zoomWithAnchor]);

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    startPanRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    const coords = getMapCoordinates(e);
    setVirtualMouse(coords);
    setCursorCoords({ x: Math.round(coords.x), y: Math.round(coords.y) });

    if (draggingNodeId !== null && isEditing) {
      updateNode(draggingNodeId, { x: coords.x, y: coords.y });
      return;
    }

    if (activeTool === 'select' && isDragging) {
      setPosition({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
    }
  };

  const handleMouseUp = async () => {
    if (draggingNodeId !== null) {
      setHasUnsavedChanges(true);
      setDraggingNodeId(null);
    }
    setIsDragging(false);
  };

  const handleSavePositions = async () => {
    if (!hasUnsavedChanges) return;
    
    setIsLoadingMapData(true);
    try {
      // Save all current nodes positions
      await Promise.all(nodes.map(node => 
        editorApi.updateNode(node.id, { x: node.x, y: node.y })
      ));
      setHasUnsavedChanges(false);
      toast.success('Đã lưu vị trí các node!');
    } catch (err) {
      console.error('Error saving positions:', err);
      toast.error('Lỗi khi lưu vị trí');
    } finally {
      setIsLoadingMapData(false);
    }
  };

  const handleBgClick = async () => {
    if (!currentMap) return;

    if (activeTool === 'add-node') {
      const tempId = Date.now();
      const newNodePayload = {
        map_id: currentMap.id,
        name: 'Node mới',
        x: virtualMouse.x,
        y: virtualMouse.y,
        type: 'path' as const
      };

      addNode({ ...newNodePayload, id: tempId } as MapNode);

      try {
        const savedNode = await editorApi.createNode(newNodePayload);
        deleteNode(tempId);
        addNode(savedNode);
      } catch (error) {
        console.error('Error creating node:', error);
        deleteNode(tempId);
      }
    }

    if (activeTool === 'add-edge' && edgeStartNodeId !== null) {
      setDrawingPath((prev) => [...prev, { x: virtualMouse.x, y: virtualMouse.y }]);
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: number) => {
    if (e.button !== 0 || activeTool !== 'select') return;
    e.stopPropagation();

    if (isEditing) {
      if (selectedId === nodeId && selectedType === 'node') {
        setDraggingNodeId(nodeId);
      } else {
        if (!hasUnsavedEdits) {
          selectItem('node', nodeId);
          setDraggingNodeId(nodeId);
        }
      }
    }
  };

  const handleNodeClick = async (e: React.MouseEvent, nodeId: number) => {
    e.stopPropagation();

    if (activeTool === 'select') {
      if (selectedId !== nodeId || selectedType !== 'node') {
        if (hasUnsavedEdits) {
          const confirmed = await confirm({
            title: "Thay đổi chưa lưu",
            description: "Bạn đang chỉnh sửa thông tin nhưng chưa lưu. Chuyển sang đối tượng khác sẽ mất các thay đổi này?",
            variant: 'destructive',
            style: 'square'
          });
          if (!confirmed) return;
          setHasUnsavedEdits(false);
        }
        selectItem('node', nodeId);
      }
    } else if (activeTool === 'add-edge') {
      if (edgeStartNodeId === null) {
        setEdgeStartNodeId(nodeId);
        const startNode = nodes.find(n => n.id === nodeId);
        if (startNode) {
          setDrawingPath([{ x: startNode.x, y: startNode.y }]);
          setVirtualMouse({ x: startNode.x, y: startNode.y });
        }
      } else {
        if (edgeStartNodeId !== nodeId) {
          const formattedPolyline = drawingPath
            .slice(1)
            .map((p) => [p.x, p.y]);

          const newEdgePayload = {
            start_node_id: edgeStartNodeId,
            end_node_id: nodeId,
            type: 'walk' as const,
            bidirectional: true,
            polyline: formattedPolyline,
          };

          try {
            const savedEdge = await editorApi.createEdge(newEdgePayload);
            addEdge(savedEdge);
          } catch (error) {
            console.error('Error creating edge:', error);
          }
        }

        setEdgeStartNodeId(null);
        setDrawingPath([]);
      }
    }
  };

  const handleEdgeClick = async (e: React.MouseEvent, edgeId: number) => {
    e.stopPropagation();
    if (activeTool === 'select') {
      if (hasUnsavedEdits) {
        const confirmed = await confirm({
          title: "Thay đổi chưa lưu",
          description: "Bạn đang chỉnh sửa thông tin nhưng chưa lưu. Chuyển sang đối tượng khác sẽ mất các thay đổi này?",
          variant: 'destructive',
          style: 'square'
        });
        if (!confirmed) return;
        setHasUnsavedEdits(false);
      }
      selectItem('edge', edgeId);
    }
  };

  const getEdgePath = (edge: MapEdge) => {
    const startNode = nodes.find(n => n.id === edge.start_node_id);
    const endNode = nodes.find(n => n.id === edge.end_node_id);
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

  const getPolylineString = (points: { x: number; y: number }[]) => {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  };

  const handleDeleteMap = async () => {
    if (!currentMap) return;
    
    const confirmed = await confirm({
      title: "Xác nhận xóa bản đồ",
      description: "Bạn có chắc chắn muốn xóa bản đồ này? Tất cả dữ liệu liên quan (điểm, đường đi) sẽ bị xóa vĩnh viễn.",
      variant: 'destructive',
      confirmText: 'Xóa bản đồ'
    });

    if (!confirmed) return;
    try {
      await mapApi.delete(currentMap.id);
      setMaps(maps.filter(m => m.id !== currentMap.id));
      if (maps.length > 1) {
        const nextMap = maps.find(m => m.id !== currentMap.id);
        if (nextMap) setMap(nextMap);
      } else {
        setMap(null);
      }
      toast.success('Đã xóa bản đồ!');
    } catch (error) {
      console.error('Error deleting map:', error);
      toast.error('Lỗi khi xóa bản đồ', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      });
    }
  };

  const handleSaveScale = async () => {
    if (!currentMap) return;
    const newRatio = parseFloat(localScaleRatio);
    if (isNaN(newRatio) || newRatio <= 0) {
      toast.error('Tỉ lệ không hợp lệ');
      return;
    }

    setIsSavingScale(true);
    try {
      await mapApi.updateMap(currentMap.id, { scale_ratio: newRatio });
      updateMapInList(currentMap.id, { scale_ratio: newRatio });

      // Refresh edges since their weights might have changed in the backend
      const fetchedEdges = await editorApi.getEdges(currentMap.id);
      setEdges(fetchedEdges);

      toast.success('Đã cập nhật tỉ lệ bản đồ và tính lại weights!');
    } catch (err) {
      console.error('Error saving scale:', err);
      toast.error('Lỗi khi lưu tỉ lệ');
    } finally {
      setIsSavingScale(false);
    }
  };

  const cursorStyle = activeTool === 'select'
    ? (isDragging ? 'cursor-grabbing' : 'cursor-grab')
    : 'cursor-crosshair';

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <EditorHeader
        maps={maps}
        currentMapId={currentMap?.id}
        onMapChange={async (newId) => {
          if (hasUnsavedChanges || hasUnsavedEdits) {
            const confirmed = await confirm({
              title: "Thay đổi chưa lưu",
              description: "Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn chuyển trang và mất các thay đổi này?",
              variant: 'destructive',
              style: 'square'
            });
            if (!confirmed) return;
            setHasUnsavedChanges(false);
            setHasUnsavedEdits(false);
          }
          const selectedMap = maps.find(m => m.id === newId);
          if (selectedMap) setMap(selectedMap);
        }}
        onDelete={handleDeleteMap}
        onOpenBuildingModal={() => setShowBuildingModal(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <aside className="w-64 h-full border-r border-border bg-card flex flex-col p-4 gap-6 shadow-sm z-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-muted-foreground text-xs font-black uppercase tracking-widest mb-2 opacity-50">Công cụ vẽ</h1>

            <div className="flex flex-col gap-2">
              {TOOLS.map((tool) => {
                const isActive = activeTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setTool(tool.id)}
                    title={tool.description}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-left group
                      ${isActive
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent hover:border-border'
                      }
                    `}
                  >
                    <span className={`material-symbols-outlined text-xl ${isActive ? '' : 'text-muted-foreground group-hover:text-foreground'}`}>
                      {tool.icon}
                    </span>
                    <div>
                      <p className="text-sm font-black uppercase tracking-tight">{tool.label}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-tight ${isActive ? 'text-primary-foreground/60' : 'text-muted-foreground/60'}`}>
                        {isActive ? 'Đang kích hoạt' : 'Chọn để kích hoạt'}
                      </p>
                    </div>
                    {isActive && (
                      <span className="material-symbols-outlined text-sm ml-auto text-primary-foreground/80">check</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {hasUnsavedChanges && (
            <div className="flex flex-col gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider text-center">Có thay đổi vị trí</p>
              <Button 
                size="sm" 
                className="w-full bg-amber-600 hover:bg-amber-700 text-white border-none shadow-sm h-8 text-[11px] font-bold uppercase tracking-wider"
                onClick={handleSavePositions}
                disabled={isLoadingMapData}
              >
                {isLoadingMapData ? 'Đang lưu...' : 'Lưu tất cả'}
              </Button>
            </div>
          )}

          {/* Map Configuration Section */}
          <div className="flex flex-col gap-4 p-4 bg-muted/10 border border-border/60 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary">straighten</span>
                <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Cấu hình Tỉ lệ</h2>
              </div>
              {currentMap?.id && (
                <Badge variant="outline" className="font-mono text-[9px] border-primary/20 text-primary bg-primary/5">
                  ID: #{currentMap.id}
                </Badge>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between items-end px-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Tỉ lệ m/px</label>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={localScaleRatio}
                    onChange={(e) => setLocalScaleRatio(e.target.value)}
                    placeholder="1.0"
                    className="h-8 text-xs bg-background border-border focus-visible:ring-primary/20 font-mono font-black"
                    type="number"
                    step="0.001"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 text-[10px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90"
                    onClick={handleSaveScale}
                    disabled={!!(isSavingScale || !currentMap)}
                  >
                    {isSavingScale ? <span className="material-symbols-outlined text-sm animate-spin">sync</span> : "Lưu"}
                  </Button>
                </div>
              </div>

              <div className="p-2 bg-primary/5 rounded border border-primary/10">
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight opacity-70">
                  Phục vụ tính toán lộ trình & thời gian thực tế.
                </p>
              </div>
            </div>
          </div>

          {/* Building Management Section */}
          <div className="flex flex-col gap-4 p-4 bg-muted/10 border border-border/60 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-primary">corporate_fare</span>
              <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Hạ tầng</h2>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBuildingModal(true)}
              className="h-9 w-full justify-start gap-2 border-border/60 hover:bg-muted font-black text-[10px] uppercase tracking-widest rounded-lg"
            >
              <span className="material-symbols-outlined text-lg text-primary">layers</span>
              Quản lý tòa nhà
            </Button>
          </div>

          <div className="mt-auto pt-4 border-t border-border">
            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground font-mono">
              <div className="flex justify-between">
                <span>X:</span>
                <span className="text-foreground font-bold">{cursorCoords.x} px</span>
              </div>
              <div className="flex justify-between">
                <span>Y:</span>
                <span className="text-foreground font-bold">{cursorCoords.y} px</span>
              </div>
              <div className="flex justify-between mt-2">
                <span>Tool:</span>
                <span className="text-primary font-bold uppercase">{activeTool.replace('-', ' ')}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 relative flex flex-col min-w-0">
          <main className="flex-1 relative bg-muted overflow-hidden">
            {!currentMap && (
              <MapOverlay onUploadSuccess={setMap} />
            )}

            {(isLoadingMapData || !currentMap) && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/40 backdrop-blur-[2px]">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-xl animate-pulse">map</span>
                  </div>
                </div>
                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-primary animate-pulse">
                  Đang nạp dữ liệu bản đồ...
                </p>
              </div>
            )}

            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                ref={svgRef}
                className={`w-full h-full touch-none outline-none ${cursorStyle}`}
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                onMouseDown={(e) => {
                  if (activeTool === 'select') handleMouseDown(e);
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleBgClick}
                onContextMenu={(e) => {
                  if (activeTool === 'add-edge' && edgeStartNodeId !== null) {
                    e.preventDefault();
                    setEdgeStartNodeId(null);
                    setDrawingPath([]);
                  }
                }}
              >
                {currentMap && (
                  <g
                    ref={groupRef}
                        style={{
                          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                          transformOrigin: '0 0',
                          transition: (isDragging || isWheeling) ? 'transform 0.05s linear' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
                        }}
                  >
                    <image
                      href={getFullImageUrl(currentMap.image_url)}
                      x="0"
                      y="0"
                      width={MAP_WIDTH}
                      height={MAP_HEIGHT}
                      preserveAspectRatio="xMidYMid meet"
                    />

                    {edges.map((edge) => {
                      const pathData = getEdgePath(edge);
                      if (!pathData) return null;
                      const isSelected = selectedType === 'edge' && selectedId === edge.id;
                      const isCrossFloor = !nodes.find(n => n.id === edge.start_node_id) || !nodes.find(n => n.id === edge.end_node_id);
                      
                      return (
                        <g key={edge.id}>
                          <path
                            d={pathData}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={10}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="cursor-pointer"
                            onClick={(e) => handleEdgeClick(e, edge.id)}
                          />
                          <path
                            d={pathData}
                            fill="none"
                            stroke={isSelected ? '#2563eb' : (isCrossFloor ? '#94a3b8' : '#1C4D8D')}
                            strokeWidth={isSelected ? 4 : 2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={isCrossFloor ? "5,5" : "none"}
                            className="pointer-events-none"
                          />
                        </g>
                      );
                    })}

                    {nodes.map((node) => {
                      const isSelected = selectedType === 'node' && selectedId === node.id;
                      return (
                        <g
                          key={node.id}
                          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                          onClick={(e) => handleNodeClick(e, node.id)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={isSelected ? 6 : 4}
                            fill={NODE_COLORS[node.type] || NODE_COLORS.path}
                            stroke={isSelected ? '#2563eb' : 'white'}
                            strokeWidth={isSelected ? 2 : 1.5}
                          />
                          {node.name && node.name.toLowerCase() !== 'new node' && (
                            <text
                              x={node.x}
                              y={node.y - 12}
                              textAnchor="middle"
                              fill="#020260"
                              fontSize="12"
                              fontWeight="800"
                              className="select-none pointer-events-none uppercase tracking-tight"
                              stroke="white"
                              strokeWidth="2.5"
                              paintOrder="stroke"
                            >
                              {node.name}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {activeTool === 'add-node' && (
                      <circle
                        cx={virtualMouse.x}
                        cy={virtualMouse.y}
                        r="5"
                        fill="rgba(59, 130, 246, 0.5)"
                        stroke="#2563eb"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        className="pointer-events-none"
                      />
                    )}

                    {activeTool === 'add-edge' && edgeStartNodeId !== null && drawingPath.length > 0 && (
                      <>
                        <polyline
                          points={getPolylineString(drawingPath)}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="2"
                        />
                        <line
                          x1={drawingPath[drawingPath.length - 1].x}
                          y1={drawingPath[drawingPath.length - 1].y}
                          x2={virtualMouse.x}
                          y2={virtualMouse.y}
                          stroke="#2563eb"
                          strokeWidth="2"
                          strokeDasharray="5 5"
                          className="pointer-events-none"
                        />
                        {drawingPath.map((p, idx) => (
                          <circle key={idx} cx={p.x} cy={p.y} r="3" fill="#2563eb" />
                        ))}
                      </>
                    )}
                  </g>
                )}
              </svg>
            </div>

            {currentMap && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-foreground/80 text-background font-bold rounded-full shadow-2xl">
                <span className="material-symbols-outlined text-xl">mouse</span>
                <span className="text-sm">
                  {activeTool === 'select'
                    ? 'Chuột trái để di chuyển • Ctrl + Cuộn để Zoom • Cuộn/2-ngón để Pan'
                    : activeTool === 'add-node'
                      ? 'Click để đặt Node'
                      : edgeStartNodeId !== null
                        ? 'Đang nối đường: Click nền thêm điểm -> Click Node kết thúc (ESC/Phải chuột để Hủy)'
                        : 'Click Node bắt đầu -> Click nền thêm điểm -> Click Node kết thúc'}
                </span>
              </div>
            )}
          </main>
        </div>

        <EditorInspector
          buildings={buildings}
          nodes={nodes}
          edges={edges}
          selectedId={selectedId}
          selectedType={selectedType}
          isEditing={isEditing}
          onSelect={selectItem}
          onNodeUpdate={updateNode}
          onNodeDelete={deleteNode}
          onEdgeDelete={deleteEdge}
          onSetEditing={setEditing}
          onRefreshNodes={() => {
            if (currentMap?.id) {
              editorApi.getNodes(currentMap.id).then((fetchedNodes) => {
                setNodes(fetchedNodes);
                // Update cache for the current map
                nodeCache.current[currentMap.id] = fetchedNodes;
              });
            }
            // Building nodes are already tracked via buildingMaps effect
          }}
          onRefreshEdges={() => {
            if (currentMap?.id) {
              editorApi.getEdges(currentMap.id).then(setEdges);
            }
          }}
          onRefreshBuildings={fetchBuildings}
          currentMap={currentMap}
          buildingMaps={buildingMaps}
          buildingNodes={buildingNodes}
          hasUnsavedChanges={hasUnsavedChanges}
          onUnsavedEditsChange={setHasUnsavedEdits}
        />
        {showBuildingModal && (
          <BuildingModal
            initialBuildingId={currentMap?.building_id}
            onClose={() => setShowBuildingModal(false)}
            onSuccess={() => {
              fetchBuildings();
              setShowBuildingModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
}


