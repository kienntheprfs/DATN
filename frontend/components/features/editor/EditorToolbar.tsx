'use client';

import { ToolType } from '@/types';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  cursorPos: { x: number; y: number };
}

const TOOLS = [
  { id: 'select' as ToolType, label: 'Select', icon: '👆', description: 'Chọn và di chuyển' },
  { id: 'add-node' as ToolType, label: 'Add Node', icon: '➕', description: 'Thêm điểm mới' },
  { id: 'add-edge' as ToolType, label: 'Add Edge', icon: '🔗', description: 'Nối hai điểm' },
];

export function EditorToolbar({ activeTool, onToolChange, cursorPos }: EditorToolbarProps) {
  return (
    <aside className="w-64 h-full border-r border-border bg-background flex flex-col p-4 gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Editor Tools
        </h1>
        
        <div className="flex flex-col gap-2">
          {TOOLS.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
              <Button
                key={tool.id}
                variant={isActive ? 'default' : 'outline'}
                onClick={() => onToolChange(tool.id)}
                className={`justify-start gap-3 h-auto py-3 ${
                  isActive ? '' : 'hover:bg-muted'
                }`}
              >
                <span className="text-lg">{tool.icon}</span>
                <div className="text-left">
                  <p className="text-sm font-bold">{tool.label}</p>
                  <p className={`text-xs ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {tool.description}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-border">
        <div className="flex flex-col gap-1 text-xs font-mono text-muted-foreground">
          <div className="flex justify-between">
            <span>X:</span>
            <span className="font-bold">{Math.round(cursorPos.x)} px</span>
          </div>
          <div className="flex justify-between">
            <span>Y:</span>
            <span className="font-bold">{Math.round(cursorPos.y)} px</span>
          </div>
          <div className="flex justify-between mt-2">
            <span>Tool:</span>
            <span className="text-primary font-bold uppercase">{activeTool}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
