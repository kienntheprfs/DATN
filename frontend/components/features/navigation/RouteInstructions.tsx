'use client';

import { Instruction } from '@/types';

const ACTION_ICONS: Record<string, string> = {
  start: '🔵',
  straight: '⬆️',
  slight_left: '↖️',
  slight_right: '↗️',
  turn_left: '⬅️',
  turn_right: '➡️',
  use_elevator: '🛗',
  use_stairs: '🪜',
  enter_elevator: '🛗',
  enter_stairs: '🪜',
  arrive: '🏁',
};

interface RouteInstructionsProps {
  instructions: Instruction[];
  totalDistance: number;
  floorSegments: number;
  onInstructionClick: (coordinate: number[]) => void;
}

export function RouteInstructions({
  instructions,
  totalDistance,
  floorSegments,
  onInstructionClick,
}: RouteInstructionsProps) {
  const walkingTime = Math.ceil(totalDistance / 80);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 pb-4">
        <h3 className="font-semibold">Hướng dẫn</h3>
        <span className="text-xs text-muted-foreground">
          ~{walkingTime} phút • {Math.round(totalDistance)}m
        </span>
      </div>

      {floorSegments > 1 && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <p className="text-sm">
            Đường đi qua {floorSegments} tầng • Click mũi tên để xem từng tầng
          </p>
        </div>
      )}

      <div className="space-y-1 overflow-y-auto max-h-96">
        {instructions.map((instruction, idx) => {
          const isFloorChange = instruction.action === 'use_stairs' || instruction.action === 'use_elevator';
          const isStartOrEnd = instruction.action === 'start' || instruction.action === 'arrive';

          return (
            <div
              key={idx}
              onClick={() => onInstructionClick(instruction.coordinate)}
              className={`flex gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                isStartOrEnd
                  ? 'bg-blue-50 border-l-4 border-blue-600'
                  : isFloorChange
                    ? 'bg-amber-50 border-l-4 border-amber-500'
                    : 'hover:bg-muted border-l-4 border-transparent'
              }`}
              data-testid="instruction-item"
            >
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isStartOrEnd
                    ? 'bg-blue-100'
                    : isFloorChange
                      ? 'bg-amber-100'
                      : 'bg-muted'
                }`}>
                  <span className="text-lg">{ACTION_ICONS[instruction.action] || '⬆️'}</span>
                </div>
                {idx < instructions.length - 1 && (
                  <div className="w-0.5 flex-1 bg-border my-1" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm ${isFloorChange ? 'text-amber-800 font-medium' : ''}`}>
                  {instruction.text}
                </p>
                {instruction.distance_m > 0 && (
                  <p className="text-xs text-muted-foreground">{instruction.distance_m}m</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
