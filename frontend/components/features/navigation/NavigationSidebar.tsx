'use client';

import { RouteResponse, FloorSegment } from '@/types';
import { LocationSearch } from './LocationSearch';
import { RouteInstructions } from './RouteInstructions';
import { Button } from '@/components/ui/button';

interface NavigationSidebarProps {
  startLocation: string;
  endLocation: string;
  startNodeId?: number;
  endNodeId?: number;
  route: RouteResponse | null;
  floorSegments: FloorSegment[];
  loading: boolean;
  error: string;
  onStartChange: (value: string, nodeId?: number) => void;
  onEndChange: (value: string, nodeId?: number) => void;
  onFindRoute: () => void;
  onRefreshCache: () => void;
  onSwap: () => void;
  onInstructionClick: (coordinate: number[]) => void;
  onQuerySubmit: (query: string) => void;
}

export function NavigationSidebar({
  startLocation,
  endLocation,
  startNodeId,
  endNodeId,
  route,
  floorSegments,
  loading,
  error,
  onStartChange,
  onEndChange,
  onFindRoute,
  onRefreshCache,
  onSwap,
  onInstructionClick,
}: NavigationSidebarProps) {
  return (
    <aside className="w-105 border-r flex flex-col bg-background overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex flex-col gap-3">
          <LocationSearch
            value={startLocation}
            onChange={onStartChange}
            placeholder="Điểm xuất phát..."
            icon="origin"
          />

          <div className="flex justify-center">
            <Button
              variant="outline"
              size="icon"
              onClick={onSwap}
              className="rounded-full"
            >
              ⇅
            </Button>
          </div>

          <LocationSearch
            value={endLocation}
            onChange={onEndChange}
            placeholder="Điểm đến..."
            icon="destination"
          />
        </div>

        <Button
          onClick={onFindRoute}
          disabled={loading || !startNodeId || !endNodeId}
          className="w-full"
          data-testid="find-route-btn"
        >
          {loading ? 'Đang tìm...' : 'Tìm đường'}
        </Button>

        <Button
          variant="outline"
          onClick={onRefreshCache}
          className="w-full"
          data-testid="refresh-cache-btn"
        >
          🔄 Làm mới cache
        </Button>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        {route && (
          <RouteInstructions
            instructions={route.instructions}
            totalDistance={route.total_distance_m}
            floorSegments={floorSegments.length}
            onInstructionClick={onInstructionClick}
          />
        )}

        {!route && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <span className="text-4xl mb-4">🗺️</span>
            <p className="text-sm">Nhập điểm xuất phát và đích đến để tìm đường</p>
          </div>
        )}
      </div>
    </aside>
  );
}
