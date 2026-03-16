import { useState, WheelEvent, MouseEvent } from "react";

export const useMapControls = (hasImage: boolean) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const handleWheel = (e: WheelEvent) => {
    if (!hasImage) return;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !hasImage) return;
    setIsDragging(true);
    setStartPan({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    });
  };

  const handleMouseUp = (e: MouseEvent<Element, globalThis.MouseEvent>) => setIsDragging(false);

  const reset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return {
    scale,
    position,
    isDragging,
    handlers: {
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
    },
    reset,
  };
};