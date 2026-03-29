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
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PlusIcon, UploadIcon, Building2Icon, LayersIcon } from "lucide-react";

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

    const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);

    return (
        <Sheet open onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="w-[50vw] h-[70vh] mt-[15vh] p-0 flex flex-col">
                <SheetHeader className="px-6 py-4 border-b shrink-0">
                    <SheetTitle>Quản lý Tòa nhà</SheetTitle>
                    <SheetDescription>Thiết lập danh sách tầng & bản đồ</SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 overflow-hidden">
                    <div className="w-40 border-r border-border bg-muted/30 overflow-y-auto shrink-0">
                        <div className="p-3">
                            <Button 
                                variant={selectedBuildingId === 'new' ? "default" : "outline"}
                                className="w-full justify-start mb-3 text-xs"
                                size="sm"
                                onClick={() => setSelectedBuildingId('new')}
                            >
                                <PlusIcon className="mr-1.5 h-3 w-3" />
                                Tạo tòa nhà
                            </Button>
                            
                            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2 px-1">
                                Danh sách
                            </p>
                            
                            <div className="space-y-0.5">
                                {isLoading && buildings.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-muted-foreground">Đang tải...</div>
                                ) : (
                                    buildings.map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => handleSelectBuilding(b.id)}
                                            className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-medium transition-colors truncate ${
                                                selectedBuildingId === b.id 
                                                    ? 'bg-primary text-primary-foreground' 
                                                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {b.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {selectedBuildingId === 'new' && (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <div className="w-14 h-14 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">
                                    <Building2Icon className="h-7 w-7" />
                                </div>
                                <h4 className="font-bold text-lg mb-2">Thêm tòa nhà mới</h4>
                                <p className="text-xs text-muted-foreground mb-4">Nhập tên tòa nhà để bắt đầu quản lý các tầng.</p>
                                
                                <div className="w-full space-y-2">
                                    <Input 
                                        placeholder="Ví dụ: Tòa nhà A"
                                        value={newBuildingName}
                                        onChange={e => setNewBuildingName(e.target.value)}
                                        autoFocus
                                        className="text-sm"
                                    />
                                    <Button 
                                        onClick={handleCreateBuilding}
                                        disabled={isLoading || !newBuildingName}
                                        className="w-full"
                                        size="sm"
                                    >
                                        {isLoading ? "Đang xử lý..." : "Xác nhận"}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {typeof selectedBuildingId === 'number' && selectedBuilding && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-[10px] font-bold text-primary uppercase">Đang chọn</p>
                                        <h2 className="text-xl font-extrabold">{selectedBuilding.name}</h2>
                                    </div>
                                    
                                    <Button 
                                        onClick={() => {
                                            const nextLevel = floors.length > 0 ? (floors[floors.length - 1].floor_level || 0) + 1 : 1;
                                            setUploadingLevel(nextLevel);
                                            fileInputRef.current?.click();
                                        }}
                                        disabled={isUploading}
                                        size="sm"
                                    >
                                        {isUploading ? "..." : <PlusIcon className="h-4 w-4" />}
                                        Thêm tầng
                                    </Button>
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    {floors.length === 0 ? (
                                        <div className="text-center py-8 border-2 border-dashed border-border rounded-xl bg-muted/30">
                                            <LayersIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                            <p className="text-xs text-muted-foreground">Chưa có bản đồ tầng nào.</p>
                                        </div>
                                    ) : (
                                        floors.map((map) => (
                                            <Card key={map.id} className="flex gap-3 p-3">
                                                <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex flex-col items-center justify-center shrink-0">
                                                    <span className="text-[8px] uppercase font-bold text-primary/60">Tầng</span>
                                                    <span className="text-lg font-bold leading-none">{map.floor_level}</span>
                                                </div>
                                                
                                                <div className="w-24 h-16 rounded-lg overflow-hidden border border-border bg-muted relative shrink-0">
                                                    <Image 
                                                        src={map.image_url} 
                                                        alt="Map" 
                                                        fill
                                                        className="object-contain"
                                                        unoptimized
                                                    />
                                                </div>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm truncate">{map.name}</div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <Badge variant="secondary" className="font-mono text-[10px]">ID: {map.id}</Badge>
                                                        <span className="text-[10px] text-muted-foreground">Scale: {map.scale_ratio}</span>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {selectedBuildingId === null && (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
                                <Building2Icon className="h-12 w-12 mb-2 opacity-30" />
                                <p className="text-sm">Chọn một tòa nhà để xem chi tiết.</p>
                            </div>
                        )}
                    </div>
                </div>
                
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleUploadFloor} accept="image/*" />
            </SheetContent>
        </Sheet>
    );
};
