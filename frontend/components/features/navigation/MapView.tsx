'use client';

import { useRef, useState, MouseEvent } from 'react';
import { MapData, MapNode, MapEdge, RouteResponse, FloorSegment } from '@/types';
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

interface FloorMap {
  map: MapData;
  nodes: MapNode[];
  edges: MapEdge[];
}

interface MapViewProps {
  currentMap: MapData | null;
  nodes: MapNode[];
  edges: MapEdge[];
  allNodes: MapNode[];
  route: RouteResponse | null;
  floorSegments: FloorSegment[];
  currentFloorIndex: number;
  highlightedCoord: { x: number; y: number } | null;
  floorMaps: FloorMap[];
  onInstructionClick: (coordinate: number[]) => void;
  onFloorSwitch: (floorIndex: number) => void;
}

export function MapView({
  currentMap,
  nodes,
  edges,
  route,
  floorSegments,
  currentFloorIndex,
  highlightedCoord,
  floorMaps,
  onFloorSwitch,
}: MapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.5), 3));
  };

  const handleMouseDown = (e: MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setPosition((p) => ({ x: p.x + dx, y: p.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsDragging(false);

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

  return (
    <div className="relative flex-1 bg-gray-200">
      <svg
        ref={svgRef}
        className={`w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {currentMap && (
            <image
              href={getFullImageUrl(currentMap.image_url)}
              x="0"
              y="0"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              preserveAspectRatio="xMidYMid meet"
              className="opacity-90"
            />
          )}

          {edges.map((edge) => {
            const pathData = getEdgePath(edge);
            if (!pathData) return null;
            return (
              <g key={edge.id}>
                <path
                  d={pathData}
                  fill="none"
                  stroke="white"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-90"
                />
                <path
                  d={pathData}
                  fill="none"
                  stroke="#1C4D8D"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {route && floorSegments
            .filter((seg) => seg.floorIndex === currentFloorIndex)
            .map((segment, idx) => {
              const pathData = `M ${segment.pathCoords.map((c) => `${c[0]} ${c[1]}`).join(' L ')}`;
              return (
                <path
                  key={`route-seg-${idx}`}
                  d={pathData}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

          {nodes.map((node) => (
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

          {route && (
            <>
              <StartEndMarkers route={route} allNodes={nodes} currentFloorIndex={currentFloorIndex} />
            </>
          )}

          {highlightedCoord && <HighlightMarker coord={highlightedCoord} />}

          {route && floorSegments.length > 1 && (
            <TransitionButtons
              floorSegments={floorSegments}
              currentFloorIndex={currentFloorIndex}
              floorMaps={floorMaps}
              nodes={nodes}
              onFloorSwitch={onFloorSwitch}
            />
          )}
        </g>
      </svg>

      <div className="absolute bottom-6 right-6 flex flex-col gap-2">
        <button
          onClick={() => setScale((s) => Math.min(s * 1.2, 3))}
          className="bg-background p-2 rounded-lg border shadow-sm hover:bg-muted"
        >
          ➕
        </button>
        <button
          onClick={() => setScale((s) => Math.max(s * 0.8, 0.5))}
          className="bg-background p-2 rounded-lg border shadow-sm hover:bg-muted"
        >
          ➖
        </button>
        <button
          onClick={() => {
            setScale(1);
            if (svgRef.current) {
              const rect = svgRef.current.getBoundingClientRect();
              setPosition({ x: (rect.width - MAP_WIDTH) / 2, y: (rect.height - MAP_HEIGHT) / 2 });
            }
          }}
          className="bg-background p-2 rounded-lg border shadow-sm hover:bg-muted mt-2"
        >
          🔲
        </button>
      </div>

      <div className="absolute top-4 left-4 flex items-center gap-3 bg-background/90 px-3 py-2 rounded-lg border shadow-sm text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-600 rounded-full" />
          <span>Route</span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gray-400 rounded-full" />
          <span>Path</span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-amber-500 rounded-full" />
          <span>Stairs</span>
        </div>
      </div>
    </div>
  );
}

function StartEndMarkers({
  route,
  allNodes,
  currentFloorIndex,
}: {
  route: RouteResponse;
  allNodes: MapNode[];
  currentFloorIndex: number;
}) {
  const startCoord = route.path_coords[0];
  const endCoord = route.path_coords[route.path_coords.length - 1];

  const startNode = allNodes.find(
    (n) => Math.abs(n.x - startCoord[0]) < 2 && Math.abs(n.y - startCoord[1]) < 2
  );
  const endNode = allNodes.find(
    (n) => Math.abs(n.x - endCoord[0]) < 2 && Math.abs(n.y - endCoord[1]) < 2
  );

  const startFloorIdx = startNode ? allNodes.indexOf(startNode) : -1;

  return (
    <>
      <g>
        <circle cx={startCoord[0]} cy={startCoord[1]} r="14" fill="#2563eb" />
        <circle cx={startCoord[0]} cy={startCoord[1]} r="8" fill="white" />
        <text x={startCoord[0] + 20} y={startCoord[1] + 5} fill="#1e40af" fontSize="12" fontWeight="bold">
          BẮT ĐẦU
        </text>
      </g>
      <g>
        <circle cx={endCoord[0]} cy={endCoord[1]} r="14" fill="#dc2626" />
        <circle cx={endCoord[0]} cy={endCoord[1]} r="8" fill="white" />
        <text x={endCoord[0] + 20} y={endCoord[1] + 5} fill="#991b1b" fontSize="12" fontWeight="bold">
          ĐÍCH ĐẾN
        </text>
      </g>
    </>
  );
}

function HighlightMarker({ coord }: { coord: { x: number; y: number } }) {
  return (
    <g>
      <circle cx={coord.x} cy={coord.y} r="20" fill="#10b981" fillOpacity="0.3" />
      <circle cx={coord.x} cy={coord.y} r="12" fill="#10b981" stroke="white" strokeWidth="3" />
      <circle cx={coord.x} cy={coord.y} r="5" fill="white" />
    </g>
  );
}

function TransitionButtons({
  floorSegments,
  currentFloorIndex,
  floorMaps,
  nodes,
  onFloorSwitch,
}: {
  floorSegments: FloorSegment[];
  currentFloorIndex: number;
  floorMaps: FloorMap[];
  nodes: MapNode[];
  onFloorSwitch: (index: number) => void;
}) {
  const currentSeg = floorSegments.find((s) => s.floorIndex === currentFloorIndex);
  if (!currentSeg) return null;

  const transitionNodes = nodes.filter(
    (n) =>
      (n.type === 'stairs' || n.type === 'elevator') &&
      currentSeg.pathCoords.some(
        (coord) => Math.abs(n.x - coord[0]) < 2 && Math.abs(n.y - coord[1]) < 2
      )
  );

  const currentSegIdx = floorSegments.findIndex((s) => s.floorIndex === currentFloorIndex);
  let nextFloorIdx = -1;
  let prevFloorIdx = -1;

  if (currentSegIdx < floorSegments.length - 1) {
    nextFloorIdx = floorSegments[currentSegIdx + 1].floorIndex;
  }
  if (currentSegIdx > 0) {
    prevFloorIdx = floorSegments[currentSegIdx - 1].floorIndex;
  }

  return transitionNodes.map((node, idx) => {
    const firstCoord = currentSeg.pathCoords[0];
    const lastCoord = currentSeg.pathCoords[currentSeg.pathCoords.length - 1];
    const isEntryPoint =
      firstCoord && Math.abs(node.x - firstCoord[0]) < 2 && Math.abs(node.y - firstCoord[1]) < 2;
    const isExitPoint =
      lastCoord && Math.abs(node.x - lastCoord[0]) < 2 && Math.abs(node.y - lastCoord[1]) < 2;

    return (
      <g key={`trans-${currentFloorIndex}-${idx}`}>
        {isEntryPoint && prevFloorIdx !== -1 && (
          <g
            onClick={(e) => {
              e.stopPropagation();
              onFloorSwitch(prevFloorIdx);
            }}
            className="cursor-pointer"
          >
            <circle cx={node.x - 50} cy={node.y} r="24" fill="#fbbf24" stroke="white" strokeWidth="2" />
            <path
              d={`M${node.x - 40},${node.y - 6} L${node.x - 58},${node.y} L${node.x - 40},${node.y + 6}`}
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        )}

        {isExitPoint && nextFloorIdx !== -1 && (
          <g
            onClick={(e) => {
              e.stopPropagation();
              onFloorSwitch(nextFloorIdx);
            }}
            className="cursor-pointer"
          >
            <circle cx={node.x + 50} cy={node.y} r="24" fill="#fbbf24" stroke="white" strokeWidth="2" />
            <path
              d={`M${node.x + 40},${node.y - 6} L${node.x + 58},${node.y} L${node.x + 40},${node.y + 6}`}
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    );
  });
}
