import { useState, useEffect, useRef } from "react";
import { buildingApi } from "@/features/editor/api/buildingApi";
import { editorApi } from "@/features/editor/api/editorApi";
import { mapApi } from "@/features/maps/api/maps";
import { Building, MapData } from "@/shared/types";

interface BuildingModalProps {
    nodeId: number;
    initialBuildingId?: number | null;
    onClose: () => void;
    onSuccess: () => void;
}

export const BuildingModal = ({ nodeId, onClose, initialBuildingId, onSuccess }: BuildingModalProps) => {
    // --- STATE ---
    const [buildings, setBuildings] = useState<Building[]>([]);
    
    // Ưu tiên lấy ID truyền vào làm mặc định
    const [selectedBuildingId, setSelectedBuildingId] = useState<number | 'new' | null>(initialBuildingId || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false); // State riêng cho upload để ko block UI chính

    const [newBuildingName, setNewBuildingName] = useState("");
    const [floors, setFloors] = useState<MapData[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingLevel, setUploadingLevel] = useState<number | null>(null);

    // 1. Fetch danh sách tòa nhà
    useEffect(() => {
        loadBuildings();
    }, []);

    // 2. Fetch floors khi chọn building
    useEffect(() => {
        if (typeof selectedBuildingId === 'number') {
            loadFloors(selectedBuildingId);
        } else {
            setFloors([]);
        }
    }, [selectedBuildingId]);

    const loadBuildings = async () => {
        setIsLoading(true);
        try {
            const data = await buildingApi.getAll();
            setBuildings(data);
        } catch (error) {
            console.error("Lỗi tải buildings", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadFloors = async (buildingId: number) => {
        // Giả lập loading nhẹ để UX mượt hơn
        const allMaps = await mapApi.getAll();
        const buildingMaps = allMaps
            .filter(m => m.building_id === buildingId)
            .sort((a, b) => (a.floor_level || 0) - (b.floor_level || 0));
        setFloors(buildingMaps);
    };

    // Cập nhật building_id cho node trực tiếp
    const linkNodeToBuilding = async (buildingId: number) => {
        try {
            await editorApi.updateNode(nodeId, { building_id: buildingId });
        } catch (error) {
            console.error("Lỗi liên kết node với building", error);
        }
    };

    // --- HANDLERS ---
    const handleSelectBuilding = async (buildingId: number) => {
        setSelectedBuildingId(buildingId);
        await linkNodeToBuilding(buildingId);
        onSuccess();
    };

    const handleCreateBuilding = async () => {
        if (!newBuildingName.trim()) return;
        setIsLoading(true);
        try {
            const newBuilding = await buildingApi.create({ name: newBuildingName });
            setBuildings([...buildings, newBuilding]);
            setSelectedBuildingId(newBuilding.id);
            await linkNodeToBuilding(newBuilding.id);
            setNewBuildingName("");
            onSuccess();
        } catch (error) {
            alert("Lỗi tạo tòa nhà");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUploadFloor = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || typeof selectedBuildingId !== 'number' || uploadingLevel === null) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("name", `Tầng ${uploadingLevel} - Building #${selectedBuildingId}`);
            formData.append("scale_ratio", "1.0");
            formData.append("building_id", selectedBuildingId.toString());
            formData.append("floor_level", uploadingLevel.toString());

            await mapApi.upload(formData);
            await loadFloors(selectedBuildingId);
            
            // Nếu muốn callback ra ngoài để refresh
            // onSuccess(); 
        } catch (error) {
            console.error(error);
            alert("Upload thất bại!");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setUploadingLevel(null);
        }
    };

    // --- RENDER ---
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            {/* Main Container: Bo tròn, bóng đổ xanh, viền xanh nhạt */}
            <div className="bg-white rounded-3xl shadow-2xl shadow-blue-900/20 w-full max-w-4xl overflow-hidden flex flex-col h-[85vh] text-slate-700 ring-1 ring-blue-100">
                
                {/* HEADER */}
                <div className="px-6 py-4 border-b border-blue-50 bg-white flex justify-between items-center z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <span className="material-symbols-outlined">apartment</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Quản lý Tòa nhà</h3>
                            <p className="text-xs text-slate-400 font-medium">Thiết lập danh sách tầng & bản đồ</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* LEFT: SIDEBAR (Màu xanh rất nhạt) */}
                    <div className="w-64 border-r border-blue-50 bg-slate-50/50 flex flex-col">
                        <div className="p-4">
                            <button 
                                onClick={() => setSelectedBuildingId('new')}
                                className={`w-full py-3 px-4 mb-4 rounded-xl flex items-center gap-3 font-bold text-sm transition-all shadow-sm
                                    ${selectedBuildingId === 'new' 
                                        ? 'bg-indigo-600 text-white shadow-indigo-200' 
                                        : 'bg-white border border-blue-100 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-xl">add_circle</span> 
                                Tạo tòa nhà
                            </button>
                            
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Danh sách</div>
                            
                            <div className="space-y-1 overflow-y-auto max-h-[60vh] pr-1 scrollbar-hide">
                                {isLoading && buildings.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-slate-400">Đang tải...</div>
                                ) : (
                                    buildings.map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => handleSelectBuilding(b.id)}
                                            className={`w-full text-left py-2.5 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-between group
                                                ${selectedBuildingId === b.id 
                                                    ? 'bg-blue-100 text-blue-700' 
                                                    : 'text-slate-600 hover:bg-white hover:text-blue-600 hover:shadow-sm'
                                                }`}
                                        >
                                            <span className="truncate">{b.name}</span>
                                            {selectedBuildingId === b.id && <span className="material-symbols-outlined text-base">chevron_right</span>}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: CONTENT */}
                    <div className="flex-1 bg-white relative">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        <div className="absolute inset-0 p-8 overflow-y-auto z-10">
                            
                            {/* CASE 1: FORM TẠO MỚI */}
                            {selectedBuildingId === 'new' && (
                                <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center animate-in zoom-in-95 duration-300">
                                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                                        <span className="material-symbols-outlined text-4xl">domain_add</span>
                                    </div>
                                    <h4 className="font-bold text-2xl mb-2 text-slate-800">Thêm tòa nhà mới</h4>
                                    <p className="text-sm text-slate-500 mb-8">Nhập tên tòa nhà để bắt đầu quản lý các tầng.</p>
                                    
                                    <input 
                                        className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl mb-4 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-semibold text-slate-800 placeholder:font-normal"
                                        placeholder="Ví dụ: Tòa nhà A - Block B"
                                        value={newBuildingName}
                                        onChange={e => setNewBuildingName(e.target.value)}
                                        autoFocus
                                    />
                                    <button 
                                        onClick={handleCreateBuilding}
                                        disabled={isLoading || !newBuildingName}
                                        className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-lg shadow-indigo-200"
                                    >
                                        {isLoading ? "Đang xử lý..." : "Xác nhận & Tạo tầng"}
                                    </button>
                                </div>
                            )}

                            {/* CASE 2: CHI TIẾT TÒA NHÀ & TẦNG */}
                            {typeof selectedBuildingId === 'number' && (
                                <div className="animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex justify-between items-end mb-8">
                                        <div>
                                            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Đang chọn</div>
                                            <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                                                {buildings.find(b => b.id === selectedBuildingId)?.name}
                                            </h2>
                                        </div>
                                        
                                        {/* Nút thêm tầng nổi bật */}
                                        <button 
                                            onClick={() => {
                                                const nextLevel = floors.length > 0 ? (floors[floors.length - 1].floor_level || 0) + 1 : 1;
                                                setUploadingLevel(nextLevel);
                                                fileInputRef.current?.click();
                                            }}
                                            disabled={isUploading}
                                            className="bg-blue-600 text-white pl-4 pr-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-transform active:scale-95 disabled:opacity-70"
                                        >
                                            {isUploading ? (
                                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            ) : (
                                                <span className="material-symbols-outlined">add_photo_alternate</span>
                                            )}
                                            {isUploading ? "Đang tải..." : `Thêm tầng ${floors.length + 1}`}
                                        </button>
                                    </div>

                                    {/* LIST CÁC TẦNG */}
                                    <div className="space-y-4">
                                        {floors.length === 0 ? (
                                            <div className="text-center py-16 border-2 border-dashed border-blue-100 rounded-2xl bg-blue-50/30">
                                                <div className="w-16 h-16 bg-white text-blue-300 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                                    <span className="material-symbols-outlined text-3xl">layers_clear</span>
                                                </div>
                                                <p className="text-slate-500 font-medium">Chưa có bản đồ tầng nào.</p>
                                                <p className="text-xs text-slate-400 mt-1">Bấm nút "Thêm tầng" ở trên để bắt đầu.</p>
                                            </div>
                                        ) : (
                                            floors.map((map) => (
                                                <div key={map.id} className="group flex gap-5 p-4 border border-blue-50 rounded-2xl bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all items-center">
                                                    {/* Badge Số tầng */}
                                                    <div className="w-14 h-14 bg-linear-to-br from-blue-50 to-indigo-50 text-blue-700 rounded-xl flex flex-col items-center justify-center border border-blue-100 shrink-0">
                                                        <span className="text-[10px] uppercase font-bold text-blue-400">Tầng</span>
                                                        <span className="text-xl font-bold leading-none">{map.floor_level}</span>
                                                    </div>
                                                    
                                                    {/* Map Preview */}
                                                    <div className="w-32 h-20 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 relative">
                                                        <img src={map.image_url} alt="Map" className="w-full h-full object-contain" />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                                                    </div>
                                                    
                                                    {/* Info */}
                                                    <div className="flex-1">
                                                        <div className="font-bold text-slate-800 text-lg">{map.name}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">ID: {map.id}</span>
                                                            <span className="text-xs text-slate-400">Scale: {map.scale_ratio}</span>
                                                        </div>
                                                    </div>

                                                    {/* Action */}
                                                    <button 
                                                        onClick={() => {/* Logic mở map */}}
                                                        className="px-4 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm font-bold border border-slate-200 hover:bg-white hover:text-blue-600 hover:border-blue-200 transition-colors"
                                                    >
                                                        Chỉnh sửa
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* EMPTY STATE (Chưa chọn gì) */}
                            {selectedBuildingId === null && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <span className="material-symbols-outlined text-6xl mb-4 text-slate-300">apartment</span>
                                    <p>Chọn một tòa nhà bên trái để xem chi tiết.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Hidden Input */}
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleUploadFloor} accept="image/*" />
            </div>
        </div>
    );
};