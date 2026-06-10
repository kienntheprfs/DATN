'use client';

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { buildingApi } from "@/services/building-api";
import { mapApi } from "@/services/maps-api";
import { editorApi } from "@/services/editor-api";
import { getFullImageUrl } from "@/services/wayfinding-client";
import { useBuildingStore } from "@/stores/building.store";
import { useConfirmStore } from "@/stores/confirm.store";
import { MapData } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CustomModal } from "@/components/features/faq/CustomModal";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";

interface StructuredDescription {
  landmarks?: string;
  colors?: string;
  proximity?: string;
  signs?: string;
  notes?: string;
}

const parseDescription = (desc: string): StructuredDescription => {
  if (!desc) return {};
  try {
    const parsed = JSON.parse(desc);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as StructuredDescription;
    }
  } catch (e) {
    return { notes: desc };
  }
  return {};
};

interface BuildingModalProps {
    initialBuildingId?: number | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export const BuildingModal = ({ initialBuildingId, onClose, onSuccess }: BuildingModalProps) => {
    const buildings = useBuildingStore((state) => state.buildings);
    const fetchBuildings = useBuildingStore((state) => state.fetchBuildings);
    const addBuilding = useBuildingStore((state) => state.addBuilding);
    const confirm = useConfirmStore((state) => state.confirm);
    
    const [selectedBuildingId, setSelectedBuildingId] = useState<number | 'new' | null>(initialBuildingId || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const [newBuildingName, setNewBuildingName] = useState("");
    const [newBuildingDescription, setNewBuildingDescription] = useState("");
    const [newBuildingImageUrl, setNewBuildingImageUrl] = useState("");
    const [floors, setFloors] = useState<MapData[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const buildingImageInputRef = useRef<HTMLInputElement>(null);
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
        try {
            const allMaps = await mapApi.getAll();
            const buildingMaps = allMaps
                .filter(m => m.building_id === buildingId)
                .sort((a, b) => (a.floor_level || 0) - (b.floor_level || 0));
            setFloors(buildingMaps);
        } catch (error) {
            console.error("Error loading floors:", error);
        }
    };

    const handleCreateBuilding = async () => {
        if (!newBuildingName.trim()) return;
        setIsLoading(true);
        try {
            const newBuilding = await buildingApi.create({ 
                name: newBuildingName,
                description: newBuildingDescription,
                real_image_url: newBuildingImageUrl
            });
            addBuilding(newBuilding);
            setSelectedBuildingId(newBuilding.id);
            setNewBuildingName("");
            setNewBuildingDescription("");
            setNewBuildingImageUrl("");
            toast.success("Đã tạo tòa nhà mới thành công!");
            onSuccess?.();
        } catch (error) {
            toast.error("Lỗi tạo tòa nhà", {
                description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteBuilding = async () => {
        if (typeof selectedBuildingId !== 'number') return;
        
        const confirmed = await confirm({
            title: "Xác nhận xóa tòa nhà",
            description: "Bạn có chắc chắn muốn xóa tòa nhà này? Tất cả dữ liệu liên quan sẽ bị ảnh hưởng.",
            variant: 'destructive',
            confirmText: 'Xóa tòa nhà'
        });

        if (!confirmed) return;
        
        setIsLoading(true);
        try {
            await buildingApi.delete(selectedBuildingId);
            await fetchBuildings();
            setSelectedBuildingId(null);
            toast.success("Đã xóa tòa nhà thành công!");
            onSuccess?.();
        } catch (error) {
            toast.error("Lỗi xóa tòa nhà", {
                description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteMap = async (mapId: number) => {
        const confirmed = await confirm({
            title: "Xác nhận xóa sơ đồ tầng",
            description: "Bạn có chắc chắn muốn xóa sơ đồ tầng này?",
            variant: 'destructive',
            confirmText: 'Xóa sơ đồ'
        });

        if (!confirmed) return;
        
        try {
            await mapApi.delete(mapId);
            if (typeof selectedBuildingId === 'number') {
                await loadFloors(selectedBuildingId);
            }
            toast.success("Đã xóa sơ đồ tầng!");
            onSuccess?.();
        } catch (error) {
            toast.error("Lỗi xóa sơ đồ", {
                description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
            });
        }
    };

    const handleUploadFloor = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || typeof selectedBuildingId !== 'number' || uploadingLevel === null) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("name", `Tầng ${uploadingLevel} - ${buildings.find(b => b.id === selectedBuildingId)?.name}`);
            formData.append("scale_ratio", "1.0");
            formData.append("building_id", selectedBuildingId.toString());
            formData.append("floor_level", uploadingLevel.toString());

            await mapApi.upload(formData);
            await loadFloors(selectedBuildingId);
            toast.success(`Đã thêm sơ đồ Tầng ${uploadingLevel}!`);
            onSuccess?.();
        } catch (error) {
            console.error(error);
            toast.error("Upload thất bại!", {
                description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
            });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setUploadingLevel(null);
        }
    };

    const handleUploadBuildingImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            
            const { url } = await editorApi.uploadImage(formData);
            
            if (selectedBuildingId === 'new') {
                setNewBuildingImageUrl(url);
            } else if (typeof selectedBuildingId === 'number') {
                await buildingApi.update(selectedBuildingId, { real_image_url: url });
                await fetchBuildings();
            }
            
            toast.success("Đã tải ảnh tòa nhà thành công!");
        } catch (error) {
            toast.error("Upload thất bại!", {
                description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
            });
        } finally {
            setIsUploading(false);
            if (buildingImageInputRef.current) buildingImageInputRef.current.value = "";
        }
    };

    const filteredBuildings = buildings.filter(b => 
        b.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);

    return (
        <CustomModal
            isOpen={true}
            onClose={onClose}
            title="Quản lý Hạ tầng & Bản đồ"
            description="Tổ chức các tòa nhà và tải lên bản đồ cho từng tầng."
            size="full"
        >
            <div className="flex h-[calc(90vh-140px)] -mx-6 -my-6 overflow-hidden">
                {/* LEFT SIDEBAR - Building List */}
                <div className="w-[280px] flex flex-col border-r border-border/60 bg-muted/10 shrink-0">
                    <div className="p-4 border-b border-border/40">
                        <div className="relative mb-3">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground opacity-50">search</span>
                            <Input 
                                placeholder="Tìm kiếm tòa nhà..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-9 bg-background border-border text-xs rounded-md"
                            />
                        </div>

                        <Button 
                            onClick={() => setSelectedBuildingId('new')}
                            variant={selectedBuildingId === 'new' ? "default" : "outline"}
                            className={`w-full h-9 justify-start gap-2 rounded-md font-black text-[10px] uppercase tracking-widest ${selectedBuildingId === 'new' ? 'bg-primary shadow-lg shadow-primary/20' : 'bg-background'}`}
                        >
                            <span className="material-symbols-outlined text-lg">add</span>
                            Thêm Tòa nhà
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        <div className="px-3 py-2">
                            <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">Danh mục tòa nhà ({filteredBuildings.length})</span>
                        </div>
                        
                        {filteredBuildings.map(b => (
                            <button
                                key={b.id}
                                onClick={() => setSelectedBuildingId(b.id)}
                                className={`group w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                                    selectedBuildingId === b.id 
                                        ? 'bg-primary/5 border border-primary/20 shadow-sm' 
                                        : 'hover:bg-muted/50 border border-transparent'
                                }`}
                            >
                                <div className={`size-10 rounded-md flex items-center justify-center shrink-0 transition-all ${
                                    selectedBuildingId === b.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                                }`}>
                                    <span className="material-symbols-outlined text-xl">corporate_fare</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`text-[13px] font-black truncate leading-tight ${selectedBuildingId === b.id ? 'text-primary' : 'text-foreground/80'}`}>
                                        {b.name}
                                    </div>
                                    <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight opacity-50">
                                        Identifier: #{b.id}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* MAIN CONTENT - Detailed Floor View */}
                <div className="flex-1 flex flex-col overflow-hidden bg-background">
                    {selectedBuildingId === 'new' ? (
                        <div className="flex-1 flex items-center justify-center p-8 bg-muted/5">
                            <Card className="w-full max-w-md p-8 rounded-xl border-border/60 shadow-xl bg-card">
                                <div className="text-center mb-8">
                                    <div className="size-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg shadow-primary/20">
                                        <span className="material-symbols-outlined text-3xl font-black">add</span>
                                    </div>
                                    <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Tạo Tòa nhà Mới</h3>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1 opacity-60">Khởi tạo không gian bản đồ thực tế</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tên định danh *</Label>
                                        <Input 
                                            placeholder="VD: Tòa nhà B, Khu C..."
                                            value={newBuildingName}
                                            onChange={e => setNewBuildingName(e.target.value)}
                                            className="h-10 rounded-md bg-background border-border font-bold px-4 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Đặc điểm nhận diện</Label>
                                        
                                        {(() => {
                                            const structured = parseDescription(newBuildingDescription);
                                            const count = Object.values(structured).filter(v => !!v).length;
                                            
                                            return (
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button 
                                                            variant="outline" 
                                                            className="w-full h-10 justify-between bg-background border-dashed border-border/60 hover:border-primary/50 group"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-lg opacity-50 group-hover:text-primary transition-colors">visibility</span>
                                                                <span className="text-xs font-bold">Cấu hình nhận diện</span>
                                                            </div>
                                                            {count > 0 && (
                                                                <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-black bg-primary/10 text-primary border-none">
                                                                    {count} Dấu hiệu
                                                                </Badge>
                                                            )}
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-primary">visibility</span>
                                                                Đặc điểm nhận diện tòa nhà
                                                            </DialogTitle>
                                                        </DialogHeader>
                                                        
                                                        <div className="space-y-4 py-4">
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Vật thể nổi bật</Label>
                                                                <Input 
                                                                    value={structured.landmarks || ''}
                                                                    onChange={e => {
                                                                        const newData = { ...structured, landmarks: e.target.value };
                                                                        setNewBuildingDescription(JSON.stringify(newData));
                                                                    }}
                                                                    placeholder="VD: Mái vòm xanh, Cổng đá, Sảnh kính..."
                                                                    className="h-10 text-sm"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Màu sắc đặc trưng</Label>
                                                                <Input 
                                                                    value={structured.colors || ''}
                                                                    onChange={e => {
                                                                        const newData = { ...structured, colors: e.target.value };
                                                                        setNewBuildingDescription(JSON.stringify(newData));
                                                                    }}
                                                                    placeholder="VD: Sơn trắng vàng, Viền xanh dương..."
                                                                    className="h-10 text-sm"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Vị trí tương quan</Label>
                                                                <Input 
                                                                    value={structured.proximity || ''}
                                                                    onChange={e => {
                                                                        const newData = { ...structured, proximity: e.target.value };
                                                                        setNewBuildingDescription(JSON.stringify(newData));
                                                                    }}
                                                                    placeholder="VD: Cạnh hồ nước, Đối diện sân vận động..."
                                                                    className="h-10 text-sm"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Biển báo lớn</Label>
                                                                <Input 
                                                                    value={structured.signs || ''}
                                                                    onChange={e => {
                                                                        const newData = { ...structured, signs: e.target.value };
                                                                        setNewBuildingDescription(JSON.stringify(newData));
                                                                    }}
                                                                    placeholder="VD: Logo trường, Biển tên tòa nhà..."
                                                                    className="h-10 text-sm"
                                                                />
                                                            </div>
                                                        </div>
                                                        
                                                        <DialogFooter>
                                                            <DialogClose asChild>
                                                                <Button className="font-black text-[10px] uppercase tracking-widest h-10 px-6">
                                                                    Hoàn tất
                                                                </Button>
                                                            </DialogClose>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                            );
                                        })()}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Hình ảnh tòa nhà</Label>
                                        <div className="flex gap-2">
                                            <Input 
                                                disabled={true}
                                                placeholder="Đường dẫn ảnh thực tế..."
                                                value={newBuildingImageUrl}
                                                className="h-10 rounded-md bg-background border-border font-mono text-[11px] px-4"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => buildingImageInputRef.current?.click()}
                                                className="h-10 px-4 shrink-0 rounded-md"
                                            >
                                                <span className="material-symbols-outlined">upload</span>
                                            </Button>
                                        </div>
                                    </div>

                                    <Button 
                                        onClick={handleCreateBuilding}
                                        disabled={isLoading || !newBuildingName}
                                        className="w-full h-11 rounded-md bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-[0.2em] mt-2 shadow-lg shadow-primary/20"
                                    >
                                        {isLoading ? <span className="material-symbols-outlined animate-spin">sync</span> : "Xác nhận Khởi tạo"}
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    ) : selectedBuilding ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Building Header */}
                            <div className="p-8 border-b border-border/40 bg-muted/5 shrink-0">
                                <div className="flex items-center justify-between gap-8">
                                    <div className="flex items-center gap-6">
                                        <div 
                                            className="size-20 rounded-xl overflow-hidden border-2 border-white shadow-xl relative bg-muted shrink-0 group/img cursor-pointer"
                                            onClick={() => buildingImageInputRef.current?.click()}
                                        >
                                            {selectedBuilding.real_image_url ? (
                                                <Image 
                                                    src={getFullImageUrl(selectedBuilding.real_image_url)} 
                                                    alt={selectedBuilding.name}
                                                    fill
                                                    className="object-cover group-hover/img:scale-110 transition-transform"
                                                    unoptimized
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                                                    <span className="material-symbols-outlined text-3xl">corporate_fare</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="material-symbols-outlined text-white text-xl">upload</span>
                                            </div>
                                        </div>
 
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3">
                                                <Badge className="bg-primary text-white border-none text-[9px] font-black uppercase h-4 px-2 tracking-widest">ID: #{selectedBuilding.id}</Badge>
                                            </div>
                                            <h2 className="text-3xl font-black text-foreground tracking-tight leading-none uppercase">{selectedBuilding.name}</h2>
                                            <div className="flex items-center gap-2">
                                                <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">
                                                    {(() => {
                                                        const structured = parseDescription(selectedBuilding.description || '');
                                                        if (!selectedBuilding.description) return 'Hệ thống bản đồ kỹ thuật số cho tòa nhà.';
                                                        return (
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {structured.landmarks && <Badge variant="outline" className="text-[9px]">{structured.landmarks}</Badge>}
                                                                {structured.proximity && <span className="normal-case opacity-70"> • {structured.proximity}</span>}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground hover:text-primary">
                                                            <span className="material-symbols-outlined text-sm">edit</span>
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-primary">visibility</span>
                                                                Sửa đặc điểm nhận diện: {selectedBuilding.name}
                                                            </DialogTitle>
                                                        </DialogHeader>
                                                        
                                                        {(() => {
                                                            const structured = parseDescription(selectedBuilding.description || '');
                                                            const updateField = async (field: keyof StructuredDescription, val: string) => {
                                                                const newData = { ...structured, [field]: val };
                                                                await buildingApi.update(selectedBuilding.id, { 
                                                                    description: JSON.stringify(newData) 
                                                                });
                                                                fetchBuildings();
                                                            };

                                                            return (
                                                                <div className="space-y-4 py-4">
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Vật thể nổi bật</Label>
                                                                        <Input 
                                                                            defaultValue={structured.landmarks || ''}
                                                                            onBlur={e => updateField('landmarks', e.target.value)}
                                                                            placeholder="VD: Mái vòm xanh, Cổng đá..."
                                                                            className="h-10 text-sm"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Màu sắc đặc trưng</Label>
                                                                        <Input 
                                                                            defaultValue={structured.colors || ''}
                                                                            onBlur={e => updateField('colors', e.target.value)}
                                                                            placeholder="VD: Sơn trắng vàng..."
                                                                            className="h-10 text-sm"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Vị trí tương quan</Label>
                                                                        <Input 
                                                                            defaultValue={structured.proximity || ''}
                                                                            onBlur={e => updateField('proximity', e.target.value)}
                                                                            placeholder="VD: Cạnh hồ nước..."
                                                                            className="h-10 text-sm"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Biển báo lớn</Label>
                                                                        <Input 
                                                                            defaultValue={structured.signs || ''}
                                                                            onBlur={e => updateField('signs', e.target.value)}
                                                                            placeholder="VD: Logo trường..."
                                                                            className="h-10 text-sm"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                        
                                                        <DialogFooter>
                                                            <DialogClose asChild>
                                                                <Button className="font-black text-[10px] uppercase tracking-widest h-10 px-6">
                                                                    Xong
                                                                </Button>
                                                            </DialogClose>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 shrink-0">
                                        <Button 
                                            onClick={() => {
                                                const nextLevel = floors.length > 0 ? (floors[floors.length - 1].floor_level || 0) + 1 : 1;
                                                setUploadingLevel(nextLevel);
                                                fileInputRef.current?.click();
                                            }}
                                            disabled={isUploading}
                                            className="h-10 px-5 gap-2 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] rounded-md shadow-lg shadow-primary/20"
                                        >
                                            {isUploading ? <span className="material-symbols-outlined animate-spin text-base">sync</span> : <span className="material-symbols-outlined text-base">upload_file</span>}
                                            Thiết lập Tầng mới
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            onClick={handleDeleteBuilding}
                                            disabled={isLoading}
                                            className="h-8 rounded-md text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                        >
                                            {isLoading ? <span className="material-symbols-outlined animate-spin text-sm mr-2">sync</span> : <span className="material-symbols-outlined text-sm mr-2">delete</span>}
                                            Xóa Tòa nhà
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* VERTICAL FLOOR LIST */}
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                <div className="space-y-4 max-w-4xl mx-auto">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Danh sách sơ đồ tầng ({floors.length})</h4>
                                    </div>

                                    {floors.length === 0 ? (
                                        <div className="py-20 flex flex-col items-center justify-center bg-muted/5 border-2 border-dashed border-border/40 rounded-xl opacity-50">
                                            <span className="material-symbols-outlined text-4xl text-muted-foreground/20 mb-3">layers_clear</span>
                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Chưa có dữ liệu sơ đồ cho tòa nhà này</p>
                                        </div>
                                    ) : (
                                        floors.map((floor) => (
                                            <div key={floor.id} className="group flex bg-white border border-border/40 rounded-xl overflow-hidden hover:border-primary/30 transition-all">
                                                <div className="w-[140px] p-4 flex flex-col items-center justify-center border-r border-border/20 bg-muted/5 shrink-0">
                                                    <div className="size-16 bg-primary text-white rounded-lg flex flex-col items-center justify-center shadow-md">
                                                        <span className="text-[8px] font-black uppercase opacity-60 tracking-widest">Tầng</span>
                                                        <span className="text-2xl font-black leading-none">{floor.floor_level}</span>
                                                    </div>
                                                    <div className="mt-3 text-[9px] font-mono font-black text-muted-foreground/60">ID: {floor.id}</div>
                                                </div>
                                                
                                                <div className="flex-1 p-6 flex flex-col justify-center">
                                                    <div className="flex items-start justify-between mb-4">
                                                        <div>
                                                            <h5 className="text-lg font-black text-foreground uppercase tracking-tight mb-1">{floor.name}</h5>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-100">
                                                                    <div className="size-1 rounded-full bg-green-500 animate-pulse" />
                                                                    <span className="text-[8px] font-black uppercase tracking-widest">Đang hoạt động</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground opacity-60">
                                                                    <span className="material-symbols-outlined text-xs">straighten</span>
                                                                    <span>{floor.scale_ratio} m/px</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button variant="outline" className="h-8 px-3 rounded-md font-black text-[9px] uppercase tracking-widest border-border/60">Cấu hình</Button>
                                                            <Button 
                                                                variant="ghost" 
                                                                onClick={() => handleDeleteMap(floor.id)}
                                                                className="h-8 w-8 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 p-0"
                                                            >
                                                                <span className="material-symbols-outlined text-lg">delete</span>
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="relative aspect-[21/7] w-full rounded-lg overflow-hidden bg-muted border border-border/20">
                                                        <Image 
                                                            src={getFullImageUrl(floor.image_url)} 
                                                            alt={`Map Tầng ${floor.floor_level}`} 
                                                            fill
                                                            className="object-cover opacity-80 hover:opacity-100 transition-opacity"
                                                            unoptimized
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-muted/5">
                            <div className="size-24 bg-muted/40 rounded-2xl flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-5xl text-muted-foreground/20">architecture</span>
                            </div>
                            <h4 className="text-xl font-black text-foreground/40 mb-1 uppercase tracking-[0.2em]">Quản lý Hạ tầng</h4>
                            <p className="text-[10px] text-muted-foreground/50 max-w-xs font-bold uppercase tracking-widest">
                                Chọn một tòa nhà từ danh sách bên trái để quản lý sơ đồ không gian.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleUploadFloor} accept="image/*" />
            <input type="file" ref={buildingImageInputRef} className="hidden" onChange={handleUploadBuildingImage} accept="image/*" />
        </CustomModal>
    );
};
