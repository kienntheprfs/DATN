'use client';

import { Button } from '@/components/ui/button';

interface FloorMap {
  map: {
    id: number;
    name: string;
    floor_level?: number;
  };
  isCampus?: boolean;
}

interface FloorTabsProps {
  floors: FloorMap[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function FloorTabs({ floors, currentIndex, onSelect }: FloorTabsProps) {
  const getFloorLabel = (floor: FloorMap) => {
    if (floor.isCampus) return 'Campus';
    if (floor.map.floor_level !== undefined) {
      return floor.map.floor_level >= 0 ? `Tầng ${floor.map.floor_level}` : `B${Math.abs(floor.map.floor_level)}`;
    }
    return floor.map.name;
  };

  if (floors.length === 0) return null;

  return (
    <div className="flex gap-1 bg-background rounded-lg shadow-lg p-1">
      {floors.map((floor, idx) => {
        const isActive = idx === currentIndex;
        return (
          <Button
            key={floor.map.id}
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onSelect(idx)}
          >
            {getFloorLabel(floor)}
          </Button>
        );
      })}
    </div>
  );
}
