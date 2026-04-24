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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { UploadIcon, FolderOpenIcon, Loader2Icon, ImageIcon } from "lucide-react";

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
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-muted/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <Loader2Icon className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold">Quản lý Bản đồ</CardTitle>
          <CardDescription>Chọn bản đồ có sẵn hoặc tải lên bản đồ mới</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {maps.length > 0 && (
            <ExistingMapSection maps={maps} onSelect={onUploadSuccess} />
          )}

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs font-medium text-muted-foreground">
              Hoặc tải mới
            </span>
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
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FolderOpenIcon className="w-4 h-4" />
        Mở bản đồ đã lưu
      </div>
      <div className="flex gap-3">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Chọn bản đồ..." />
          </SelectTrigger>
          <SelectContent>
            {maps.map((map) => (
              <SelectItem key={map.id} value={map.id.toString()}>
                {map.name} ({map.building_id ? `Tòa #${map.building_id}` : "Campus"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSelect} disabled={!selectedId}>
          Mở Map
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <UploadIcon className="w-4 h-4" />
        Tải lên bản đồ mới
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        className={`relative h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden ${
          previewUrl
            ? "border-primary bg-muted"
            : "border-muted-foreground/30 hover:border-primary hover:bg-muted/50"
        }`}
      >
        {previewUrl ? (
          <>
            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <span className="text-white font-medium text-sm">Bấm để đổi ảnh</span>
            </div>
          </>
        ) : (
          <div className="text-center p-4">
            <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">Chọn file ảnh bản đồ</p>
            <p className="text-xs text-muted-foreground/70 mt-1">(PNG, JPG, SVG)</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="map-name">Tên bản đồ *</Label>
        <Input
          id="map-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Tầng 1 - Tòa A"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tòa nhà</Label>
          <Select value={buildingId} onValueChange={setBuildingId}>
            <SelectTrigger>
              <SelectValue placeholder="-- Campus --" />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Tầng số (Auto)</Label>
          <Input value={floor} readOnly placeholder="-" className="bg-muted" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="scale">Tỉ lệ (Scale)</Label>
        <Input
          id="scale"
          type="number"
          step="0.1"
          value={scale}
          onChange={(e) => setScale(e.target.value)}
        />
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
          {error}
        </div>
      )}

      <Button
        onClick={handleUpload}
        disabled={isProcessing || !selectedFile}
        className="w-full"
      >
        {isProcessing ? (
          <>
            <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
            Đang tải lên...
          </>
        ) : (
          <>
            <UploadIcon className="w-4 h-4 mr-2" />
            Xác nhận tải lên
          </>
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
