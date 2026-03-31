'use client';

import { useState, useRef, useEffect, useMemo, MouseEvent } from 'react';
import { useEditorStore } from '@/stores/editor.store';
import { useBuildingStore } from '@/stores/building.store';
import { mapApi } from '@/services/maps-api';
import { editorApi } from '@/services/editor-api';
import { MapData, MapNode, MapEdge, ToolType, NodeFormData, EdgeFormData, Building } from '@/types';
import { getFullImageUrl } from '@/services/wayfinding-client';
import { BuildingModal } from './BuildingModal';
import { EditorInspector } from './EditorInspector';
import { MapOverlay } from './MapOverlay';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  { id: 'select' as ToolType, label: 'Select Tool', icon: 'near_me', description: 'Chọn và di chuyển đối tượng' },
  { id: 'add-node' as ToolType, label: 'Add Node', icon: 'add_circle', description: 'Thêm điểm mới vào bản đồ' },
  { id: 'add-edge' as ToolType, label: 'Add Edge', icon: 'conversion_path', description: 'Nối hai điểm với nhau' },
];

export default function EditorPage() {
  const { maps, currentMap, nodes, edges, activeTool, selectedId, selectedType, isEditing, setMap, setMaps, setNodes, setEdges, setTool, selectItem, addNode, updateNode, deleteNode, addEdge, deleteEdge, setEditing } = useEditorStore();
  const buildings = useBuildingStore((state) => state.buildings);
  const fetchBuildings = useBuildingStore((state) => state.fetchBuildings);
  
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [edgeStartNodeId, setEdgeStartNodeId] = useState<number | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [virtualMouse, setVirtualMouse] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const startPanRef = useRef({ x: 0, y: 0 });
  const [showBuildingModal, setShowBuildingModal] = useState(false);

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
      try {
        const [fetchedNodes, fetchedEdges] = await Promise.all([
          editorApi.getNodes(currentMap.id),
          editorApi.getEdges(currentMap.id)
        ]);
        setNodes(fetchedNodes);
        setEdges(fetchedEdges);
      } catch (error) {
        console.error('Failed to load map data:', error);
      }
    };
    loadData();
  }, [currentMap?.id]);

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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.5), 5));
  };

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
      const node = nodes.find(n => n.id === draggingNodeId);
      if (node) {
        try {
          await editorApi.updateNode(node.id, { x: node.x, y: node.y });
        } catch (err) {
          console.error('Error saving node:', err);
        }
      }
      setDraggingNodeId(null);
    }
    setIsDragging(false);
  };

  const handleBgClick = async () => {
    if (!currentMap) return;

    if (activeTool === 'add-node') {
      const tempId = Date.now();
      const newNodePayload = {
        map_id: currentMap.id,
        name: 'New Node',
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

  const handleNodeClick = async (e: React.MouseEvent, nodeId: number) => {
    e.stopPropagation();

    if (activeTool === 'select') {
      if (isEditing && selectedId === nodeId) {
        setDraggingNodeId(nodeId);
      } else {
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

  const handleEdgeClick = (e: React.MouseEvent, edgeId: number) => {
    e.stopPropagation();
    if (activeTool === 'select') {
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
    try {
      await mapApi.delete(currentMap.id);
      setMaps(maps.filter(m => m.id !== currentMap.id));
      if (maps.length > 1) {
        const nextMap = maps.find(m => m.id !== currentMap.id);
        if (nextMap) setMap(nextMap);
      } else {
        setMap(null);
      }
      alert('Đã xóa bản đồ!');
    } catch (error) {
      console.error('Error deleting map:', error);
      alert('Lỗi khi xóa bản đồ');
    }
  };

  const cursorStyle = activeTool === 'select' 
    ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') 
    : 'cursor-crosshair';

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <EditorHeader 
        maps={maps}
        currentMapId={currentMap?.id}
        onMapChange={(newId) => {
          const selectedMap = maps.find(m => m.id === newId);
          if (selectedMap) setMap(selectedMap);
        }}
        onDelete={handleDeleteMap}
        onOpenBuildingModal={() => setShowBuildingModal(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <aside className="w-64 h-full border-r border-border bg-card flex flex-col p-4 gap-6 shadow-sm z-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-2">Editor Tools</h1>
            
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
                      <p className="text-sm font-bold">{tool.label}</p>
                      <p className={`text-[10px] ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {tool.id === 'select' ? 'Click to select' : 'Click map to add'}
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

            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                ref={svgRef}
                className={`w-full h-full touch-none ${cursorStyle}`}
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                onWheel={handleWheel}
                onMouseDown={(e) => {
                  if (activeTool === 'select') handleMouseDown(e);
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => setDraggingNodeId(null)}
                onClick={handleBgClick}
              >
                {currentMap && (
                  <g
                    ref={groupRef}
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                      transformOrigin: '0 0',
                      transition: isDragging ? 'none' : 'transform 0.1s ease-out',
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
                            stroke={isSelected ? '#2563eb' : '#1C4D8D'}
                            strokeWidth={isSelected ? 4 : 2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
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
                          onClick={(e) => handleNodeClick(e, node.id)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={isSelected ? 14 : 10}
                            fill={NODE_COLORS[node.type] || NODE_COLORS.path}
                            stroke={isSelected ? '#2563eb' : 'white'}
                            strokeWidth={isSelected ? 3 : 2}
                          />
                          {node.name && (
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
                      );
                    })}

                    {activeTool === 'add-node' && (
                      <circle
                        cx={virtualMouse.x}
                        cy={virtualMouse.y}
                        r="8"
                        fill="rgba(59, 130, 246, 0.5)"
                        stroke="#2563eb"
                        strokeWidth="2"
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
                    ? 'Kéo để di chuyển • Cuộn để Zoom'
                    : activeTool === 'add-node'
                      ? 'Click để đặt Node'
                      : 'Click Node bắt đầu -> Click nền thêm điểm -> Click Node kết thúc'}
                </span>
              </div>
            )}
          </main>
        </div>

        <EditorInspector 
          buildings={buildings} 
          nodes={nodes}
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
              editorApi.getNodes(currentMap.id).then(setNodes);
            }
          }}
          onRefreshBuildings={fetchBuildings}
          currentMap={currentMap}
        />
      </div>
    </div>
  );
}

function EditorHeader({
  maps,
  currentMapId,
  onMapChange,
  onDelete,
  onOpenBuildingModal,
}: {
  maps: MapData[];
  currentMapId?: number;
  onMapChange: (mapId: number) => void;
  onDelete?: () => void;
  onOpenBuildingModal?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentMap = maps.find(m => m.id === currentMapId);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const campusMaps = maps.filter(m => !m.building_id);
  const buildingMaps = maps.filter(m => m.building_id);

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 z-30 shadow-sm relative">
      <div className="flex-1 flex items-center justify-start">
        <button 
          onClick={() => window.location.href = '/'}
          className="group flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary transition-all shadow-sm"
          title="Quay lại Dashboard"
        >
          <span className="material-symbols-outlined text-xl group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 flex justify-center min-w-0 px-4" ref={dropdownRef}>
        <div className="relative w-full max-w-md">
          <div 
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center justify-between gap-3 px-4 py-2 rounded-full border bg-card cursor-pointer transition-all select-none
              ${isOpen ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-border hover:border-primary/50 hover:shadow-md'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-card shadow-sm transition-colors shrink-0
                ${currentMap?.building_id ? 'bg-primary' : 'bg-primary'}`}>
                <span className="material-symbols-outlined text-lg">
                  {currentMap?.building_id ? 'apartment' : 'map'}
                </span>
              </div>
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none mb-0.5">
                  {currentMap ? (currentMap.building_id ? 'Building Map' : 'Campus Map') : 'Select Map'}
                </span>
                <h1 className="text-sm font-bold text-foreground truncate max-w-[200px]">
                  {currentMap ? currentMap.name : 'Chọn bản đồ...'}
                </h1>
              </div>
            </div>
            <span className={`material-symbols-outlined text-muted-foreground text-xl transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}>
              expand_more
            </span>
          </div>

          {isOpen && (
            <div className="absolute top-full mt-2 w-full bg-card rounded-2xl shadow-xl border border-border overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
              <div className="max-h-[60vh] overflow-y-auto py-2 custom-scrollbar">
                {campusMaps.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/50">
                      Bản đồ chung
                    </div>
                    {campusMaps.map(map => (
                      <div 
                        key={map.id}
                        onClick={() => { onMapChange(map.id); setIsOpen(false); }}
                        className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${map.id === currentMapId ? 'bg-primary/10' : 'hover:bg-muted'}`}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-primary shrink-0 bg-primary/10">
                          <span className="material-symbols-outlined text-lg">map</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold truncate ${map.id === currentMapId ? 'text-primary' : 'text-foreground'}`}>
                            {map.name}
                          </h4>
                        </div>
                        {map.id === currentMapId && (
                          <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {buildingMaps.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/50">
                      Bản đồ tòa nhà
                    </div>
                    {buildingMaps.map(map => (
                      <div 
                        key={map.id}
                        onClick={() => { onMapChange(map.id); setIsOpen(false); }}
                        className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${map.id === currentMapId ? 'bg-primary/10' : 'hover:bg-muted'}`}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-primary shrink-0 bg-primary/10">
                          <span className="material-symbols-outlined text-lg">apartment</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold truncate ${map.id === currentMapId ? 'text-primary' : 'text-foreground'}`}>
                            {map.name}
                          </h4>
                          {map.building_id && (
                            <p className="text-[10px] text-muted-foreground truncate">ID Tòa nhà: #{map.building_id}</p>
                          )}
                        </div>
                        {map.id === currentMapId && (
                          <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {maps.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground italic">
                    Chưa có bản đồ nào
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-end gap-3">
        {onOpenBuildingModal && (
          <button 
            onClick={onOpenBuildingModal}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all"
            title="Quản lý tòa nhà"
          >
            <span className="material-symbols-outlined">apartment</span>
          </button>
        )}
        {currentMapId && onDelete && (
          <button 
            onClick={onDelete}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all"
            title="Xóa bản đồ"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
        )}
      </div>
    </header>
  );
}

function OldEditorSidebar({ buildings, nodes }: { buildings: Building[]; nodes: MapNode[] }) {
  const { currentMap, edges, selectedId, selectedType, isEditing, updateNode, deleteNode, deleteEdge, setEditing } = useEditorStore();

  const data = selectedType === 'node' ? nodes.find(n => n.id === selectedId) : edges.find(e => e.id === selectedId);
  
  const [editedData, setEditedData] = useState<NodeFormData | EdgeFormData | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [linkedNodeSearch, setLinkedNodeSearch] = useState('');
  const [showLinkedNodeDropdown, setShowLinkedNodeDropdown] = useState(false);
  const [showBuildingModal, setShowBuildingModal] = useState(false);

  const formData = useMemo(() => {
    if (!data) return editedData;
    if (selectedType === 'node') {
      const nodeData = data as MapNode;
      return {
        ...nodeData,
        aliases: nodeData.aliases || [],
        linked_node_ids: nodeData.linked_node_ids || [],
      };
    }
    return data as EdgeFormData;
  }, [data, selectedType, editedData]);

  const linkedNodeOptions = useMemo(() => {
    const nodeData = formData as NodeFormData;
    if (!nodeData) return [];
    const currentLinkedIds = nodeData.linked_node_ids || [];
    const searchLower = linkedNodeSearch.toLowerCase();
    return nodes
      .filter(n => 
        n.id !== selectedId && 
        !currentLinkedIds.includes(n.id) &&
        (linkedNodeSearch === '' || 
          n.name.toLowerCase().includes(searchLower) ||
          String(n.id).includes(linkedNodeSearch))
      )
      .slice(0, 10);
  }, [nodes, selectedId, linkedNodeSearch, formData]);

  const linkedNodeNames = useMemo(() => {
    const nodeData = formData as NodeFormData;
    if (!nodeData?.linked_node_ids?.length) return [];
    return nodeData.linked_node_ids
      .map(id => nodes.find(n => n.id === id))
      .filter(Boolean) as MapNode[];
  }, [formData, nodes]);

  const handleChange = (field: string, value: unknown) => {
    if (!formData) return;
    const currentData = { ...formData };
    (currentData as Record<string, unknown>)[field] = value;
    setEditedData(currentData as NodeFormData | EdgeFormData);
  };

  const handleSave = async () => {
    if (!formData || !selectedId) return;
    try {
      if (selectedType === 'node' && 'name' in formData) {
        const nodeData = formData as NodeFormData;
        const aliases = nodeData.aliases?.map((a) => (typeof a === 'string' ? a : a.name)) || [];
        await editorApi.updateNode(selectedId, {
          name: nodeData.name,
          type: nodeData.type,
          aliases,
          linked_node_ids: nodeData.linked_node_ids,
          building_id: nodeData.building_id,
        });
        updateNode(selectedId, { ...nodeData, aliases });
      }
      setEditedData(null);
      setEditing(false);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Lỗi khi lưu!');
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('Bạn có chắc muốn xóa?')) return;
    try {
      if (selectedType === 'node') {
        await editorApi.deleteNode(selectedId);
        deleteNode(selectedId);
      } else if (selectedType === 'edge') {
        await editorApi.deleteEdge(selectedId);
        deleteEdge(selectedId);
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Lỗi khi xóa!');
    }
  };

  const handleAddAlias = () => {
    if (!aliasInput.trim() || !formData || selectedType !== 'node') return;
    const nodeData = formData as NodeFormData;
    handleChange('aliases', [...(nodeData.aliases || []), { name: aliasInput.trim() }]);
    setAliasInput('');
  };

  const handleRemoveAlias = (index: number) => {
    if (!formData || selectedType !== 'node') return;
    const nodeData = formData as NodeFormData;
    const currentAliases = nodeData.aliases || [];
    handleChange('aliases', currentAliases.filter((_: unknown, i: number) => i !== index));
  };

  const handleAddLinkedNode = (nodeId: number) => {
    const nodeData = formData as NodeFormData;
    handleChange('linked_node_ids', [...(nodeData.linked_node_ids || []), nodeId]);
    setLinkedNodeSearch('');
    setShowLinkedNodeDropdown(false);
  };

  const handleRemoveLinkedNode = (nodeId: number) => {
    const nodeData = formData as NodeFormData;
    handleChange('linked_node_ids', (nodeData.linked_node_ids || []).filter(id => id !== nodeId));
  };

  if (!currentMap) {
    return <aside className="w-80 bg-card border-l border-border" />;
  }

  if (!formData || !selectedType) {
    return (
      <aside className="w-80 h-full border-l border-border bg-card flex flex-col p-0 shadow-xl z-20">
        <div className="h-40 bg-muted relative overflow-hidden">
          <img src={currentMap.image_url} className="w-full h-full object-cover opacity-50" alt="Map" />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent"></div>
          <div className="absolute bottom-4 left-6">
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Current Map</span>
            <h2 className="text-xl font-bold text-foreground mt-1 truncate w-64">{currentMap.name}</h2>
          </div>
        </div>
        <div className="p-6 text-center text-muted-foreground">
          <p className="text-sm">Chọn một đối tượng để xem chi tiết</p>
        </div>
      </aside>
    );
  }

  const isNode = selectedType === 'node';
  const nodeData = isNode ? (formData as NodeFormData) : null;
  const edgeData = !isNode ? (formData as EdgeFormData) : null;

  return (
    <aside className="w-80 h-full border-l border-border bg-card flex flex-col shadow-xl z-20 animate-in slide-in-from-right duration-300">
      <div className="px-6 py-5 border-b border-border bg-muted/50 flex justify-between items-start">
        <div className="flex-1 mr-2">
          <span className={`flex items-center gap-1.5 w-fit px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border mb-2
            ${isNode ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary text-secondary-foreground border-secondary'}`}>
            {isNode ? 'Location' : 'Connection'} <span className="opacity-50 mx-1">|</span> #{formData.id}
          </span>
          {isEditing && isNode ? (
            <input
              type="text"
              value={isNode ? (formData as NodeFormData).name : ''}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full bg-background px-2 py-1 rounded border border-input focus:outline-none focus:ring-2 focus:ring-ring text-lg font-bold text-foreground"
              autoFocus
              placeholder="Tên địa điểm..."
            />
          ) : (
            <h2 className="text-lg font-bold text-foreground leading-tight truncate">
              {isNode ? (formData as NodeFormData).name : (formData as EdgeFormData).type}
            </h2>
          )}
        </div>
        <button
          onClick={() => isEditing ? handleSave() : setEditing(true)}
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-all 
            ${isEditing ? 'bg-primary text-primary-foreground shadow-lg hover:bg-primary/90' : 'bg-background text-muted-foreground border border-border hover:text-primary hover:border-primary'}`}
        >
          <span className="material-symbols-outlined text-lg">{isEditing ? 'check' : 'edit'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            {isNode && nodeData && (
          <>
            <div className="p-4 rounded-xl bg-muted border border-border">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Coordinates</h4>
                {isEditing && <span className="text-[10px] text-primary italic animate-pulse">Kéo thả trên map</span>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium mb-1 block">X</label>
                  <div className="font-mono text-sm text-foreground font-bold bg-background px-2 py-1.5 rounded border border-border">
                    {Math.round(nodeData.x || 0)}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Y</label>
                  <div className="font-mono text-sm text-foreground font-bold bg-background px-2 py-1.5 rounded border border-border">
                    {Math.round(nodeData.y || 0)}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-foreground mb-2 block">Loại địa điểm</label>
              <Select
                disabled={!isEditing}
                value={nodeData.type}
                onValueChange={(value) => handleChange('type', value)}
              >
                <SelectTrigger className={`w-full ${isEditing ? 'bg-background border-input' : 'bg-muted border-transparent cursor-not-allowed'}`}>
                  <SelectValue placeholder="Chọn loại địa điểm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="path">Điểm trung gian (Path)</SelectItem>
                  <SelectItem value="room">Phòng (Room)</SelectItem>
                  <SelectItem value="stairs">Cầu thang</SelectItem>
                  <SelectItem value="elevator">Thang máy</SelectItem>
                  <SelectItem value="entrance">Cổng ra vào</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Chi tiết tòa nhà</h4>
                {nodeData.building_id && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Đã thiết lập</span>}
              </div>

              {nodeData.building_id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined">domain</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Tòa nhà trực thuộc</div>
                      <div className="text-sm font-bold truncate">
                        {buildings.find(b => b.id === nodeData.building_id)?.name || `Building #${nodeData.building_id}`}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowBuildingModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-background border border-border text-muted-foreground text-xs font-bold hover:bg-muted hover:text-primary hover:border-primary/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                    Quản lý / Đổi tòa nhà
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBuildingModal(true)}
                  className="group relative w-full py-4 rounded-xl overflow-hidden bg-background border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 transition-all duration-300"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined">domain_add</span>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-foreground">Thiết lập tòa nhà</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Thêm tầng & bản đồ chi tiết</div>
                    </div>
                  </div>
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Tên gọi khác (Alias)</h4>
                {(nodeData.aliases?.length ?? 0) > 0 && (
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                    {nodeData.aliases?.length} tên
                  </span>
                )}
              </div>
              
              <div className="space-y-2 mb-3">
                {(nodeData.aliases || []).map((alias, index) => {
                  const aliasName = typeof alias === 'string' ? alias : alias.name;
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-muted rounded-lg border border-border text-sm text-foreground">
                        {aliasName}
                      </div>
                      {isEditing && (
                        <button
                          onClick={() => handleRemoveAlias(index)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {isEditing && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Thêm tên gọi..."
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
                    className="flex-1 px-3 py-2 rounded-lg border text-foreground border-input text-sm focus:outline-none focus:border-primary bg-background"
                  />
                  <Button onClick={handleAddAlias}>
                    Thêm
                  </Button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Nhấn Enter để thêm</p>
            </div>

            {isNode && (
              <div className="pt-4 border-t border-border">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Node liên kết (Cross-floor)</h4>
                  {linkedNodeNames.length > 0 && (
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                      {linkedNodeNames.length} nodes
                    </span>
                  )}
                </div>
                
                <div className="space-y-2 mb-3">
                  {linkedNodeNames.map((linkedNode) => (
                    <div key={linkedNode.id} className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-muted rounded-lg border border-border text-sm text-foreground">
                        <span className="font-mono text-muted-foreground">#{linkedNode.id}</span> {linkedNode.name}
                      </div>
                      {isEditing && (
                        <button
                          onClick={() => handleRemoveLinkedNode(linkedNode.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {isEditing && (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Tìm node để liên kết..."
                      value={linkedNodeSearch}
                      onChange={(e) => {
                        setLinkedNodeSearch(e.target.value);
                        setShowLinkedNodeDropdown(true);
                      }}
                      onFocus={() => setShowLinkedNodeDropdown(true)}
                      className="w-full px-3 py-2 rounded-lg border text-foreground border-input text-sm focus:outline-none focus:border-primary bg-background"
                    />
                    {showLinkedNodeDropdown && linkedNodeOptions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {linkedNodeOptions.map((opt) => (
                          <div
                            key={opt.id}
                            onClick={() => handleAddLinkedNode(opt.id)}
                            className="px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                          >
                            <span className="font-mono text-muted-foreground">#{opt.id}</span> {opt.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Dùng để kết nối giữa các tầng/các tòa</p>
              </div>
            )}
          </>
        )}

        {!isNode && edgeData && (
          <>
            <div className="flex items-center justify-between p-3 bg-muted rounded border border-border">
              <div className="text-xs text-muted-foreground">Kết nối</div>
              <div className="text-xs font-bold font-mono text-foreground">
                #{edgeData.start_node_id} <span className="mx-1 text-muted-foreground">→</span> #{edgeData.end_node_id}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Weight</label>
                <input
                  type="number"
                  disabled={!isEditing}
                  value={edgeData.weight || 0}
                  onChange={(e) => handleChange('weight', parseFloat(e.target.value))}
                  className={`w-full px-3 py-2 rounded-lg border text-sm font-mono font-bold text-foreground outline-none ${
                    isEditing ? 'bg-background border-input focus:border-primary' : 'bg-muted border-transparent'
                  }`}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Type</label>
                <Select
                  disabled={!isEditing}
                  value={edgeData.type}
                  onValueChange={(value) => handleChange('type', value)}
                >
                  <SelectTrigger className={`w-full ${isEditing ? 'bg-background border-input' : 'bg-muted border-transparent'}`}>
                    <SelectValue placeholder="Chọn loại" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk">Đi bộ</SelectItem>
                    <SelectItem value="stairs">Thang bộ</SelectItem>
                    <SelectItem value="elevator">Thang máy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="bidirectional"
                disabled={!isEditing}
                checked={edgeData.bidirectional ?? true}
                onChange={(e) => handleChange('bidirectional', e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="bidirectional" className="text-sm text-foreground cursor-pointer">
                Đường đi 2 chiều
              </label>
            </div>
          </>
        )}
      </div>

      {isEditing ? (
        <div className="p-4 border-t border-border bg-background grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => setEditing(false)}>
            Hủy bỏ
          </Button>
          <Button onClick={handleSave}>
            Lưu thay đổi
          </Button>
        </div>
      ) : (
        <div className="p-4 border-t border-border bg-muted/50">
          <Button
            variant="destructive"
            onClick={handleDelete}
            className="w-full"
          >
            <span className="material-symbols-outlined text-sm mr-2">delete</span> Xóa đối tượng
          </Button>
        </div>
      )}

      {showBuildingModal && selectedType === 'node' && (
        <BuildingModal
          nodeId={selectedId ?? undefined}
          initialBuildingId={nodeData?.building_id}
          onClose={() => setShowBuildingModal(false)}
          onSuccess={() => {
            if (selectedId) {
              editorApi.getNodeById(selectedId).then((updatedNode) => {
                updateNode(selectedId, updatedNode);
                setEditedData({
                  ...updatedNode,
                  aliases: (updatedNode.aliases || []) as string[],
                  linked_node_ids: updatedNode.linked_node_ids || [],
                } as unknown as NodeFormData);
              });
            }
            setShowBuildingModal(false);
          }}
        />
      )}
    </aside>
  );
}
