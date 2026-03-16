import { useEditorStore } from '../stores/editorStores';
import { ToolType } from '../stores/editorStores';

export const ToolsPanel = ({ cursorPos = { x: 0, y: 0 } }: { cursorPos?: { x: number, y: number } }) => {

    const { activeTool, setTool } = useEditorStore();
    
    // Danh sách cấu hình các nút bấm
    const tools = [
        { 
            id: "select" as ToolType, 
            label: "Select Tool", 
            icon: "near_me",
            description: "Chọn và di chuyển đối tượng"
        },
        { 
            id: "add-node" as ToolType, 
            label: "Add Node", 
            icon: "add_circle", 
            description: "Thêm điểm mới vào bản đồ"
        },
        { 
            id: "add-edge" as ToolType, 
            label: "Add Edge", 
            icon: "conversion_path", 
            description: "Nối hai điểm với nhau"
        },
    ];

    return (
        <aside className="w-64 h-full border-r border-slate-200 bg-white flex flex-col p-4 gap-6 shadow-sm z-10">
            
            {/* --- HEADER --- */}
            <div className="flex flex-col gap-2">
                <h1 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Editor Tools</h1>
                
                <div className="flex flex-col gap-2">
                    {tools.map((tool) => {
                        const isActive = activeTool === tool.id;

                        return (
                            <button
                                key={tool.id}
                                onClick={() => setTool(tool.id)}
                                title={tool.description}
                                className={`
                                    flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-left group
                                    ${isActive 
                                        ? "bg-blue-600 text-white shadow-md shadow-blue-200 transform scale-[1.02]" 
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent hover:border-slate-100"
                                    }
                                `}
                            >
                                <span className={`material-symbols-outlined text-xl ${isActive ? "" : "text-slate-400 group-hover:text-slate-600"}`}>
                                    {tool.icon}
                                </span>
                                <div>
                                    <p className="text-sm font-bold">{tool.label}</p>
                                    {/* Dòng mô tả nhỏ (Optional) */}
                                    <p className={`text-[10px] ${isActive ? "text-blue-200" : "text-slate-400"}`}>
                                        {tool.id === 'select' ? 'Click to select' : 'Click map to add'}
                                    </p>
                                </div>
                                
                                {/* Dấu tích nhỏ khi active (Optional UI polish) */}
                                {isActive && (
                                    <span className="material-symbols-outlined text-sm ml-auto text-blue-200">check</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* --- FOOTER (INFO) --- */}
            <div className="mt-auto pt-4 border-t border-slate-100">
                <div className="flex flex-col gap-1 text-[11px] text-slate-400 font-mono">
                    <div className="flex justify-between">
                        <span>X:</span>
                        <span className="text-slate-600 font-bold">{Math.round(cursorPos.x)} px</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Y:</span>
                        <span className="text-slate-600 font-bold">{Math.round(cursorPos.y)} px</span>
                    </div>
                    <div className="flex justify-between mt-2">
                        <span>Status:</span>
                        <span className="text-blue-600 font-bold uppercase">{activeTool.replace("-", " ")}</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};