import { useState } from 'react';
import { ToolsPanel } from './components/ToolsPanel';
import { MapViewport } from './components/MapViewport';
import { InspectorPanel } from './components/InspectorPanel';
import { EditorHeader } from './components/EditorHeader';
import { useEditorStore } from './stores/editorStores';
import { mapApi } from '../maps/api/maps';

export const MapEditorPage = () => {
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
  const { maps, currentMap, setMap, deleteMap } = useEditorStore();

  const handleDeleteMap = async () => {
    if (!currentMap) return;
    try {
        // 1. Gọi API xóa
        await mapApi.delete(currentMap.id);
        
        // 2. Xóa khỏi store
        deleteMap(currentMap.id);
        
        // 3. Thông báo
        alert("Đã xóa bản đồ thành công!");
    } catch (error) {
        console.error(error);
        alert("Lỗi khi xóa bản đồ");
    }
};

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden">
      
      {/* HEADER RIÊNG BIỆT CHO EDITOR */}
      {/* HEADER */}
        <EditorHeader 
            // Truyền danh sách map lấy được
            maps={maps} 

            // Map đang chọn
            currentMapId={currentMap?.id}

            // Xử lý khi chọn map khác
            onMapChange={(newId) => {
                const selectedMap = maps.find(m => m.id === newId);
                if (selectedMap) {
                    // Logic chuyển map: Cập nhật store, load lại nodes/edges...
                    setMap(selectedMap); 
                }
            }}

            // Xử lý xóa map
            onDelete={handleDeleteMap}
        />
      
      {/* WORKSPACE */}
      <div className="flex-1 flex overflow-hidden relative">
        <ToolsPanel cursorPos={cursorCoords} />
        
        <div className="flex-1 relative flex flex-col min-w-0">
          <MapViewport 
             onCursorMove={(x, y) => setCursorCoords({ x: Math.round(x), y: Math.round(y) })} 
          />
        </div>

        <InspectorPanel />
      </div>
    </div>
  );
};