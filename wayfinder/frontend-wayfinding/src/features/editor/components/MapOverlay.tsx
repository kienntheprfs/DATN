import { useRef, useState, useEffect } from "react";
import { MapData, Building } from "@/shared/types";
import { mapApi } from "@/features/maps/api/maps";
import { buildingApi } from "@/features/editor/api/buildingApi";
import { useEditorStore } from "../stores/editorStores";

interface MapOverlayProps {
  onUploadSuccess: (mapData: MapData) => void;
}

export const MapOverlay = ({ onUploadSuccess }: MapOverlayProps) => {
  // 👇 1. LẤY STATE & ACTION TỪ STORE
  const { maps, setMaps } = useEditorStore();
  const [loading, setLoading] = useState(true);

  // 2. FETCH DANH SÁCH MAP KHI MOUNT
  useEffect(() => {
    const loadMaps = async () => {
      // Nếu store đã có data thì tắt loading ngay (trải nghiệm mượt hơn)
      // nhưng vẫn gọi API ngầm để update mới nhất
      if (maps.length > 0) {
          setLoading(false);
      }

      try {
        const data = await mapApi.getAll();
        
        // Cập nhật vào Global Store
        setMaps(data);
        
        // 👇 QUAN TRỌNG: Dùng biến 'data' để check logic (vì state 'maps' chưa update kịp)
        const campusMaps = data.filter(m => !m.building_id);
        if (campusMaps.length === 1 && data.length === 1) {
             onUploadSuccess(campusMaps[0]);
             return;
        }
      } catch (error) {
        console.error("Lỗi tải danh sách map:", error);
      } finally {
        setLoading(false);
      }
    };
    loadMaps();
  }, [onUploadSuccess, setMaps]); // Bỏ maps.length ra để tránh loop, chỉ load khi mount

  if (loading) {
      return (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
               <span className="material-symbols-outlined text-4xl animate-spin text-blue-600">progress_activity</span>
          </div>
      );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-900/20 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="flex flex-col p-8 border border-blue-50 rounded-3xl bg-white shadow-2xl shadow-blue-900/20 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto text-slate-700">
        
        <h3 className="text-2xl font-extrabold text-slate-800 mb-6 text-center">Quản lý Bản đồ</h3>

        {/* PHẦN 1: LIST MAP CÓ SẴN (Lấy trực tiếp từ Store maps) */}
        {maps.length > 0 && (
            <ExistingMapSection maps={maps} onSelect={onUploadSuccess} />
        )}

        {/* Divider */}
        <div className="relative my-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
            <div className="relative flex justify-center"><span className="bg-white px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Hoặc tải mới</span></div>
        </div>

        {/* PHẦN 2: FORM UPLOAD */}
        <UploadMapForm onSuccess={onUploadSuccess} />
        
      </div>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const ExistingMapSection = ({ maps, onSelect }: { maps: MapData[], onSelect: (m: MapData) => void }) => {
    // Reset selectedId khi danh sách maps thay đổi
    const [selectedId, setSelectedId] = useState<string>("");

    // Effect để set default value khi maps load xong
    useEffect(() => {
        if (maps.length > 0 && !selectedId) {
            setSelectedId(maps[0].id.toString());
        }
    }, [maps, selectedId]);

    const handleSelect = () => {
        const map = maps.find(m => m.id.toString() === selectedId);
        if (map) onSelect(map);
    };

    return (
        <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
            <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined">folder_open</span> Mở bản đồ đã lưu
            </h4>
            <div className="flex gap-3">
                <select 
                    value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                    className="flex-1 pl-4 pr-10 py-3 rounded-xl border border-blue-200 bg-white focus:ring-2 focus:ring-blue-400 outline-none cursor-pointer text-slate-700 font-medium"
                >
                    {maps.map((map) => (
                        <option key={map.id} value={map.id}>
                            {map.name} ({map.building_id ? `Tòa nhà #${map.building_id}` : "Campus/Chung"})
                        </option>
                    ))}
                </select>
                <button onClick={handleSelect} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 whitespace-nowrap">
                    Mở Map
                </button>
            </div>
        </div>
    );
};

const UploadMapForm = ({ onSuccess }: { onSuccess: (m: MapData) => void }) => {
    // 1. Lấy maps (để tính tầng) và addMap (để update UI) từ Store
    const { maps: existingMaps, addMap } = useEditorStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [name, setName] = useState("");
    const [scale, setScale] = useState<string>("1.0");
    const [floor, setFloor] = useState<string>("");
    
    // Building State
    const [buildingId, setBuildingId] = useState<string>(""); 
    const [buildings, setBuildings] = useState<Building[]>([]);

    // Preview ảnh
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Load Buildings
    useEffect(() => {
        const fetchBuildings = async () => {
            try {
                const data = await buildingApi.getAll();
                setBuildings(data);
            } catch (err) {
                console.error("Lỗi load buildings", err);
            }
        };
        fetchBuildings();
    }, []);

    // 2. LOGIC: AUTO TÍNH TẦNG (Lấp chỗ trống) & AUTO ĐIỀN TÊN
    useEffect(() => {
        // A. Nếu chưa chọn tòa nhà (Campus)
        if (!buildingId) {
            setFloor("");
            // Nếu tên đang trống hoặc đang là tên auto cũ thì reset
            if (!name || name.includes("Tầng")) setName("Bản đồ Campus"); 
            return;
        }

        const selectedBuilding = buildings.find(b => b.id === Number(buildingId));
        
        // 1. Lấy danh sách các tầng hiện có và sắp xếp tăng dần
        const mapsInBuilding = existingMaps.filter(m => m.building_id === Number(buildingId));
        
        const existingFloors = mapsInBuilding
            .map(m => m.floor_level || 0)
            .sort((a, b) => a - b); // Sắp xếp: [1, 2, 4, 5]

        // 2. Thuật toán tìm số tầng còn thiếu đầu tiên (bắt đầu từ 1)
        let suggestFloor = 1;
        for (const floor of existingFloors) {
            // Nếu tầng này đã có, thì nhảy sang tầng tiếp theo
            if (floor === suggestFloor) {
                suggestFloor++;
            } 
            // Nếu floor > suggestFloor (VD: floor=4, suggest=3) -> Tức là 3 đang thiếu -> Dừng lại lấy 3
            else if (floor > suggestFloor) {
                break;
            }
        }
        
        // 3. Set giá trị
        setFloor(suggestFloor.toString());

        // 4. Auto điền tên
        if (selectedBuilding) {
            setName(`Tầng ${suggestFloor} - ${selectedBuilding.name}`);
        }

    }, [buildingId, existingMaps, buildings]); // Bỏ 'name' ra khỏi dep để tránh loop

    // Xử lý chọn file
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            if (!name) setName(file.name.split('.')[0]);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        if (!name.trim()) { setError("Vui lòng nhập tên bản đồ."); return; }

        setIsProcessing(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("name", name);
            formData.append("file", selectedFile);
            formData.append("scale_ratio", scale.toString());
            
            if (floor && buildingId) formData.append("floor_level", floor.toString());
            if (buildingId) formData.append("building_id", buildingId.toString());

            const newMap = await mapApi.upload(formData);
            
            // 👇 QUAN TRỌNG: Thêm map mới vào Store ngay lập tức
            addMap(newMap);
            
            onSuccess(newMap);

        } catch (err: any) {
            console.error(err);
            setError("Upload thất bại. Vui lòng thử lại.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div>
            <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-500">add_photo_alternate</span> Tải lên bản đồ mới
            </h4>
            
            <div className="space-y-4">
                {/* VÙNG CHỌN ẢNH */}
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden
                        ${previewUrl ? 'border-blue-400 bg-slate-50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'}`}
                >
                    {previewUrl ? (
                        <>
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-white font-bold text-sm">Bấm để đổi ảnh khác</span>
                            </div>
                        </>
                    ) : (
                        <div className="text-center p-4">
                            <span className="material-symbols-outlined text-3xl text-slate-400 mb-2">cloud_upload</span>
                            <p className="text-sm font-bold text-slate-500">Chọn file ảnh bản đồ</p>
                            <p className="text-xs text-slate-400 mt-1">(PNG, JPG, SVG)</p>
                        </div>
                    )}
                </div>

                {/* TÊN BẢN ĐỒ */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Tên bản đồ *</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="VD: Tầng 1 - Tòa A"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-all" />
                </div>
                
                {/* TÒA NHÀ & TẦNG */}
                <div className="grid grid-cols-2 gap-4">
                    {/* CHỌN TÒA NHÀ */}
                    <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Thuộc Tòa nhà</label>
                         <div className="relative">
                            <select 
                                value={buildingId} 
                                onChange={e => setBuildingId(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none appearance-none cursor-pointer font-medium text-slate-700"
                            >
                                <option value="">-- Campus / Chung --</option>
                                {buildings.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                         </div>
                    </div>

                    {/* SỐ TẦNG (TỰ ĐỘNG) */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">
                            Tầng số <span className="text-[10px] font-normal lowercase text-blue-500">(Auto)</span>
                        </label>
                        <div className="relative">
                             <input 
                                type="number" 
                                value={floor} 
                                readOnly 
                                disabled
                                placeholder="-"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-bold outline-none cursor-not-allowed" 
                            />
                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">lock</span>
                        </div>
                    </div>
                </div>
                
                {/* SCALE */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Tỉ lệ (Scale)</label>
                    <input type="number" step="0.1" value={scale} onChange={e => setScale(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none" />
                </div>

                {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded flex items-center gap-1"><span className="material-symbols-outlined text-sm">error</span> {error}</div>}
                
                <button 
                    onClick={handleUpload} 
                    disabled={isProcessing || !selectedFile}
                    className="w-full py-3.5 px-6 font-bold rounded-xl shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
                >
                    {isProcessing ? "Đang tải lên..." : <><span className="material-symbols-outlined">upload_file</span> Xác nhận tải lên</>}
                </button>
            </div>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isProcessing} />
        </div>
    );
};