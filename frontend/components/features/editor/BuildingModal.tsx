'use client';

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { buildingApi } from "@/services/building-api";
import { editorApi } from "@/services/editor-api";
import { mapApi } from "@/services/maps-api";
import { useBuildingStore } from "@/stores/building.store";
import { MapData } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface BuildingModalProps {
    nodeId?: number;
    initialBuildingId?: number | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export const BuildingModal = ({ nodeId, initialBuildingId, onClose, onSuccess }: BuildingModalProps) => {
    const buildings = useBuildingStore((state) => state.buildings);
    const fetchBuildings = useBuildingStore((state) => state.fetchBuildings);
    const addBuilding = useBuildingStore((state) => state.addBuilding);
    
    const [selectedBuildingId, setSelectedBuildingId] = useState<number | 'new' | null>(initialBuildingId || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const [newBuildingName, setNewBuildingName] = useState("");
    const [floors, setFloors] = useState<MapData[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingLevel, setUploadingLevel] = useState<number | null>(null);

    useEffect(() => {
        fetchBuildings();
    }, [fetchBuildings]);

    useEffect(() => {
        if (typeof selectedBuildingId === 'number') {
            loadFloors(selectedBuildingId);
        } else {
            setFloors([]);
        }
    }, [selectedBuildingId]);

    const loadFloors = async (buildingId: number) => {
        const allMaps = await mapApi.getAll();
        const buildingMaps = allMaps
            .filter(m => m.building_id === buildingId)
            .sort((a, b) => (a.floor_level || 0) - (b.floor_level || 0));
        setFloors(buildingMaps);
    };

    const linkNodeToBuilding = async (buildingId: number) => {
        if (!nodeId) return;
        try {
            await editorApi.updateNode(nodeId, { building_id: buildingId });
        } catch (error) {
            console.error("Lỗi liên kết node với building", error);
        }
    };

    const handleSelectBuilding = async (buildingId: number) => {
        setSelectedBuildingId(buildingId);
        await linkNodeToBuilding(buildingId);
        onSuccess?.();
    };

    const handleCreateBuilding = async () => {
        if (!newBuildingName.trim()) return;
        setIsLoading(true);
        try {
            const newBuilding = await buildingApi.create({ name: newBuildingName });
            addBuilding(newBuilding);
            setSelectedBuildingId(newBuilding.id);
            await linkNodeToBuilding(newBuilding.id);
            setNewBuildingName("");
            onSuccess?.();
        } catch {
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
        } catch (error) {
            console.error(error);
            alert("Upload thất bại!");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setUploadingLevel(null);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="!w-[900px] !max-w-[95vw] !h-[700px] !max-h-[90vh] !overflow-hidden !p-0 !gap-0">
                <DialogHeader className="px-6 py-4 border-b border-border">
                    <DialogTitle>Quản lý Tòa nhà</DialogTitle>
                    <DialogDescription>
                        Thiết lập danh sách tầng & bản đồ
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 overflow-hidden">
                    <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
                        <div className="p-4">
                            <Button 
                                variant={selectedBuildingId === 'new' ? "default" : "outline"}
                                className="w-full justify-start mb-4"
                                onClick={() => setSelectedBuildingId('new')}
                            >
                                <span className="material-symbols-outlined mr-2">add_circle</span> 
                                Tạo tòa nhà
                            </Button>
                            
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-2 block">
                                Danh sách
                            </Label>
                            
                            <div className="space-y-1 overflow-y-auto max-h-[50vh] pr-1">
                                {isLoading && buildings.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-muted-foreground">Đang tải...</div>
                                ) : (
                                    buildings.map(b => (
                                        <Button
                                            key={b.id}
                                            variant={selectedBuildingId === b.id ? "secondary" : "ghost"}
                                            size="sm"
                                            onClick={() => handleSelectBuilding(b.id)}
                                            className={`w-full justify-start font-semibold ${
                                                selectedBuildingId === b.id 
                                                    ? '' 
                                                    : 'text-muted-foreground'
                                            }`}
                                        >
                                            <span className="truncate">{b.name}</span>
                                            {selectedBuildingId === b.id && <span className="material-symbols-outlined text-base ml-auto">chevron_right</span>}
                                        </Button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 bg-background relative overflow-y-auto">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        <div className="absolute inset-0 p-8 z-10">
                            
                            {selectedBuildingId === 'new' && (
                                <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center">
                                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                                        <span className="material-symbols-outlined text-4xl">domain_add</span>
                                    </div>
                                    <h4 className="font-bold text-2xl mb-2">Thêm tòa nhà mới</h4>
                                    <p className="text-sm text-muted-foreground mb-8">Nhập tên tòa nhà để bắt đầu quản lý các tầng.</p>
                                    
                                    <Input 
                                        className="w-full mb-4"
                                        placeholder="Ví dụ: Tòa nhà A - Block B"
                                        value={newBuildingName}
                                        onChange={e => setNewBuildingName(e.target.value)}
                                        autoFocus
                                    />
                                    <Button 
                                        onClick={handleCreateBuilding}
                                        disabled={isLoading || !newBuildingName}
                                        className="w-full"
                                    >
                                        {isLoading ? "Đang xử lý..." : "Xác nhận & Tạo tầng"}
                                    </Button>
                                </div>
                            )}

                            {typeof selectedBuildingId === 'number' && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <Label className="text-xs font-bold text-primary uppercase tracking-wider mb-1 block">
                                                Đang chọn
                                            </Label>
                                            <h2 className="text-3xl font-extrabold tracking-tight">
                                                {buildings.find(b => b.id === selectedBuildingId)?.name}
                                            </h2>
                                        </div>
                                        
                                        <Button 
                                            onClick={() => {
                                                const nextLevel = floors.length > 0 ? (floors[floors.length - 1].floor_level || 0) + 1 : 1;
                                                setUploadingLevel(nextLevel);
                                                fileInputRef.current?.click();
                                            }}
                                            disabled={isUploading}
                                        >
                                            {isUploading ? (
                                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                            ) : (
                                                <span className="material-symbols-outlined mr-2">add_photo_alternate</span>
                                            )}
                                            {isUploading ? "Đang tải..." : `Thêm tầng ${floors.length + 1}`}
                                        </Button>
                                    </div>

                                    <Separator />

                                    <div className="space-y-4">
                                        {floors.length === 0 ? (
                                            <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-muted/30">
                                                <div className="w-16 h-16 bg-muted text-muted-foreground rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                                    <span className="material-symbols-outlined text-3xl">layers_clear</span>
                                                </div>
                                                <p className="text-muted-foreground font-medium">Chưa có bản đồ tầng nào.</p>
                                                <p className="text-xs text-muted-foreground mt-1">Bấm nút &quot;Thêm tầng&quot; ở trên để bắt đầu.</p>
                                            </div>
                                        ) : (
                                            floors.map((map) => (
                                                <div key={map.id} className="group flex gap-5 p-4 border border-border rounded-xl bg-card shadow-sm hover:shadow-md transition-all items-center">
                                                    <div className="w-14 h-14 bg-primary/10 text-primary rounded-xl flex flex-col items-center justify-center border border-primary/20 shrink-0">
                                                        <span className="text-[10px] uppercase font-bold text-primary/60">Tầng</span>
                                                        <span className="text-xl font-bold leading-none">{map.floor_level}</span>
                                                    </div>
                                                    
                                                    <div className="w-32 h-20 rounded-lg overflow-hidden border border-border bg-muted relative">
                                                        <Image 
                                                            src={map.image_url} 
                                                            alt="Map" 
                                                            fill
                                                            className="object-contain"
                                                            unoptimized
                                                        />
                                                    </div>
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-lg truncate">{map.name}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Badge variant="secondary" className="font-mono text-xs">ID: {map.id}</Badge>
                                                            <span className="text-xs text-muted-foreground">Scale: {map.scale_ratio}</span>
                                                        </div>
                                                    </div>

                                                    <Button 
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => { /* TODO: Open map editor */ }}
                                                    >
                                                        Chỉnh sửa
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {selectedBuildingId === null && (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
                                    <span className="material-symbols-outlined text-6xl mb-4 text-muted-foreground/30">apartment</span>
                                    <p>Chọn một tòa nhà bên trái để xem chi tiết.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleUploadFloor} accept="image/*" />
            </DialogContent>
        </Dialog>
    );
};
