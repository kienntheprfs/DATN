'use client';

import { useState, useRef, MouseEvent } from 'react';
import { MapData, MapNode, MapEdge, ToolType } from '@/types';
import { editorApi } from '@/services/editor-api';
import { getFullImageUrl } from '@/services/wayfinding-client';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

const NODE_COLORS: Record<string, string> = {
  path: '#6b7280',
  room: '#8b5cf6',
  entrance: '#22c55e',
  stairs: '#f59e0b',
  elevator: '#3b82f6',
};

interface EditorCanvasProps {
  currentMap: MapData | null;
  nodes: MapNode[];
  edges: MapEdge[];
  activeTool: ToolType;
  selectedId: number | null;
  selectedType: 'node' | 'edge' | null;
  isEditing: boolean;
  onSelect: (type: 'node' | 'edge' | null, id: number | null) => void;
  onNodeAdd: (node: MapNode) => void;
  onNodeUpdate: (id: number, data: Partial<MapNode>) => void;
  onNodeDelete: (id: number) => void;
  onEdgeAdd: (edge: MapEdge) => void;
  onCursorMove: (x: number, y: number) => void;
}

export function EditorCanvas({
  currentMap,
  nodes,
  edges,
  activeTool,
  selectedId,
  selectedType,
  isEditing,
  onSelect,
  onNodeAdd,
  onNodeUpdate,
  onNodeDelete,
  onEdgeAdd,
  onCursorMove,
}: EditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null);
  const [edgeStartNodeId, setEdgeStartNodeId] = useState<number | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [virtualMouse, setVirtualMouse] = useState({ x: 0, y: 0 });
  const startPanRef = useRef({ x: 0, y: 0 });

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
    if (e.button !== 0 || !currentMap) return;
    if (activeTool === 'select') {
      setIsDragging(true);
      startPanRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const coords = getMapCoordinates(e);
    setVirtualMouse(coords);
    onCursorMove(coords.x, coords.y);

    if (draggingNodeId !== null && isEditing) {
      onNodeUpdate(draggingNodeId, { x: coords.x, y: coords.y });
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
      const node = nodes.find((n) => n.id === draggingNodeId);
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
      const newNode = {
        map_id: currentMap.id,
        name: 'Node mới',
        x: virtualMouse.x,
        y: virtualMouse.y,
        type: 'path' as const,
      };

      onNodeAdd({ ...newNode, id: Date.now() } as MapNode);

      try {
        const savedNode = await editorApi.createNode(newNode);
        onNodeAdd(savedNode);
        onNodeDelete(Date.now());
        onNodeAdd(savedNode);
      } catch (error) {
        console.error('Error creating node:', error);
        onNodeDelete(Date.now());
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
        onSelect('node', nodeId);
      }
    } else if (activeTool === 'add-edge') {
      if (edgeStartNodeId === null) {
        setEdgeStartNodeId(nodeId);
        const startNode = nodes.find((n) => n.id === nodeId);
        if (startNode) {
          setDrawingPath([{ x: startNode.x, y: startNode.y }]);
          setVirtualMouse({ x: startNode.x, y: startNode.y });
        }
      } else {
        if (edgeStartNodeId !== nodeId) {
          const formattedPolyline = drawingPath
            .slice(1)
            .map((p) => [p.x, p.y]);

          const newEdge = {
            start_node_id: edgeStartNodeId,
            end_node_id: nodeId,
            type: 'walk' as const,
            bidirectional: true,
            polyline: formattedPolyline,
          };

          try {
            const savedEdge = await editorApi.createEdge(newEdge);
            onEdgeAdd(savedEdge);
          } catch (error) {
            console.error('Error creating edge:', error);
          }
        }

        setEdgeStartNodeId(null);
        setDrawingPath([]);
      }
    }
  };

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

  const getPolylineString = (points: { x: number; y: number }[]) => {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  };

  const cursorStyle = activeTool === 'select' 
    ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') 
    : 'cursor-crosshair';

  return (
    <main className="flex-1 relative bg-muted overflow-hidden">
      {!currentMap && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <span className="text-6xl mb-4 block">🗺️</span>
            <p>Chọn một bản đồ để bắt đầu chỉnh sửa</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          key={currentMap?.id ?? 'empty'}
          ref={svgRef}
          className={`w-full h-full touch-none ${cursorStyle}`}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
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
                      stroke={isSelected ? '#2563eb' : '#1C4D8D'}
                      strokeWidth={isSelected ? 4 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-muted-foreground/80 text-muted rounded-full text-sm font-medium">
          <span>👆</span>
          <span>
            {activeTool === 'select'
              ? 'Kéo để di chuyển • Cuộn để Zoom'
              : activeTool === 'add-node'
                ? 'Click để đặt Node'
                : 'Click node bắt đầu → Click node kết thúc'}
          </span>
        </div>
      )}
    </main>
  );
}
