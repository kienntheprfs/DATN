'use client';

import { useState, useMemo, useEffect } from 'react';
import { MapData, MapNode, NodeFormData, EdgeFormData, Building } from '@/types';
import { editorApi } from '@/services/editor-api';
import { mapApi } from '@/services/maps-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BuildingModal } from './BuildingModal';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface EditorInspectorProps {
  currentMap: MapData | null;
  nodes: MapNode[];
  selectedId: number | null;
  selectedType: 'node' | 'edge' | null;
  isEditing: boolean;
  onSelect: (type: 'node' | 'edge' | null, id: number | null) => void;
  onNodeUpdate: (id: number, data: Partial<MapNode>) => void;
  onNodeDelete: (id: number) => void;
  onEdgeDelete: (id: number) => void;
  onSetEditing: (editing: boolean) => void;
  onRefreshNodes: () => void;
  buildings: Building[];
  onRefreshBuildings?: () => void;
}

export function EditorInspector({
  currentMap,
  nodes,
  selectedId,
  selectedType,
  isEditing,
  onSelect,
  onNodeUpdate,
  onNodeDelete,
  onEdgeDelete,
  onSetEditing,
  onRefreshNodes,
  buildings,
  onRefreshBuildings,
}: EditorInspectorProps) {
  const [editedData, setEditedData] = useState<NodeFormData | EdgeFormData | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const [buildingMaps, setBuildingMaps] = useState<MapData[]>([]);
  const [buildingNodes, setBuildingNodes] = useState<MapNode[]>([]);

  const rawData = useMemo(() => {
    if (selectedType === 'node') {
      return nodes.find((n) => n.id === selectedId) ?? null;
    }
    return null;
  }, [selectedType, selectedId, nodes]);

  const formData = useMemo(() => {
    if (editedData) {
      return editedData;
    }
    if (selectedType === 'node' && rawData) {
      const nodeData = rawData as MapNode;
      return {
        ...nodeData,
        aliases: nodeData.aliases || [],
        linked_node_ids: nodeData.linked_node_ids || [],
      };
    }
    return null;
  }, [rawData, selectedType, editedData]);

  useEffect(() => {
    const nodeFormData = formData as NodeFormData | null;
    const buildingId = nodeFormData?.building_id;
    if (buildingId) {
      mapApi.getAll().then((maps) => {
        const bMaps = maps.filter((m) => m.building_id === buildingId);
        setBuildingMaps(bMaps);
        Promise.all(bMaps.map((m) => editorApi.getNodes(m.id))).then((nodeArrays) => {
          setBuildingNodes(nodeArrays.flat());
        });
      });
    } else {
      queueMicrotask(() => {
        setBuildingMaps([]);
        setBuildingNodes([]);
      });
    }
  }, [formData]);

  const handleChange = (field: string, value: unknown) => {
    const currentData = formData;
    if (!currentData) return;
    const updated = { ...currentData, [field]: value };
    setEditedData(updated as NodeFormData | EdgeFormData);
  };

  const handleSave = async () => {
    if (!formData || !selectedId) return;

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
        });
        onNodeUpdate(selectedId, { ...nodeData, aliases });
      }
      setEditedData(null);
      onSetEditing(false);
      onRefreshNodes();
      toast.success('Lưu thành công!');
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Lỗi khi lưu!', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('Bạn có chắc muốn xóa?')) return;

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

  const handleRemoveAlias = (index: number) => {
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

  const handleRemoveLinkedNode = (nodeId: number) => {
    const currentData = formData as NodeFormData;
    handleChange('linked_node_ids', (currentData.linked_node_ids || []).filter((id: number) => id !== nodeId));
  };

  if (!currentMap) {
    return <aside className="w-80 bg-background border-l border-border" />;
  }

  if (!formData || !selectedType) {
    return (
      <aside className="w-80 bg-background border-l border-border flex flex-col">
        <div className="h-40 bg-muted relative overflow-hidden">
          <img
            src={currentMap.image_url}
            className="w-full h-full object-cover opacity-50"
            alt={`Bản đồ ${currentMap.name}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute bottom-4 left-4">
            <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded uppercase">
              Current Map
            </span>
            <h2 className="text-lg font-bold mt-1">{currentMap.name}</h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-6 text-center">
          <p>Chọn một đối tượng để xem chi tiết</p>
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
      <aside className="w-80 bg-background border-l border-border flex flex-col">
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
          nodeId={selectedId ?? undefined}
          initialBuildingId={nodeData.building_id}
          onClose={() => setShowBuildingModal(false)}
          onSuccess={() => {
            editorApi.getNodeById(selectedId!).then((updatedNode) => {
              onNodeUpdate(selectedId!, updatedNode);
              setEditedData({
                ...updatedNode,
                aliases: (updatedNode.aliases || []) as string[],
                linked_node_ids: updatedNode.linked_node_ids || [],
              } as unknown as NodeFormData);
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
    <div className="px-4 py-3 border-b border-border bg-muted/50 flex justify-between items-start">
      <div className="flex-1 mr-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase mb-2 ${
            isNode ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
          }`}
        >
          {isNode ? 'Location' : 'Connection'} <span className="opacity-50">|</span> #{id}
        </span>
        {isEditing && isNode ? (
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus
            placeholder="Tên địa điểm..."
            className="font-bold"
          />
        ) : (
          <h2 className="text-lg font-bold truncate">{name}</h2>
        )}
      </div>
      <Button
        variant={isEditing ? 'default' : 'outline'}
        size="icon"
        onClick={onToggleEdit}
      >
        {isEditing ? '✓' : '✏️'}
      </Button>
    </div>
  );
}

function NodeForm({
  data,
  isEditing,
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
}: {
  data: NodeFormData;
  isEditing: boolean;
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
}) {
  const linkedNodeOptions = buildingNodes.filter(
    (n) => n.id !== data.id && n.map_id !== data.map_id && !(data.linked_node_ids || []).includes(n.id)
  );

  return (
    <>
      <div className="p-3 bg-muted rounded-lg">
        <h3 className="text-xs font-bold text-muted-foreground uppercase mb-2">Coordinates</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs text-muted-foreground">X</span>
            <div className="font-mono font-bold">{Math.round(data.x)}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Y</span>
            <div className="font-mono font-bold">{Math.round(data.y)}</div>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs font-bold uppercase mb-1 block">Loại địa điểm</Label>
        <Select
          disabled={!isEditing}
          value={data.type}
          onValueChange={(value) => onChange('type', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="path">Điểm trung gian</SelectItem>
            <SelectItem value="room">Phòng</SelectItem>
            <SelectItem value="stairs">Cầu thang</SelectItem>
            <SelectItem value="elevator">Thang máy</SelectItem>
            <SelectItem value="entrance">Cổng ra vào</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase">Tên gọi khác</h3>
          {(data.aliases?.length ?? 0) > 0 && (
            <Badge variant="secondary">{data.aliases?.length} tên</Badge>
          )}
        </div>

        <div className="space-y-2 mb-2">
          {(data.aliases || []).map((alias, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="flex-1 px-2 py-1.5 bg-muted rounded text-sm truncate">
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

      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase">Chi tiết tòa nhà</h3>
          {hasBuilding && <Badge variant="secondary">Đã thiết lập</Badge>}
        </div>

        {hasBuilding && currentBuilding ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground font-bold uppercase">Tòa nhà trực thuộc</div>
                <div className="text-sm font-bold truncate">{currentBuilding.name}</div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onManageBuilding}
            >
              Quản lý / Đổi tòa nhà
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full border-dashed h-auto py-4 flex-col gap-2"
            onClick={onManageBuilding}
          >
            <Building2 className="size-5" />
            <span className="font-bold">Thiết lập tòa nhà</span>
            <span className="text-xs font-normal text-muted-foreground">Thêm tầng & bản đồ chi tiết</span>
          </Button>
        )}
      </div>

      {hasBuilding && buildingMaps.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase">Liên kết tầng</h3>
              {(data.linked_node_ids?.length ?? 0) > 0 && (
                <Badge variant="secondary">{data.linked_node_ids?.length} node</Badge>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground mb-2">
              Chọn node cầu thang/thang máy ở tầng khác để liên kết
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
                {linkedNodeOptions.map((n) => (
                  <SelectItem key={n.id} value={String(n.id)}>
                    {n.name} (Tầng {buildingMaps.find((m) => m.id === n.map_id)?.floor_level || '?'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(data.linked_node_ids?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-1">
                {data.linked_node_ids?.map((nodeId: number) => {
                  const linkedNode = buildingNodes.find((n) => n.id === nodeId);
                  if (!linkedNode) return null;
                  return (
                    <div key={nodeId} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                      <span className="text-sm truncate">
                        {linkedNode.name} (Tầng {buildingMaps.find((m) => m.id === linkedNode.map_id)?.floor_level || '?'})
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
    <>
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <span className="text-xs text-muted-foreground">Kết nối</span>
        <span className="font-mono font-bold text-sm">
          #{data.start_node_id} → #{data.end_node_id}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-bold uppercase mb-1 block">Weight</Label>
          <Input
            type="number"
            disabled={!isEditing}
            value={data.weight || 0}
            onChange={(e) => onChange('weight', parseFloat(e.target.value))}
            className="font-mono"
          />
        </div>
        <div>
          <Label className="text-xs font-bold uppercase mb-1 block">Type</Label>
          <Select
            disabled={!isEditing}
            value={data.type}
            onValueChange={(value) => onChange('type', value)}
          >
            <SelectTrigger>
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

      <div className="flex items-center justify-between p-3 rounded-lg border">
        <span className="text-xs font-bold">Đường 2 chiều</span>
        <input
          type="checkbox"
          disabled={!isEditing}
          checked={data.bidirectional ?? true}
          onChange={(e) => onChange('bidirectional', e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
      </div>
    </>
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
      <div className="p-4 border-t border-border grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel}>Hủy</Button>
        <Button onClick={onSave}>Lưu</Button>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-border">
      <Button variant="destructive" onClick={onDelete} className="w-full">
        Xóa đối tượng
      </Button>
    </div>
  );
}
