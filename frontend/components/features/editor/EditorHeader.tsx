'use client';

import { useState, useRef, useEffect } from 'react';
import { MapData } from '@/types';
import { Button } from '@/components/ui/button';

interface EditorHeaderProps {
  maps: MapData[];
  currentMapId?: number;
  onMapChange: (mapId: number) => void;
  onDelete?: () => void;
}

export function EditorHeader({
  maps,
  currentMapId,
  onMapChange,
  onDelete,
}: EditorHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentMap = maps.find((m) => m.id === currentMapId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const campusMaps = maps.filter((m) => !m.building_id);
  const buildingMaps = maps.filter((m) => m.building_id);

  return (
    <header className="h-14 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold">
          ✏️
        </div>
        <span className="font-semibold">Map Editor</span>
      </div>

      <div className="flex-1 flex justify-center px-4" ref={dropdownRef}>
        <div className="relative w-full max-w-sm">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full flex items-center justify-between gap-3 px-4 py-2 rounded-full border bg-background transition-all ${
              isOpen ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`size-8 rounded-full flex items-center justify-center text-white shrink-0 ${
                currentMap?.building_id ? 'bg-indigo-500' : 'bg-blue-500'
              }`}>
                {currentMap?.building_id ? '🏢' : '🗺️'}
              </div>
              <div className="text-left min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {currentMap ? (currentMap.building_id ? 'Building' : 'Campus') : 'Select'}
                </span>
                <h1 className="text-sm font-bold truncate">
                  {currentMap?.name || 'Chọn bản đồ...'}
                </h1>
              </div>
            </div>
            <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {isOpen && (
            <div className="absolute top-full mt-2 w-full bg-background rounded-xl shadow-lg border overflow-hidden z-50">
              <div className="max-h-[60vh] overflow-y-auto py-2">
                {campusMaps.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1.5 text-[10px] font-bold text-muted-foreground uppercase bg-muted/50">
                      Bản đồ chung
                    </div>
                    {campusMaps.map((map) => (
                      <MapItem
                        key={map.id}
                        map={map}
                        isSelected={map.id === currentMapId}
                        onClick={() => {
                          onMapChange(map.id);
                          setIsOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}

                {buildingMaps.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-bold text-muted-foreground uppercase bg-muted/50">
                      Bản đồ tòa nhà
                    </div>
                    {buildingMaps.map((map) => (
                      <MapItem
                        key={map.id}
                        map={map}
                        isSelected={map.id === currentMapId}
                        onClick={() => {
                          onMapChange(map.id);
                          setIsOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}

                {maps.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Chưa có bản đồ nào
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {currentMapId && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title="Xóa bản đồ"
          >
            🗑️
          </Button>
        )}
      </div>
    </header>
  );
}

function MapItem({
  map,
  isSelected,
  onClick,
}: {
  map: MapData;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
        isSelected ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
        map.building_id ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'
      }`}>
        {map.building_id ? '🏢' : '🗺️'}
      </div>
      <div className="flex-1 text-left min-w-0">
        <h4 className={`text-sm font-bold truncate ${isSelected ? 'text-primary' : ''}`}>
          {map.name}
        </h4>
        {map.building_id && (
          <p className="text-[10px] text-muted-foreground">ID: {map.building_id}</p>
        )}
      </div>
      {isSelected && <span>✓</span>}
    </button>
  );
}
