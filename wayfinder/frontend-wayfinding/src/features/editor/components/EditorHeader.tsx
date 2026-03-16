import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { MapData } from "@/shared/types";

interface EditorHeaderProps {
    maps: MapData[];
    currentMapId?: number;
    onMapChange: (mapId: number) => void;
    onDelete?: () => void;
}

export const EditorHeader = ({ 
    maps = [], 
    currentMapId, 
    onMapChange, 
    onDelete,
}: EditorHeaderProps) => {

    const currentMap = maps.find(m => m.id === currentMapId);
    
    // --- STATE CHO CUSTOM DROPDOWN ---
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Logic: Click ra ngoài thì đóng dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelectMap = (id: number) => {
        onMapChange(id);
        setIsOpen(false);
    };

    const handleDeleteClick = () => {
        if (confirm(`Bạn có chắc chắn muốn xóa bản đồ "${currentMap?.name}" không?`)) {
            onDelete?.();
        }
    };

    // Phân nhóm Map để hiển thị cho đẹp
    const campusMaps = maps.filter(m => !m.building_id);
    const buildingMaps = maps.filter(m => m.building_id);

    return (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-30 shadow-sm relative">
            
            {/* LEFT: BACK BUTTON */}
            <div className="flex-1 flex items-center justify-start">
                <Link 
                    href="/admin/dashboard" 
                    className="group flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
                    title="Quay lại Dashboard"
                >
                    <span className="material-symbols-outlined text-xl group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                </Link>
            </div>

            {/* --- MIDDLE: CUSTOM MAP SELECTOR --- */}
            <div className="flex-1 flex justify-center min-w-0 px-4" ref={dropdownRef}>
                <div className="relative w-full max-w-md">
                    
                    {/* 1. TRIGGER BUTTON (Cái hiển thị chính) */}
                    <div 
                        onClick={() => setIsOpen(!isOpen)}
                        className={`flex items-center justify-between gap-3 px-4 py-2 rounded-full border bg-white cursor-pointer transition-all select-none
                            ${isOpen ? 'border-blue-500 ring-2 ring-blue-100 shadow-lg' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'}`}
                    >
                        {/* Icon & Text */}
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm transition-colors shrink-0
                                ${currentMap?.building_id ? 'bg-indigo-500' : 'bg-blue-500'}`}>
                                <span className="material-symbols-outlined text-lg">
                                    {currentMap?.building_id ? 'apartment' : 'map'}
                                </span>
                            </div>
                            <div className="flex flex-col items-start min-w-0">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">
                                    {currentMap ? (currentMap.building_id ? 'Building Map' : 'Campus Map') : 'Select Map'}
                                </span>
                                <h1 className="text-sm font-bold text-slate-800 truncate max-w-[200px]">
                                    {currentMap ? currentMap.name : "Chọn bản đồ..."}
                                </h1>
                            </div>
                        </div>

                        {/* Arrow Icon */}
                        <span className={`material-symbols-outlined text-slate-400 text-xl transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`}>
                            expand_more
                        </span>
                    </div>

                    {/* 2. DROPDOWN MENU (Danh sách xổ xuống) */}
                    {isOpen && (
                        <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                            <div className="max-h-[60vh] overflow-y-auto py-2 custom-scrollbar">
                                
                                {/* GROUP 1: CAMPUS MAPS */}
                                {campusMaps.length > 0 && (
                                    <div className="mb-2">
                                        <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                                            Bản đồ chung
                                        </div>
                                        {campusMaps.map(map => (
                                            <DropdownItem 
                                                key={map.id} 
                                                map={map} 
                                                isSelected={map.id === currentMapId} 
                                                onClick={() => handleSelectMap(map.id)} 
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* GROUP 2: BUILDING MAPS */}
                                {buildingMaps.length > 0 && (
                                    <div>
                                        <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                                            Bản đồ tòa nhà
                                        </div>
                                        {buildingMaps.map(map => (
                                            <DropdownItem 
                                                key={map.id} 
                                                map={map} 
                                                isSelected={map.id === currentMapId} 
                                                onClick={() => handleSelectMap(map.id)} 
                                            />
                                        ))}
                                    </div>
                                )}

                                {maps.length === 0 && (
                                    <div className="p-4 text-center text-sm text-slate-400 italic">
                                        Chưa có bản đồ nào
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: ACTIONS */}
            <div className="flex-1 flex items-center justify-end gap-3">
                {currentMapId && (
                    <button 
                        onClick={handleDeleteClick}
                        className="flex items-center justify-center w-10 h-10 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                        title="Xóa bản đồ"
                    >
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                )}
            </div>
        </header>
    );
};

// Component con để render từng dòng trong dropdown cho gọn
const DropdownItem = ({ map, isSelected, onClick }: { map: MapData, isSelected: boolean, onClick: () => void }) => (
    <div 
        onClick={onClick}
        className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors
            ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
    >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm
            ${map.building_id ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
            <span className="material-symbols-outlined text-lg">
                {map.building_id ? 'apartment' : 'map'}
            </span>
        </div>
        <div className="flex-1 min-w-0">
            <h4 className={`text-sm font-bold truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                {map.name}
            </h4>
            {map.building_id && (
                <p className="text-[10px] text-slate-400 truncate">ID Tòa nhà: #{map.building_id}</p>
            )}
        </div>
        {isSelected && (
            <span className="material-symbols-outlined text-blue-600 text-lg">check_circle</span>
        )}
    </div>
);