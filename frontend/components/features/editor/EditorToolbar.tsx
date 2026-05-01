'use client';

import { ToolType } from '@/types';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  cursorPos: { x: number; y: number };
}

const TOOLS = [
  { id: 'select' as ToolType, label: 'Chọn đối tượng', icon: 'near_me', description: 'Di chuyển và chỉnh sửa' },
  { id: 'add-node' as ToolType, label: 'Thêm điểm', icon: 'add_location', description: 'Tạo nút mới trên bản đồ' },
  { id: 'add-edge' as ToolType, label: 'Nối đường', icon: 'conversion_path', description: 'Kết nối hai nút lại' },
];

export function EditorToolbar({ activeTool, onToolChange, cursorPos }: EditorToolbarProps) {
  return (
    <aside className="w-64 h-full border-r border-border bg-background flex flex-col p-4 gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 bg-primary rounded-full" />
          <h1 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
            Công cụ vẽ
          </h1>
        </div>
        
        <div className="flex flex-col gap-1.5">
          {TOOLS.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
              <Button
                key={tool.id}
                variant="ghost"
                onClick={() => onToolChange(tool.id)}
                className={`group justify-start gap-3 h-auto py-2.5 px-3 rounded-md transition-all border ${
                  isActive 
                    ? 'bg-primary/5 border-primary/20 text-primary shadow-sm' 
                    : 'bg-transparent border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={`material-symbols-outlined text-lg transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110 opacity-70'}`}>
                  {tool.icon}
                </span>
                <div className="text-left">
                  <p className={`text-[11px] font-black uppercase tracking-tight ${isActive ? 'text-primary' : ''}`}>{tool.label}</p>
                  <p className="text-[9px] font-medium opacity-60">
                    {tool.description}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-border/60">
        <div className="flex flex-col gap-2.5 text-[10px] font-medium text-muted-foreground">
          <div className="flex items-center justify-between px-1">
            <span className="uppercase tracking-widest opacity-50">Tọa độ thực tế</span>
            <div className="flex gap-2 font-mono">
              <span className="font-black text-primary">X:{Math.round(cursorPos.x)}</span>
              <span className="font-black text-primary">Y:{Math.round(cursorPos.y)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-muted/40 rounded border border-border/50">
            <span className="material-symbols-outlined text-sm opacity-40">construction</span>
            <div className="flex-1">
              <span className="text-[9px] uppercase tracking-tighter block opacity-40">Chế độ hiện tại</span>
              <span className="text-[10px] font-black text-primary uppercase">{activeTool.replace('-', ' ')}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
