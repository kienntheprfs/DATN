'use client';

import { useRef, useState, useEffect } from "react";
import { MapData, Building } from "@/types";
import { mapApi } from "@/services/maps-api";
import { editorApi } from "@/services/editor-api";
import { useEditorStore } from "@/stores/editor.store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface MapOverlayProps {
  onUploadSuccess: (mapData: MapData) => void;
}

export const MapOverlay = ({ onUploadSuccess }: MapOverlayProps) => {
  const { maps, setMaps } = useEditorStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMaps = async () => {
      if (maps.length > 0) {
        setLoading(false);
      }

      try {
        const data = await mapApi.getAll();
        setMaps(data);
        
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
  }, [onUploadSuccess, setMaps]);

  if (loading) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Đang đồng bộ dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-500">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden border-border/60 shadow-2xl flex flex-col">
        <CardHeader className="bg-muted/30 border-b border-border py-6 shrink-0">
          <div className="flex items-center gap-3 justify-center mb-1">
            <span className="material-symbols-outlined text-primary text-3xl">map</span>
            <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground/80">Hệ thống Quản lý Bản đồ</CardTitle>
          </div>
          <CardDescription className="text-center text-[11px] font-medium uppercase tracking-widest opacity-60">Chọn phiên bản hoặc thiết lập không gian làm việc mới</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-8 space-y-10">
          {maps.length > 0 && (
            <ExistingMapSection maps={maps} onSelect={onUploadSuccess} />
          )}

          <div className="relative flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 bg-background px-4">
              Khởi tạo không gian mới
            </span>
            <Separator className="flex-1" />
          </div>

          <UploadMapForm onSuccess={onUploadSuccess} />
        </CardContent>
      </Card>
    </div>
  );
};

const ExistingMapSection = ({ maps, onSelect }: { maps: MapData[]; onSelect: (m: MapData) => void }) => {
  const [selectedId, setSelectedId] = useState<string>("");

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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-xl">folder_open</span>
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Kho lưu trữ bản đồ</h3>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1.5">
          <Label className="text-[10px] font-bold uppercase opacity-50 ml-1">Danh sách bản đồ hiện có</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="h-11 bg-muted/20 border-border text-sm font-medium">
              <SelectValue placeholder="Chọn bản đồ..." />
            </SelectTrigger>
            <SelectContent>
              {maps.map((map) => (
                <SelectItem key={map.id} value={map.id.toString()} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{map.name}</span>
                    <Badge variant="outline" className="text-[9px] h-4 border-primary/20 text-primary/70 font-mono">
                      {map.building_id ? `B-${map.building_id}` : "CAMPUS"}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button 
          onClick={handleSelect} 
          disabled={!selectedId}
          className="h-11 px-6 bg-primary font-black uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20 hover:shadow-none transition-all"
        >
          Kích hoạt
        </Button>
      </div>
    </div>
  );
};

const UploadMapForm = ({ onSuccess }: { onSuccess: (m: MapData) => void }) => {
  const { maps: existingMaps, addMap } = useEditorStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [scale, setScale] = useState("1.0");
  const [floor, setFloor] = useState("");
  const [buildingId, setBuildingId] = useState<string>("");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        const data = await editorApi.getBuildings();
        setBuildings(data);
      } catch (err) {
        console.error("Lỗi load buildings", err);
      }
    };
    fetchBuildings();
  }, []);

  useEffect(() => {
    if (!buildingId) {
      setFloor("");
      if (!name || name.includes("Tầng")) setName("Bản đồ Campus");
      return;
    }

    const selectedBuilding = buildings.find(b => b.id === Number(buildingId));
    const mapsInBuilding = existingMaps.filter(m => m.building_id === Number(buildingId));

    const existingFloors = mapsInBuilding
      .map(m => m.floor_level || 0)
      .sort((a, b) => a - b);

    let suggestFloor = 1;
    for (const fl of existingFloors) {
      if (fl === suggestFloor) {
        suggestFloor++;
      } else if (fl > suggestFloor) {
        break;
      }
    }

    setFloor(suggestFloor.toString());

    if (selectedBuilding) {
      setName(`Tầng ${suggestFloor} - ${selectedBuilding.name}`);
    }
  }, [buildingId, existingMaps, buildings]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      if (!name) setName(file.name.split(".")[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!name.trim()) {
      setError("Vui lòng nhập tên bản đồ.");
      return;
    }

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
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-xl">cloud_upload</span>
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Tải lên tài nguyên mới</h3>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        className={`group relative h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
          previewUrl
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        {previewUrl ? (
          <>
            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain p-4 transition-transform group-hover:scale-105" />
            <div className="absolute inset-0 bg-primary/60 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2 bg-white text-primary px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-tighter shadow-xl">
                <span className="material-symbols-outlined text-sm">cached</span>
                Thay đổi tài nguyên
              </div>
            </div>
          </>
        ) : (
          <div className="text-center p-6 space-y-3">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <span className="material-symbols-outlined text-3xl text-muted-foreground group-hover:text-primary transition-colors">add_photo_alternate</span>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-tight text-foreground/70">Chọn tệp tin hình ảnh</p>
              <p className="text-[10px] text-muted-foreground/60 font-medium mt-1">Định dạng hỗ trợ: PNG, JPG, SVG (Tối đa 10MB)</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Định danh bản đồ *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Tầng 1 - Tòa A"
            className="h-10 bg-background border-border text-sm font-bold"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Thuộc Tòa nhà</Label>
          <Select value={buildingId} onValueChange={setBuildingId}>
            <SelectTrigger className="h-10 bg-background border-border text-xs font-bold">
              <SelectValue placeholder="-- Campus --" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs font-medium">-- Khu vực Campus --</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()} className="text-xs font-medium">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Tỉ lệ quy đổi (Scale)</Label>
          <div className="relative">
            <Input
              type="number"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              className="h-10 bg-background border-border text-xs font-mono font-bold pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground opacity-30">PX/M</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </div>
      )}

      <Button
        onClick={handleUpload}
        disabled={isProcessing || !selectedFile}
        className="w-full h-12 bg-primary font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 hover:shadow-none transition-all disabled:opacity-50"
      >
        {isProcessing ? (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
            Đang xử lý dữ liệu...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">publish</span>
            Xác nhận thiết lập
          </div>
        )}
      </Button>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileSelect}
      />
    </div>
  );
};
