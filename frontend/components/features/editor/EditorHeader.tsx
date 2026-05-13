'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapData } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface EditorHeaderProps {
  maps: MapData[];
  currentMapId?: number;
  onMapChange: (mapId: number) => void;
  onDelete?: () => void;
  onOpenBuildingModal?: () => void;
}

export function EditorHeader({
  maps,
  currentMapId,
  onMapChange,
  onDelete,
  onOpenBuildingModal,
}: EditorHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentMap = maps.find((m) => m.id === currentMapId);
  const router = useRouter();

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
    <header className="h-11 bg-background border-b border-border flex items-center justify-between px-4 shrink-0 z-30 relative">
      <div className="flex-1 flex items-center justify-start">
        <button
          onClick={() => router.push('/')}
          className="group flex items-center justify-center w-8 h-8 rounded-md bg-background border border-border text-muted-foreground hover:text-primary hover:border-primary transition-all shadow-sm"
          title="Quay lại Dashboard"
        >
          <span className="material-symbols-outlined text-base group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 flex justify-center min-w-0 px-2" ref={dropdownRef}>
        <div className="relative w-full max-w-xs">
          <div
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center justify-between gap-2 px-3 py-1 rounded-md border bg-background cursor-pointer transition-all select-none h-8
              ${isOpen ? 'border-primary ring-1 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/50'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-base">
                  {currentMap?.building_id ? 'apartment' : 'map'}
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-xs font-bold text-foreground truncate max-w-[150px]">
                  {currentMap ? currentMap.name : 'Chọn bản đồ...'}
                </h1>
                {currentMap && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[8px] font-bold uppercase tracking-tighter opacity-50 border-none bg-muted">
                    {currentMap.building_id ? 'BLDG' : 'CAMPUS'}
                  </Badge>
                )}
              </div>
            </div>
            <span className={`material-symbols-outlined text-sm text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}>expand_more</span>
          </div>

          {isOpen && (
            <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 py-1">
              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                {campusMaps.length > 0 && (
                  <div className="mb-1">
                    <div className="px-3 py-1 text-[9px] font-black text-muted-foreground uppercase tracking-widest bg-muted/30">
                      Bản đồ khuôn viên
                    </div>
                    {campusMaps.map((map) => (
                      <button
                        key={map.id}
                        onClick={() => {
                          onMapChange(map.id);
                          setIsOpen(false);
                        }}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                          map.id === currentMapId ? 'bg-primary text-white' : 'hover:bg-muted'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">map</span>
                        <span className="text-xs font-bold truncate flex-1">{map.name}</span>
                        {map.id === currentMapId && (
                          <span className="material-symbols-outlined text-xs">check</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {buildingMaps.length > 0 && (
                  <div className="border-t border-border/50">
                    <div className="px-3 py-1 text-[9px] font-black text-muted-foreground uppercase tracking-widest bg-muted/30">
                      Bản đồ tòa nhà
                    </div>
                    {buildingMaps.map((map) => (
                      <button
                        key={map.id}
                        onClick={() => {
                          onMapChange(map.id);
                          setIsOpen(false);
                        }}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                          map.id === currentMapId ? 'bg-primary text-white' : 'hover:bg-muted'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">apartment</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{map.name}</div>
                          {map.building_id && (
                            <div
                              className={`text-[9px] uppercase tracking-tighter ${
                                map.id === currentMapId ? 'text-white/60' : 'text-muted-foreground'
                              }`}
                            >
                              ID: #{map.building_id}
                            </div>
                          )}
                        </div>
                        {map.id === currentMapId && (
                          <span className="material-symbols-outlined text-xs">check</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {maps.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">
                    Chưa có bản đồ nào
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-end gap-2">
        {onOpenBuildingModal && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenBuildingModal}
            className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary"
          >
            <span className="material-symbols-outlined text-base mr-2">apartment</span>
            Thiết lập
          </Button>
        )}
        {currentMapId && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <span className="material-symbols-outlined text-base mr-2">delete</span>
            Xóa
          </Button>
        )}
      </div>
    </header>
  );
}
