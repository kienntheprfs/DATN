'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { getFullImageUrl } from '@/services/wayfinding-client';
import { MapData, MapNode, NodeFormData, EdgeFormData, Building } from '@/types';
import { editorApi } from '@/services/editor-api';
import { mapApi } from '@/services/maps-api';
import { useConfirmStore } from '@/stores/confirm.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BuildingModal } from './BuildingModal';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';

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

interface EditorInspectorProps {
  currentMap: MapData | null;
  nodes: MapNode[];
  edges: EdgeFormData[];
  selectedId: number | null;
  selectedType: 'node' | 'edge' | null;
  isEditing: boolean;
  onSelect: (type: 'node' | 'edge' | null, id: number | null) => void;
  onNodeUpdate: (id: number, data: Partial<MapNode>) => void;
  onNodeDelete: (id: number) => void;
  onEdgeDelete: (id: number) => void;
  onSetEditing: (editing: boolean) => void;
  onRefreshNodes: () => void;
  onRefreshEdges: () => void;
  buildings: Building[];
  onRefreshBuildings?: () => void;
  buildingNodes?: MapNode[];
  buildingMaps?: MapData[];
  hasUnsavedChanges?: boolean;
  onUnsavedEditsChange?: (hasEdits: boolean) => void;
}

export function EditorInspector({
  currentMap,
  nodes,
  edges,
  selectedId,
  selectedType,
  isEditing,
  onSelect,
  onNodeUpdate,
  onNodeDelete,
  onEdgeDelete,
  onSetEditing,
  onRefreshNodes,
  onRefreshEdges,
  buildings,
  onRefreshBuildings,
  buildingNodes: propBuildingNodes = [],
  buildingMaps = [],
  hasUnsavedChanges: parentHasChanges = false,
  onUnsavedEditsChange,
}: EditorInspectorProps) {
  const confirm = useConfirmStore((state) => state.confirm);
  const [editedData, setEditedData] = useState<NodeFormData | EdgeFormData | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const buildingNodes = propBuildingNodes;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rawData = useMemo(() => {
    if (selectedType === 'node') {
      return nodes.find((n) => n.id === selectedId) ?? null;
    }
    if (selectedType === 'edge') {
      return edges.find((e) => e.id === selectedId) ?? null;
    }
    return null;
  }, [selectedType, selectedId, nodes, edges]);

  const formData = useMemo(() => {
    if (editedData) {
      return editedData;
    }
    if (selectedType === 'node' && rawData) {
      const nodeData = rawData as MapNode;
      return {
        ...nodeData,
        aliases: (nodeData.aliases || []).map(a => typeof a === 'string' ? { name: a } : a),
        linked_node_ids: nodeData.linked_node_ids || [],
      } as NodeFormData;
    }
    if (selectedType === 'edge' && rawData) {
      return rawData as EdgeFormData;
    }
    return null;
  }, [rawData, selectedType, editedData]);

  useEffect(() => {
    // We don't automatically clear editedData here anymore to allow confirmation logic
    // unless the item actually changed and we have no edits
    if (!editedData) {
      setAliasInput('');
    }
  }, [selectedId, selectedType]);

  const handleSelectRequest = async (type: 'node' | 'edge' | null, id: number | null) => {
    if (editedData) {
      const confirmed = await confirm({
        title: "Thay đổi chưa lưu",
        description: "Bạn đang chỉnh sửa thông tin nhưng chưa lưu. Chuyển sang đối tượng khác sẽ mất các thay đổi này?",
        variant: 'destructive',
        style: 'square'
      });
      if (!confirmed) return;
    }
    setEditedData(null);
    onSelect(type, id);
  };




  const handleChange = (field: string, value: unknown) => {
    const currentData = formData;
    if (!currentData) return;
    const updated = { ...currentData, [field]: value };
    setEditedData(updated as NodeFormData | EdgeFormData);
    onUnsavedEditsChange?.(true);
  };

  const handleSave = async () => {
    if (!formData || selectedId === null) return;

    try {
      if (selectedType === 'node') {
        const nodeData = formData as NodeFormData;
        const aliases = nodeData.aliases?.map((a) => (typeof a === 'string' ? a : a.name)) || [];
        await editorApi.updateNode(selectedId, {
          name: nodeData.name,
          type: nodeData.type,
          aliases,
          linked_node_ids: nodeData.linked_node_ids,
          building_id: nodeData.building_id,
          description: nodeData.description,
          real_image_url: nodeData.real_image_url,
        });
        onNodeUpdate(selectedId, { ...nodeData, aliases });
      } else if (selectedType === 'edge') {
        const edgeData = formData as EdgeFormData;
        await editorApi.updateEdge(selectedId, {
          weight: edgeData.weight,
          type: edgeData.type,
          bidirectional: edgeData.bidirectional,
        });
      }
      setEditedData(null);
      onUnsavedEditsChange?.(false);
      onSetEditing(false);
      onRefreshNodes();
      onRefreshEdges();
      toast.success('Lưu thành công!');
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Lỗi khi lưu!', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      });
    }
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    
    const confirmed = await confirm({
      title: "Xác nhận xóa đối tượng",
      description: "Bạn có chắc chắn muốn xóa đối tượng này?",
      variant: 'destructive'
    });

    if (!confirmed) return;

    try {
      if (selectedType === 'node') {
        await editorApi.deleteNode(selectedId);
        onNodeDelete(selectedId);
        toast.success('Đã xóa node!');
      } else if (selectedType === 'edge') {
        await editorApi.deleteEdge(selectedId);
        onEdgeDelete(selectedId);
        toast.success('Đã xóa edge!');
      }
      setEditedData(null);
      onSelect(null, null);
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Lỗi khi xóa!', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      });
    }
  };

  const handleAddAlias = () => {
    if (!aliasInput.trim()) return;
    const currentData = formData as NodeFormData | null;
    if (!currentData) return;
    const newAlias = aliasInput.trim();
    setEditedData({ ...currentData, aliases: [...(currentData.aliases || []), { name: newAlias }] });
    setAliasInput('');
  };

  const handleRemoveAlias = async (index: number) => {
    const confirmed = await confirm({
      title: "Xóa tên gọi",
      description: "Bạn có chắc muốn xóa tên gọi này?",
      variant: 'destructive'
    });

    if (!confirmed) return;
    const currentData = formData as NodeFormData | null;
    if (!currentData) return;
    setEditedData({ ...currentData, aliases: currentData.aliases?.filter((_, i) => i !== index) });
  };

  const handleLinkedNodeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value) {
      const currentData = formData as NodeFormData;
      const current = currentData.linked_node_ids || [];
      if (!current.includes(parseInt(value))) {
        handleChange('linked_node_ids', [...current, parseInt(value)]);
      }
    }
  };

  const handleRemoveLinkedNode = async (nodeId: number) => {
    const confirmed = await confirm({
      title: "Xóa liên kết",
      description: "Bạn có chắc muốn xóa liên kết này?",
      variant: 'destructive'
    });

    if (!confirmed) return;
    const currentData = formData as NodeFormData;
    handleChange('linked_node_ids', (currentData.linked_node_ids || []).filter((id: number) => id !== nodeId));
  };

  if (!currentMap) {
    return <aside className="w-[400px] bg-background border-l border-border shrink-0 overflow-x-hidden" />;
  }

  if (selectedId === null || !formData) {
    return (
      <aside className="w-[400px] bg-background border-l border-border flex flex-col shrink-0 overflow-x-hidden">
        <div className="h-32 bg-muted relative overflow-hidden shrink-0">
          <img
            src={getFullImageUrl(currentMap.image_url)}
            className="w-full h-full object-cover opacity-40 grayscale"
            alt={`Bản đồ ${currentMap.name}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute bottom-3 left-4">
            <span className="bg-primary/10 text-primary text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-primary/20">
              Bản đồ hiện tại
            </span>
            <h2 className="text-sm font-black mt-1 text-foreground/80 uppercase tracking-tight">{currentMap.name}</h2>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-2xl opacity-20">touch_app</span>
          </div>
          <p className="text-xs font-medium leading-relaxed">Chọn một đối tượng trên bản đồ để xem và chỉnh sửa thuộc tính</p>
        </div>
      </aside>
    );
  }

  const isNode = selectedType === 'node';
  const nodeData = formData as NodeFormData;
  const displayName = isNode && 'name' in formData ? (formData as NodeFormData).name : (formData as EdgeFormData).type;
  const hasBuilding = !!nodeData?.building_id;
  const currentBuilding = hasBuilding ? buildings.find(b => b.id === nodeData.building_id) : undefined;

  return (
    <>
      <aside className="w-[400px] bg-background border-l border-border flex flex-col shrink-0 overflow-x-hidden">
        <InspectorHeader
          id={formData.id}
          name={displayName}
          isEditing={isEditing}
          isNode={isNode}
          onToggleEdit={() => (isEditing ? handleSave() : onSetEditing(true))}
          onNameChange={(name) => handleChange('name', name)}
        />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedType === 'node' && (
            <NodeForm
              data={nodeData}
              isEditing={isEditing}
              selectedId={selectedId}
              onNodeUpdate={onNodeUpdate}
              onChange={handleChange}
              aliasInput={aliasInput}
              onAliasInputChange={setAliasInput}
              onAddAlias={handleAddAlias}
              onRemoveAlias={handleRemoveAlias}
              onManageBuilding={() => setShowBuildingModal(true)}
              buildings={buildings}
              currentBuilding={currentBuilding}
              hasBuilding={hasBuilding}
              buildingMaps={buildingMaps}
              buildingNodes={buildingNodes}
              onLinkedNodeSelect={handleLinkedNodeSelect}
              onRemoveLinkedNode={handleRemoveLinkedNode}
              fileInputRef={fileInputRef}
            />
          )}

          {selectedType === 'edge' && (
            <EdgeForm data={formData as EdgeFormData} isEditing={isEditing} onChange={handleChange} />
          )}
        </div>

        <InspectorFooter
          isEditing={isEditing}
          onSave={handleSave}
          onCancel={() => { setEditedData(null); onSetEditing(false); }}
          onDelete={handleDelete}
        />
      </aside>

      {showBuildingModal && isNode && (
        <BuildingModal
          initialBuildingId={nodeData.building_id}
          onClose={() => setShowBuildingModal(false)}
          onSuccess={() => {
            editorApi.getNodeById(selectedId!).then((updatedNode) => {
              onNodeUpdate(selectedId!, updatedNode);
              setEditedData({
                ...updatedNode,
                aliases: (updatedNode.aliases || []).map(a => typeof a === 'string' ? { name: a } : a),
                linked_node_ids: updatedNode.linked_node_ids || [],
              } as NodeFormData);
            });
            onRefreshBuildings?.();
            setShowBuildingModal(false);
          }}
        />
      )}
    </>
  );
}

function InspectorHeader({
  id,
  name,
  isEditing,
  isNode,
  onToggleEdit,
  onNameChange,
}: {
  id: number;
  name: string;
  isEditing: boolean;
  isNode: boolean;
  onToggleEdit: () => void;
  onNameChange: (name: string) => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-border bg-muted/20 flex justify-between items-start shrink-0">
      <div className="flex-1 mr-2 min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
              isNode ? 'bg-primary/5 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'
            }`}
          >
            {isNode ? 'Điểm' : 'Đường nối'}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">#{id}</span>
        </div>
        {isEditing && isNode ? (
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus
            placeholder="Tên địa điểm..."
            className="h-8 text-sm font-bold bg-background border-primary/30"
          />
        ) : (
          <h2 className="text-sm font-black truncate text-foreground/80 uppercase tracking-tight leading-none">{name}</h2>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 rounded-md transition-all ${isEditing ? 'bg-primary text-white hover:bg-primary/90 shadow-sm' : 'text-muted-foreground hover:text-primary hover:bg-primary/5'}`}
        onClick={onToggleEdit}
      >
        <span className="material-symbols-outlined text-lg">{isEditing ? 'check' : 'edit'}</span>
      </Button>
    </div>
  );
}

function NodeForm({
  data,
  isEditing,
  selectedId,
  onNodeUpdate,
  onChange,
  aliasInput,
  onAliasInputChange,
  onAddAlias,
  onRemoveAlias,
  onManageBuilding,
  buildings,
  currentBuilding,
  hasBuilding,
  buildingMaps,
  buildingNodes,
  onLinkedNodeSelect,
  onRemoveLinkedNode,
  fileInputRef,
}: {
  data: NodeFormData;
  isEditing: boolean;
  selectedId: number | null;
  onNodeUpdate: (id: number, data: Partial<MapNode>) => void;
  onChange: (field: string, value: unknown) => void;
  aliasInput: string;
  onAliasInputChange: (value: string) => void;
  onAddAlias: () => void;
  onRemoveAlias: (index: number) => void;
  onManageBuilding: () => void;
  buildings: Building[];
  currentBuilding?: Building;
  hasBuilding: boolean;
  buildingMaps: MapData[];
  buildingNodes: MapNode[];
  onLinkedNodeSelect: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onRemoveLinkedNode: (nodeId: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const linkedNodeOptions = buildingNodes.filter(
    (n) => n.id !== data.id && n.map_id !== data.map_id && !(data.linked_node_ids || []).includes(n.id)
  );

  return (
    <>
      <div className="space-y-4">
        <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Vị trí tương đối</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground/60 font-medium uppercase">Tọa độ X</span>
              <div className="font-mono font-black text-xs text-primary">{Math.round(data.x)} <span className="text-[9px] font-normal opacity-40 italic">px</span></div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground/60 font-medium uppercase">Tọa độ Y</span>
              <div className="font-mono font-black text-xs text-primary">{Math.round(data.y)} <span className="text-[9px] font-normal opacity-40 italic">px</span></div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Loại thực thể</Label>
            <Select
              disabled={!isEditing}
              value={data.type}
              onValueChange={(value) => onChange('type', value)}
            >
              <SelectTrigger className="h-9 bg-background border-border text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="path">Điểm trung gian</SelectItem>
                <SelectItem value="room">Phòng chức năng</SelectItem>
                <SelectItem value="stairs">Cầu thang bộ</SelectItem>
                <SelectItem value="elevator">Thang máy</SelectItem>
                <SelectItem value="entrance">Cổng ra vào / Sảnh</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Dấu hiệu nhận diện</Label>
            
            {(() => {
              const structured = parseDescription(data.description || '');
              const count = Object.values(structured).filter(v => !!v).length;
              
              return (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={`w-full h-9 justify-between border-dashed hover:border-primary/50 group px-3 ${
                        !isEditing ? 'bg-muted/10 border-border/40' : 'bg-muted/20 border-border/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-base opacity-50 group-hover:text-primary transition-colors ${
                          !isEditing ? 'text-muted-foreground' : 'text-primary'
                        }`}>
                          {isEditing ? 'settings' : 'visibility'}
                        </span>
                        <span className="text-xs font-bold truncate">
                          {isEditing ? 'Cấu hình nhận diện' : 'Xem dấu hiệu'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isEditing && (
                          <Badge variant="outline" className="h-4 px-1 text-[7px] font-black uppercase tracking-tighter opacity-50">
                            Xem
                          </Badge>
                        )}
                        {count > 0 && (
                          <Badge variant="secondary" className="h-4 px-1 text-[8px] font-black bg-primary/10 text-primary border-none">
                            {count}
                          </Badge>
                        )}
                      </div>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">visibility</span>
                        Dấu hiệu nhận diện thực tế
                      </DialogTitle>
                    </DialogHeader>
                    
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Vật thể nổi bật</Label>
                        <Input 
                          disabled={!isEditing}
                          value={structured.landmarks || ''}
                          onChange={(e) => {
                            const newData = { ...structured, landmarks: e.target.value };
                            onChange('description', JSON.stringify(newData));
                          }}
                          placeholder={isEditing ? "VD: Chậu cây to, Máy bán hàng..." : "Trống"}
                          className="h-8 text-xs disabled:opacity-70 disabled:cursor-not-allowed"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Màu sắc / Ánh sáng</Label>
                        <Input 
                          disabled={!isEditing}
                          value={structured.colors || ''}
                          onChange={(e) => {
                            const newData = { ...structured, colors: e.target.value };
                            onChange('description', JSON.stringify(newData));
                          }}
                          placeholder={isEditing ? "VD: Tường vàng..." : "Trống"}
                          className="h-8 text-xs disabled:opacity-70 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Biển báo / Số hiệu</Label>
                        <Input 
                          disabled={!isEditing}
                          value={structured.signs || ''}
                          onChange={(e) => {
                            const newData = { ...structured, signs: e.target.value };
                            onChange('description', JSON.stringify(newData));
                          }}
                          placeholder={isEditing ? "VD: Phòng 102..." : "Trống"}
                          className="h-8 text-xs disabled:opacity-70 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="col-span-2 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Vị trí tương quan</Label>
                        <Input 
                          disabled={!isEditing}
                          value={structured.proximity || ''}
                          onChange={(e) => {
                            const newData = { ...structured, proximity: e.target.value };
                            onChange('description', JSON.stringify(newData));
                          }}
                          placeholder={isEditing ? "VD: Đối diện thang máy..." : "Trống"}
                          className="h-8 text-xs disabled:opacity-70 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="col-span-2 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Mô tả khác</Label>
                        <textarea 
                          disabled={!isEditing}
                          value={structured.notes || ''}
                          onChange={(e) => {
                            const newData = { ...structured, notes: e.target.value };
                            onChange('description', JSON.stringify(newData));
                          }}
                          placeholder={isEditing ? "Các đặc điểm nhận diện khác..." : "Chưa có mô tả..."}
                          className="w-full min-h-[60px] p-2 text-xs bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-70 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button className="font-black text-[10px] uppercase tracking-widest h-9">
                          Đóng & Ghi nhớ
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            })()}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Tài nguyên hình ảnh</Label>
            <div className="flex gap-2 min-w-0">
              <Input 
                disabled={true}
                value={data.real_image_url || ''}
                placeholder="Chưa có hình ảnh..."
                className="h-9 text-[10px] font-mono bg-muted/20 border-border/50 min-w-0"
              />
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  const formData = new FormData();
                  formData.append('file', file);
                  
                  try {
                    toast.info("Đang tải ảnh lên...");
                    const { url } = await editorApi.uploadImage(formData);
                    onChange('real_image_url', url);
                    toast.success("Tải ảnh thành công!");
                  } catch (error) {
                    toast.error("Lỗi khi tải ảnh lên");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isEditing}
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3 shrink-0"
              >
                <span className="material-symbols-outlined text-base">upload</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tên gọi khác</h3>
          {(data.aliases?.length ?? 0) > 0 && (
            <Badge variant="secondary">{(data.aliases?.length || 0)} tên</Badge>
          )}
        </div>

        <div className="space-y-2 mb-2">
          {(data.aliases || []).map((alias, index) => (
            <div key={index} className="flex items-center gap-2 min-w-0">
              <div className="flex-1 px-2 py-1.5 bg-muted rounded text-sm truncate min-w-0">
                {typeof alias === 'string' ? alias : alias.name}
              </div>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemoveAlias(index)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>

        {isEditing && (
          <div className="flex gap-2">
            <Input
              value={aliasInput}
              onChange={(e) => onAliasInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAddAlias()}
              placeholder="Thêm tên..."
              className="flex-1 h-8 text-sm"
            />
            <Button size="sm" onClick={onAddAlias}>Thêm</Button>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">corporate_fare</span>
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Định danh Tòa nhà</h3>
          </div>
          {hasBuilding && <Badge variant="outline" className="h-4 border-primary/30 text-primary bg-primary/5 text-[8px] font-black uppercase tracking-tighter">Đã kết nối</Badge>}
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              disabled={!isEditing}
              value={data.building_id?.toString() || "none"}
              onValueChange={(val) => onChange('building_id', val === "none" ? null : parseInt(val))}
            >
              <SelectTrigger className="h-9 bg-background border-border text-xs">
                <SelectValue placeholder="Chọn tòa nhà..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Không liên kết tòa nhà --</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-background border-border hover:text-primary hover:border-primary transition-all"
            onClick={onManageBuilding}
          >
            <span className="material-symbols-outlined text-lg">edit_note</span>
          </Button>
        </div>
        
        {currentBuilding && (
          <div className="p-2 bg-primary/5 rounded border border-primary/10 flex items-center gap-2 min-w-0">
            <div className="w-1 h-3 bg-primary rounded-full" />
            <div className="text-[11px] font-bold text-primary truncate flex-1 min-w-0">{currentBuilding.name}</div>
          </div>
        )}
      </div>

      {buildingMaps.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {hasBuilding ? "Liên kết tầng" : "Liên kết bản đồ"}
              </h3>
              {(data.linked_node_ids?.length ?? 0) > 0 && (
                <Badge variant="secondary">{(data.linked_node_ids?.length || 0)} node</Badge>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground mb-2">
              Chọn node ở bản đồ khác để liên kết (Cầu thang/Thang máy/Lối vào)
            </p>

            <Select
              disabled={!isEditing}
              onValueChange={(value) => {
                if (value) onLinkedNodeSelect({ target: { value } } as React.ChangeEvent<HTMLSelectElement>);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="-- Chọn node liên kết --" />
              </SelectTrigger>
              <SelectContent>
                {linkedNodeOptions.map((n) => {
                  const map = buildingMaps.find((m) => m.id === n.map_id);
                  const floorLabel = map?.floor_level !== undefined && map?.floor_level !== null ? `Tầng ${map.floor_level}` : "Campus";
                  return (
                    <SelectItem key={n.id} value={String(n.id)}>
                      {n.name} ({floorLabel})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {(data.linked_node_ids?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-1">
                {data.linked_node_ids?.map((nodeId: number) => {
                  const linkedNode = buildingNodes.find((n) => n.id === nodeId);
                  if (!linkedNode) return null;
                  const map = buildingMaps.find((m) => m.id === linkedNode.map_id);
                  const floorLabel = map?.floor_level !== undefined && map?.floor_level !== null ? `Tầng ${map.floor_level}` : "Campus";
                  return (
                    <div key={nodeId} className="flex items-center justify-between p-2 bg-muted rounded-lg min-w-0">
                      <span className="text-sm truncate min-w-0 flex-1">
                        {linkedNode.name} ({floorLabel})
                      </span>
                      {isEditing && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRemoveLinkedNode(nodeId)}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {data.type !== 'stairs' && data.type !== 'elevator' && data.type !== 'entrance' && (
              <p className="text-[10px] text-orange-500 mt-2 italic">
                Nên dùng node loại &quot;Cầu thang&quot; hoặc &quot;Thang máy&quot; để liên kết tầng
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

function EdgeForm({
  data,
  isEditing,
  onChange,
}: {
  data: EdgeFormData;
  isEditing: boolean;
  onChange: (field: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex flex-col gap-2">
        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Thông tin kết nối</h3>
        <div className="flex items-center gap-2 font-mono text-xs text-primary font-black">
          <span className="opacity-40">NODE</span> #{data.start_node_id}
          <span className="material-symbols-outlined text-sm opacity-40">trending_flat</span>
          <span className="opacity-40">NODE</span> #{data.end_node_id}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Trọng số (Weight)</Label>
          <Input
            type="number"
            disabled={!isEditing}
            value={data.weight || 0}
            onChange={(e) => onChange('weight', parseFloat(e.target.value))}
            className="h-9 font-mono text-xs bg-background border-border"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Loại đường đi</Label>
          <Select
            disabled={!isEditing}
            value={data.type}
            onValueChange={(value) => onChange('type', value)}
          >
            <SelectTrigger className="h-9 bg-background border-border text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="walk">Đi bộ</SelectItem>
              <SelectItem value="stairs">Thang bộ</SelectItem>
              <SelectItem value="elevator">Thang máy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/5">
        <div className="space-y-0.5">
          <span className="text-xs font-bold text-foreground/80">Di chuyển 2 chiều</span>
          <p className="text-[10px] text-muted-foreground">Cho phép di chuyển ngược lại</p>
        </div>
        <input
          type="checkbox"
          disabled={!isEditing}
          checked={data.bidirectional ?? true}
          onChange={(e) => onChange('bidirectional', e.target.checked)}
          className="w-4 h-4 accent-primary rounded border-border"
        />
      </div>
    </div>
  );
}

function InspectorFooter({
  isEditing,
  onSave,
  onCancel,
  onDelete,
}: {
  isEditing: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <div className="p-4 border-t border-border bg-background grid grid-cols-2 gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onCancel} className="h-9 font-black text-[10px] uppercase tracking-widest">Hủy</Button>
        <Button onClick={onSave} size="sm" className="h-9 font-black text-[10px] uppercase tracking-widest bg-primary hover:bg-primary/90">Lưu thay đổi</Button>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-border bg-muted/10 shrink-0">
      <Button 
        variant="ghost" 
        onClick={onDelete} 
        className="w-full h-9 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-red-600 hover:bg-red-50"
      >
        <span className="material-symbols-outlined text-base mr-2">delete</span>
        Gỡ bỏ đối tượng
      </Button>
    </div>
  );
}
