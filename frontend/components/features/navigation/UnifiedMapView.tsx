'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { FloorSegment, MapWithData } from '@/types/wayfinding';

type ViewState = '2D_IDLE' | 'TILT_TO_3D' | 'SHIFT_STACK' | 'FLATTEN_TO_2D';

interface UnifiedMapViewProps {
  floorMaps: MapWithData[];
  floorSegments: FloorSegment[];
  currentFloorIndex: number;
  scale: number;
  position: { x: number; y: number } | null;
  isDragging: boolean;
  svgRef: React.RefObject<SVGSVGElement | null>;
  renderFloorContent?: (floorIndex: number, is3D: boolean) => React.ReactNode;
  getFullImageUrl: (url: string) => string;
}

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const FLOOR_SPACING = 180;

export const UnifiedMapView: React.FC<UnifiedMapViewProps> = ({
  floorMaps,
  floorSegments,
  currentFloorIndex,
  scale,
  position,
  isDragging,
  svgRef,
  renderFloorContent,
  getFullImageUrl
}) => {
  const [viewState, setViewState] = useState<ViewState>('2D_IDLE');
  const [displayFloorIdx, setDisplayFloorIdx] = useState(currentFloorIndex);
  const prevTargetFloorRef = useRef(currentFloorIndex);

  const sortedFloors = useMemo(() => {
    return [...floorMaps].sort((a, b) => (a.map.floor_level || 0) - (b.map.floor_level || 0));
  }, [floorMaps]);

  // Handle floor transition sequence
  useEffect(() => {
    if (currentFloorIndex !== prevTargetFloorRef.current) {
      // Start transition sequence
      const runSequence = async () => {
        setViewState('TILT_TO_3D');
        
        await new Promise(r => setTimeout(r, 600)); // wait for tilt to finish
        
        // Shift stack to new floor focus
        setDisplayFloorIdx(currentFloorIndex);
        setViewState('SHIFT_STACK');
        
        await new Promise(r => setTimeout(r, 600)); // wait for shift to finish
        
        setViewState('FLATTEN_TO_2D');
        
        await new Promise(r => setTimeout(r, 600)); // wait for flatten to finish
        
        setViewState('2D_IDLE');
      };
      
      runSequence();
      prevTargetFloorRef.current = currentFloorIndex;
    }
  }, [currentFloorIndex]);

  // Handle initial display sync
  useEffect(() => {
    if (viewState === '2D_IDLE') {
      setDisplayFloorIdx(currentFloorIndex);
    }
  }, [currentFloorIndex, viewState]);

  const displaySortedIdx = useMemo(() => {
    const mapId = floorMaps[displayFloorIdx]?.map.id;
    return sortedFloors.findIndex(f => f.map.id === mapId);
  }, [sortedFloors, displayFloorIdx, floorMaps]);

  // Determine container transforms based on state
  const is3D = viewState !== '2D_IDLE';
  
  // Custom transform logic to keep the focused floor centered
  // In 3D, we want the stack to be slightly smaller and tilted.
  const containerTransform = is3D
    ? `scale(${scale * 0.75}) rotateX(65deg) rotateZ(-45deg)`
    : `translate(${position?.x || 0}px, ${position?.y || 0}px) scale(${scale})`;

  return (
    <div 
      className="w-full h-full relative overflow-hidden" 
      style={{ perspective: is3D ? '1500px' : 'none' }}
      id="map-container"
    >
      <div 
        className="w-full h-full absolute inset-0 transition-transform duration-700 ease-in-out"
        style={{
          transformStyle: is3D ? 'preserve-3d' : 'flat',
          transform: containerTransform,
          transformOrigin: is3D ? 'center center' : '0 0',
        }}
      >
        {sortedFloors.map((fm, idx) => {
          const isTargetFloor = floorMaps[displayFloorIdx]?.map.id === fm.map.id;
          const originalFloorIndex = floorMaps.findIndex(f => f.map.id === fm.map.id);
          const isInPath = floorSegments.some(s => s.floorIndex === originalFloorIndex);
          const zOffset = (idx - displaySortedIdx) * FLOOR_SPACING;
          
          // Only show active floor in 2D IDLE
          if (!is3D && !isTargetFloor) return null;

          const segmentsForThisFloor = floorSegments.filter(s => s.floorIndex === originalFloorIndex);

          let layerOpacity = 1;
          if (is3D) {
             layerOpacity = isTargetFloor ? 1 : (isInPath ? 0.7 : 0.2);
             // Fade out non-target floors during FLATTEN
             if (viewState === 'FLATTEN_TO_2D' && !isTargetFloor) {
               layerOpacity = 0;
             }
          }

          return (
            <div
              key={fm.map.id}
              className={`transition-all duration-700 ease-in-out ${isTargetFloor ? 'z-20' : 'z-10'}`}
              style={{
                position: is3D ? 'absolute' : 'relative',
                top: is3D ? '50%' : 0,
                left: is3D ? '50%' : 0,
                width: MAP_WIDTH,
                height: MAP_HEIGHT,
                marginLeft: is3D ? -MAP_WIDTH / 2 : 0,
                marginTop: is3D ? -MAP_HEIGHT / 2 : 0,
                transform: is3D ? `translateZ(${zOffset}px)` : 'none',
                transformStyle: is3D ? 'preserve-3d' : 'flat',
                opacity: layerOpacity,
                filter: is3D && !isTargetFloor ? 'grayscale(40%)' : 'none',
                pointerEvents: isTargetFloor && viewState === '2D_IDLE' ? 'auto' : 'none',
              }}
            >
              {/* Floor Label in 3D */}
              {is3D && (
                <div 
                  className={`absolute -left-28 top-0 px-4 py-2 rounded-xl text-sm font-bold shadow-2xl transition-all duration-700 ${
                    isTargetFloor ? 'bg-primary text-primary-foreground scale-110' : 'bg-slate-800 text-slate-300 opacity-60'
                  }`}
                  style={{ 
                    transform: 'rotateZ(45deg) rotateX(-60deg)',
                    opacity: viewState === 'FLATTEN_TO_2D' ? 0 : 1
                  }}
                >
                  {fm.map.name || `Tầng ${fm.map.floor_level}`}
                </div>
              )}

              <svg
                ref={isTargetFloor ? svgRef : null}
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                className={`w-full h-full ${viewState === '2D_IDLE' && isDragging ? 'cursor-grabbing' : 'cursor-grab'} 
                  ${is3D ? 'shadow-2xl rounded-sm bg-card/50 backdrop-blur-sm border border-white/20' : ''}`}
              >
                {/* Map Image (Fixed attributes) */}
                <image
                  href={getFullImageUrl(fm.map.image_url)}
                  xlinkHref={getFullImageUrl(fm.map.image_url)}
                  x="0"
                  y="0"
                  width={MAP_WIDTH}
                  height={MAP_HEIGHT}
                  preserveAspectRatio="xMidYMid meet"
                  className={is3D ? "opacity-80" : "opacity-90"}
                />

                {/* 3D Path Segments (Simplified rendering when in 3D to reduce clutter) */}
                {is3D && segmentsForThisFloor.map((seg, sIdx) => (
                  <path
                    key={`path-3d-${idx}-${sIdx}`}
                    d={`M ${seg.pathCoords.map(c => `${c[0]},${c[1]}`).join(' L ')}`}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-lg opacity-90"
                  />
                ))}

                {/* Render Custom Content from Parent (2D Nodes, Edges, Route markers) */}
                {renderFloorContent && renderFloorContent(originalFloorIndex, is3D)}
              </svg>
            </div>
          );
        })}

        {/* Vertical Transition Lines for 3D View */}
        {is3D && floorSegments.map((seg, idx) => {
          if (idx === floorSegments.length - 1) return null;
          const nextSeg = floorSegments[idx + 1];
          
          const fromMap = floorMaps[seg.floorIndex];
          const toMap = floorMaps[nextSeg.floorIndex];
          
          if (!fromMap || !toMap) return null;

          const fromSortedIdx = sortedFloors.findIndex(f => f.map.id === fromMap.map.id);
          const toSortedIdx = sortedFloors.findIndex(f => f.map.id === toMap.map.id);
          
          const fromPos = seg.pathCoords[seg.pathCoords.length - 1];
          const toPos = nextSeg.pathCoords[0];

          if (!fromPos || !toPos) return null;

          const zStart = (fromSortedIdx - displaySortedIdx) * FLOOR_SPACING;
          const zEnd = (toSortedIdx - displaySortedIdx) * FLOOR_SPACING;
          
          const lineOpacity = viewState === 'FLATTEN_TO_2D' ? 0 : 1;

          return (
            <div
              key={`connector-${idx}`}
              className="absolute top-1/2 left-1/2 transition-opacity duration-500"
              style={{
                width: 0,
                height: 0,
                transformStyle: 'preserve-3d',
                opacity: lineOpacity
              }}
            >
              {/* Vertical line spanning the Z gap */}
              <div
                className="absolute border-l-4 border-solid border-primary/60"
                style={{
                  height: Math.abs(zEnd - zStart),
                  left: fromPos[0] - MAP_WIDTH / 2,
                  top: fromPos[1] - MAP_HEIGHT / 2,
                  transform: `translateZ(${Math.min(zStart, zEnd)}px) rotateX(-90deg)`,
                  transformOrigin: 'top',
                }}
              />
              
              {/* Node markers at start and end of connector */}
              <div
                className="absolute w-4 h-4 bg-primary rounded-full"
                style={{
                  left: fromPos[0] - MAP_WIDTH / 2 - 8,
                  top: fromPos[1] - MAP_HEIGHT / 2 - 8,
                  transform: `translateZ(${zStart}px)`,
                }}
              />
              <div
                className="absolute w-4 h-4 bg-primary rounded-full"
                style={{
                  left: toPos[0] - MAP_WIDTH / 2 - 8,
                  top: toPos[1] - MAP_HEIGHT / 2 - 8,
                  transform: `translateZ(${zEnd}px)`,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
