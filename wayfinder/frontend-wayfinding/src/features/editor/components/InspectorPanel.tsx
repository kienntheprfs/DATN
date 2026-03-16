import { useState, useEffect } from "react";
import { useEditorStore } from "../stores/editorStores";
import { MapNode, MapEdge } from "@/shared/types";
import { editorApi } from "@/features/editor/api/editorApi";
import { mapApi } from "@/features/maps/api/maps";
import { BuildingModal } from "./BuildingModal"; // Đảm bảo đã tạo file này như bài trước

export const InspectorPanel = () => {
  // 1. LẤY STATE TỪ STORE
  const { currentMap, nodes, edges, selectedId, selectedType, isEditing, updateNode, updateEdge, deleteNode, deleteEdge, setEditing, setMap, setMaps } =
    useEditorStore();

  // 2. TÌM ITEM ĐANG CHỌN
  const data = selectedType === "node" ? nodes.find((n) => n.id === selectedId) : edges.find((e) => e.id === selectedId);

  // 3. STATE LOCAL
  const [formData, setFormData] = useState<any>(null);
  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false);
  const [buildingMaps, setBuildingMaps] = useState<any[]>([]);
  const [buildingNodes, setBuildingNodes] = useState<MapNode[]>([]);
  const [campusNodes, setCampusNodes] = useState<MapNode[]>([]);

  // Sync data vào formData khi selection thay đổi
  useEffect(() => {
    if (data) {
      const isNode = selectedType === "node";
      const nodeData = data as MapNode;
      const dataWithDefaults = {
        ...data,
        ...(isNode ? { 
          aliases: nodeData.aliases || [],
          linked_node_ids: nodeData.linked_node_ids || [],
        } : {}),
      };
      if (formData?.id !== data.id) {
        setFormData(dataWithDefaults);
        setEditing(false);
      } else {
        // Sync dữ liệu mới (ví dụ khi kéo thả node) nhưng giữ nguyên các trường đang edit dở nếu cần
        setFormData((prev: any) => ({ ...prev, ...dataWithDefaults }));
      }
    } else {
      setFormData(null);
    }
  }, [data, selectedType, setEditing]);

  // Load maps và nodes của building khi building_id thay đổi
  useEffect(() => {
    const buildingId = formData?.building_id || formData?.building?.id;
    mapApi.getAll().then((maps) => {
      // Building maps
      if (buildingId) {
        const buildingMapsData = maps.filter((m: any) => m.building_id === buildingId);
        setBuildingMaps(buildingMapsData);
        
        // Load nodes từ tất cả các tầng của building
        const mapIds = buildingMapsData.map((m: any) => m.id);
        Promise.all(
          mapIds.map((mapId: number) => editorApi.getNodes(mapId))
        ).then((nodeArrays) => {
          const allNodes = nodeArrays.flat();
          setBuildingNodes(allNodes);
        });
      } else {
        setBuildingMaps([]);
        setBuildingNodes([]);
      }
      
      // Campus nodes (maps without building_id)
      const campusMaps = maps.filter((m: any) => !m.building_id);
      const campusMapIds = campusMaps.map((m: any) => m.id);
      Promise.all(
        campusMapIds.map((mapId: number) => editorApi.getNodes(mapId))
      ).then((nodeArrays) => {
        setCampusNodes(nodeArrays.flat());
      });
    });
  }, [formData?.building_id, formData?.building]);

  // Empty State
  if (!formData || !selectedType) {
    if (!currentMap) return <aside className="w-80 bg-white border-l border-slate-200" />;
    return <EmptyState currentMap={currentMap} />;
  }

  // 4. HANDLERS
  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      if (selectedType === "node") {
        const updatedNode = await editorApi.updateNode(formData.id, formData);
        updateNode(formData.id, updatedNode);
        setFormData(updatedNode);
        
        // Refresh maps after updating node (in case building changed)
        const allMaps = await mapApi.getAll();
        setMaps(allMaps);
        
        // Refresh only current map's nodes
        if (currentMap) {
          const currentNodes = await editorApi.getNodes(currentMap.id);
          useEditorStore.getState().setNodes(currentNodes);
        }
      } else {
        updateEdge(formData.id, formData);
        await editorApi.updateEdge(formData.id, formData);
      }
      setEditing(false);
    } catch (error) {
      alert("Lỗi lưu dữ liệu!");
      setFormData({ ...data }); // Revert
    }
  };

  const handleDelete = async () => {
    if (confirm("Bạn có chắc chắn muốn xóa?")) {
      try {
        if (selectedType === "node") {
          await editorApi.deleteNode(formData.id);
          deleteNode(formData.id);
        } else {
          await editorApi.deleteEdge(formData.id);
          deleteEdge(formData.id);
        }
      } catch (error) {
        alert("Không thể xóa!");
      }
    }
  };

  const handleCancel = () => {
    setFormData({ ...data });
    setEditing(false);
  };

  const toggleEdit = () => {
    if (isEditing) handleSave();
    else setEditing(true);
  };

  const currentBuildingId = (formData as MapNode).building_id || (formData as MapNode).building?.id || null;

  // --- RENDER ---
  return (
    <>
      <aside className="w-80 h-full border-l border-slate-200 bg-white flex flex-col shadow-xl z-20 animate-in slide-in-from-right duration-300">
        {/* HEADER */}
        <PanelHeader
          type={selectedType}
          id={formData.id}
          name={formData.name || formData.type}
          isEditing={isEditing}
          onToggleEdit={toggleEdit}
          onNameChange={(val: any) => handleChange("name", val)}
        />

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {selectedType === "node" ? (
            <NodeForm
              data={formData as MapNode}
              isEditing={isEditing}
              onChange={handleChange}
              onManageBuilding={() => setIsBuildingModalOpen(true)}
              buildingMaps={buildingMaps}
              buildingNodes={buildingNodes}
              campusNodes={campusNodes}
            />
          ) : (
            <EdgeForm data={formData as MapEdge} isEditing={isEditing} onChange={handleChange} />
          )}
        </div>

        {/* FOOTER */}
        <PanelFooter isEditing={isEditing} onSave={handleSave} onCancel={handleCancel} onDelete={handleDelete} />
      </aside>

      {/* BUILDING MODAL */}
      {isBuildingModalOpen && formData && selectedType === "node" && (
        <BuildingModal
          nodeId={formData.id}
          initialBuildingId={currentBuildingId}
          onClose={() => setIsBuildingModalOpen(false)}
          onSuccess={() => {
            editorApi.getNodeById(formData.id).then((updatedNode) => {
              updateNode(formData.id, updatedNode);
              setFormData(updatedNode);
            });
            if (currentMap) {
              mapApi.getAll().then((maps) => {
                const updatedMap = maps.find(m => m.id === currentMap.id);
                if (updatedMap) {
                  setMap(updatedMap);
                }
              });
            }
            setIsBuildingModalOpen(false);
          }}
        />
      )}
    </>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const EmptyState = ({ currentMap }: { currentMap: any }) => (
  <aside className="w-80 h-full border-l border-slate-200 bg-white flex flex-col p-0 shadow-xl z-20">
    <div className="h-40 bg-slate-100 relative overflow-hidden">
      <img src={currentMap.image_url} className="w-full h-full object-cover opacity-50 blur-sm" alt="Map Cover" />
      <div className="absolute inset-0 bg-linear-to-t from-white to-transparent"></div>
      <div className="absolute bottom-4 left-6">
        <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Current Map</span>
        <h2 className="text-xl font-bold text-slate-800 mt-1 truncate w-64">{currentMap.name}</h2>
      </div>
    </div>
    <div className="p-6 text-center text-slate-400">
      <p className="text-sm">Chọn một đối tượng để xem chi tiết</p>
    </div>
  </aside>
);

const PanelHeader = ({ type, id, name, isEditing, onToggleEdit, onNameChange }: any) => (
  <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
    <div className="flex-1 mr-2">
      <span
        className={`flex items-center gap-1.5 w-fit px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border mb-2
          ${type === "node" ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-orange-50 text-orange-600 border-orange-100"}`}
      >
        {type === "node" ? "Location" : "Connection"} <span className="opacity-50 mx-1">|</span> #{id}
      </span>
      {isEditing && type === "node" ? (
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full bg-white px-2 py-1 rounded border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 text-lg font-bold text-slate-800"
          autoFocus
          placeholder="Tên địa điểm..."
        />
      ) : (
        <h2 className="text-lg font-bold text-slate-800 leading-tight truncate">{name}</h2>
      )}
    </div>
    <button
      onClick={onToggleEdit}
      className={`flex items-center justify-center w-8 h-8 rounded-full transition-all 
        ${isEditing ? "bg-green-600 text-white shadow-lg hover:bg-green-700" : "bg-white text-slate-400 border border-slate-200 hover:text-blue-600 hover:border-blue-200"}`}
    >
      <span className="material-symbols-outlined text-lg">{isEditing ? "check" : "edit"}</span>
    </button>
  </div>
);

// --- NODE FORM (ĐÃ SỬA: Tách riêng thông tin tòa nhà và nút thiết lập nhỏ lại) ---
const NodeForm = ({
  data,
  isEditing,
  onChange,
  onManageBuilding,
  buildingMaps,
  buildingNodes,
  campusNodes,
}: {
  data: MapNode;
  isEditing: boolean;
  onChange: (f: string, v: any) => void;
  onManageBuilding: () => void;
  buildingMaps: any[];
  buildingNodes: MapNode[];
  campusNodes: MapNode[];
}) => {
  // Kiểm tra xem node này đã gắn building chưa
  const hasBuilding = !!data.building || !!data.building_id;
  const isOnBuildingMap = !!data.map?.building_id;
  const buildingInfo = data.building || { name: "Tòa nhà chưa đặt tên" };

  return (
    <>
      {/* 1. Coordinates */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Coordinates</h4>
          {isEditing && <span className="text-[10px] text-blue-600 italic animate-pulse">Kéo thả trên map</span>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-slate-500 font-medium mb-1 block">X</label>
            <div className="font-mono text-sm text-slate-700 font-bold bg-white px-2 py-1.5 rounded border border-slate-200">
              {Math.round(data.x || 0)}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-medium mb-1 block">Y</label>
            <div className="font-mono text-sm text-slate-700 font-bold bg-white px-2 py-1.5 rounded border border-slate-200">
              {Math.round(data.y || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Type */}
      <div>
        <label className="text-xs font-bold text-slate-700 mb-2 block">Loại địa điểm</label>
        <select
          disabled={!isEditing}
          value={data.type}
          onChange={(e) => onChange("type", e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 outline-none appearance-none ${
            isEditing ? "bg-white border-slate-300 focus:border-blue-500" : "bg-slate-50 border-transparent cursor-not-allowed"
          }`}
        >
          <option value="path">Điểm trung gian (Path)</option>
          <option value="room">Phòng (Room)</option>
          <option value="stairs">Cầu thang</option>
          <option value="elevator">Thang máy</option>
          <option value="entrance">Cổng ra vào</option>
        </select>
      </div>

      {/* 2b. ALIASES */}
      <div className="pt-4 border-t border-slate-100">
        {(() => {
          const aliases = data.aliases || [];
          return (
            <>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Tên gọi khác (Alias)</h4>
                {aliases.length > 0 && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                    {aliases.length} tên
                  </span>
                )}
              </div>
              
              {/* List aliases */}
              <div className="space-y-2 mb-3">
                {aliases.length > 0 ? (
                  aliases.map((alias: any, index: number) => (
                    <div key={alias.id || index} className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700">
                        {alias?.name || alias}
                      </div>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            const newAliases = aliases.filter((_: any, i: number) => i !== index);
                            onChange("aliases", newAliases.map((a: any) => a?.name || a));
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có tên gọi khác</p>
                )}
              </div>

              {/* Add alias input */}
              {isEditing && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Thêm tên gọi..."
                    className="flex-1 px-3 py-2 rounded-lg border text-black border-slate-300 text-sm focus:outline-none focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value) {
                          const currentAliases = aliases.map((a: any) => a?.name || a);
                          onChange("aliases", [...currentAliases, value]);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">Nhấn Enter để thêm</p>
            </>
          );
        })()}
      </div>

      {/* 3. BUILDING MANAGER */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Chi tiết tòa nhà</h4>
          {hasBuilding && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Đã thiết lập</span>}
        </div>

        {hasBuilding ? (
          // A. ĐÃ CÓ BUILDING -> HIỆN THÔNG TIN + NÚT NHỎ
          <div className="flex flex-col gap-2">
            {/* Thẻ hiển thị thông tin tòa nhà */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined">domain</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Tòa nhà trực thuộc</div>
                <div className="text-sm font-bold text-slate-800 truncate">
                  {buildingInfo.name}
                </div>
              </div>
            </div>

            {/* Nút thiết lập nhỏ ở dưới */}
            <button
              onClick={onManageBuilding}
              className="w-full flex items-center justify-center gap-2 py-2 mt-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              Quản lý / Đổi tòa nhà
            </button>
          </div>
        ) : (
          // B. CHƯA CÓ BUILDING -> HIỆN NÚT "THÊM" NÉT ĐỨT BỰ NHƯ CŨ
          <button
            onClick={onManageBuilding}
            className="group relative w-full py-4 rounded-xl overflow-hidden bg-white border-2 border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-300"
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined">domain_add</span>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-indigo-900">Thiết lập tòa nhà</div>
                <div className="text-[10px] text-indigo-500 font-medium mt-0.5">Thêm tầng & bản đồ chi tiết</div>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* 3b. LINKED FROM CAMPUS - Hiện cho node trên building map nếu được link từ campus */}
      {isOnBuildingMap && (() => {
        const linkedFromCampus = campusNodes.find((n: MapNode) => n.linked_campus_node_id === data.id);
        return linkedFromCampus ? (
          <div className="pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Liên kết từ Campus</h4>
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Đã liên kết</span>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-700 font-medium">
                {linkedFromCampus.name}
              </div>
              <div className="text-xs text-blue-500 mt-1">
                Đang liên kết từ bản đồ campus
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* 4. LINK TO FLOOR - Chỉ hiện khi có building và có nhiều hơn 1 tầng */}
      {hasBuilding && buildingMaps.length > 1 && (
        <div className="pt-4 border-t border-slate-100">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Liên kết tầng (Node)</h4>
            {(data.linked_node_ids?.length ?? 0) > 0 && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">{data.linked_node_ids?.length} node</span>}
          </div>
          
          <p className="text-[10px] text-slate-500 mb-2">
            Chọn node cầu thang/thang máy ở tầng khác để liên kết
          </p>
          
          <select
            disabled={!isEditing}
            value={""}
            onChange={(e) => {
              if (e.target.value) {
                const current = data.linked_node_ids || [];
                if (!current.includes(parseInt(e.target.value))) {
                  onChange("linked_node_ids", [...current, parseInt(e.target.value)]);
                }
              }
            }}
            className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 outline-none appearance-none ${
              isEditing ? "bg-white border-slate-300 focus:border-blue-500" : "bg-slate-50 border-transparent cursor-not-allowed"
            }`}
          >
            <option value="">-- Chọn node liên kết --</option>
            {buildingNodes
              .filter((n: MapNode) => n.id !== data.id && n.map_id !== data.map_id)
              .map((n: MapNode) => (
                <option key={n.id} value={n.id}>
                  {n.name} (Tầng {buildingMaps.find((m: any) => m.id === n.map_id)?.floor_level || '?'})
                </option>
              ))}
          </select>

          {/* Show linked nodes */}
          {(data.linked_node_ids?.length ?? 0) > 0 && (
            <div className="mt-2 space-y-1">
              {data.linked_node_ids?.map((nodeId: number) => {
                const linkedNode = buildingNodes.find((n: MapNode) => n.id === nodeId);
                if (!linkedNode) return null;
                return (
                  <div key={nodeId} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                    <span className="text-sm text-blue-700">
                      {linkedNode.name} (Tầng {buildingMaps.find((m: any) => m.id === linkedNode.map_id)?.floor_level || '?'})
                    </span>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => onChange("linked_node_ids", (data.linked_node_ids || []).filter((id: number) => id !== nodeId))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {data.type !== "stairs" && data.type !== "elevator" && data.type !== "entrance" && (
            <p className="text-[10px] text-orange-500 mt-2 italic">
              Nên dùng node loại "Cầu thang" hoặc "Thang máy" hoặc "Cổng ra vào" để liên kết tầng
            </p>
          )}
        </div>
      )}
    </>
  );
};
// --- EDGE FORM (Giữ nguyên) ---
const EdgeForm = ({ data, isEditing, onChange }: { data: MapEdge; isEditing: boolean; onChange: (f: string, v: any) => void }) => (
  <>
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
      <div className="text-xs text-slate-500">Kết nối</div>
      <div className="text-xs font-bold font-mono text-slate-700">
        #{data.start_node_id} <span className="mx-1 text-slate-400">→</span> #{data.end_node_id}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Weight</label>
        <input
          type="number"
          disabled={!isEditing}
          value={data.weight || 0}
          onChange={(e) => onChange("weight", parseFloat(e.target.value))}
          className={`w-full px-3 py-2 rounded-lg border text-sm font-mono font-bold text-slate-700 outline-none ${
            isEditing ? "bg-white border-slate-300 focus:border-blue-500" : "bg-slate-50 border-transparent"
          }`}
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Type</label>
        <select
          disabled={!isEditing}
          value={data.type}
          onChange={(e) => onChange("type", e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 outline-none ${
            isEditing ? "bg-white border-slate-300 focus:border-blue-500" : "bg-slate-50 border-transparent"
          }`}
        >
          <option value="walk">Đi bộ</option>
          <option value="stairs">Thang bộ</option>
          <option value="elevator">Thang máy</option>
        </select>
      </div>
    </div>
    <div
      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
        isEditing ? "bg-white border-slate-200" : "bg-slate-50 border-transparent"
      }`}
    >
      <span className="text-xs font-bold text-slate-600">Đường 2 chiều</span>
      <input
        type="checkbox"
        disabled={!isEditing}
        checked={data.bidirectional ?? true}
        onChange={(e) => onChange("bidirectional", e.target.checked)}
        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
      />
    </div>
  </>
);

const PanelFooter = ({ isEditing, onSave, onCancel, onDelete }: any) =>
  isEditing ? (
    <div className="p-4 border-t border-slate-200 bg-white grid grid-cols-2 gap-3">
      <button onClick={onCancel} className="py-2.5 rounded-lg text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors">
        Hủy bỏ
      </button>
      <button
        onClick={onSave}
        className="py-2.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 transition-colors"
      >
        Lưu thay đổi
      </button>
    </div>
  ) : (
    <div className="p-4 border-t border-slate-200 bg-slate-50">
      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-red-600 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 shadow-sm transition-all duration-200 font-bold text-xs"
      >
        <span className="material-symbols-outlined text-sm">delete</span> Xóa đối tượng
      </button>
    </div>
  );