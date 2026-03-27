'use client';

import { useState, useMemo } from 'react';
import { MapData, MapNode, NodeFormData, EdgeFormData } from '@/types';
import { editorApi } from '@/services/editor-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
}: EditorInspectorProps) {
  const [editedData, setEditedData] = useState<NodeFormData | EdgeFormData | null>(null);
  const [aliasInput, setAliasInput] = useState('');

  const rawData = useMemo(() => {
    if (selectedType === 'node') {
      return nodes.find((n) => n.id === selectedId) ?? null;
    }
    return null;
  }, [selectedType, selectedId, nodes]);

  const formData = useMemo(() => {
    if (!rawData) return editedData;
    if (selectedType === 'node') {
      const nodeData = rawData as MapNode;
      return {
        ...nodeData,
        aliases: nodeData.aliases || [],
        linked_node_ids: nodeData.linked_node_ids || [],
      };
    }
    return editedData;
  }, [rawData, selectedType, editedData]);

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
        });
        onNodeUpdate(selectedId, { ...nodeData, aliases });
      }
      setEditedData(null);
      onSetEditing(false);
      onRefreshNodes();
    } catch (error) {
      console.error('Error saving:', error);
      alert('Lỗi khi lưu!');
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('Bạn có chắc muốn xóa?')) return;

    try {
      if (selectedType === 'node') {
        await editorApi.deleteNode(selectedId);
        onNodeDelete(selectedId);
      } else if (selectedType === 'edge') {
        await editorApi.deleteEdge(selectedId);
        onEdgeDelete(selectedId);
      }
      setEditedData(null);
      onSelect(null, null);
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Lỗi khi xóa!');
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
            alt="Map"
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
  const displayName = isNode && 'name' in formData ? (formData as NodeFormData).name : (formData as EdgeFormData).type;

  return (
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
            data={formData as NodeFormData}
            isEditing={isEditing}
            onChange={handleChange}
            aliasInput={aliasInput}
            onAliasInputChange={setAliasInput}
            onAddAlias={handleAddAlias}
            onRemoveAlias={handleRemoveAlias}
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
}: {
  data: NodeFormData;
  isEditing: boolean;
  onChange: (field: string, value: unknown) => void;
  aliasInput: string;
  onAliasInputChange: (value: string) => void;
  onAddAlias: () => void;
  onRemoveAlias: (index: number) => void;
}) {
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
        <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Loại địa điểm</label>
        <select
          disabled={!isEditing}
          value={data.type}
          onChange={(e) => onChange('type', e.target.value)}
          className="w-full h-8 px-2 rounded-lg border bg-background text-sm disabled:opacity-50"
        >
          <option value="path">Điểm trung gian</option>
          <option value="room">Phòng</option>
          <option value="stairs">Cầu thang</option>
          <option value="elevator">Thang máy</option>
          <option value="entrance">Cổng ra vào</option>
        </select>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase">Tên gọi khác</h3>
          {(data.aliases?.length ?? 0) > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
              {data.aliases?.length}
            </span>
          )}
        </div>

        <div className="space-y-2 mb-2">
          {data.aliases?.map((alias, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="flex-1 px-2 py-1.5 bg-muted rounded text-sm">
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
          <label className="text-xs font-bold uppercase mb-1 block">Weight</label>
          <Input
            type="number"
            disabled={!isEditing}
            value={data.weight || 0}
            onChange={(e) => onChange('weight', parseFloat(e.target.value))}
            className="font-mono"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase mb-1 block">Type</label>
          <select
            disabled={!isEditing}
            value={data.type}
            onChange={(e) => onChange('type', e.target.value)}
            className="w-full h-8 px-2 rounded-lg border bg-background text-sm disabled:opacity-50"
          >
            <option value="walk">Đi bộ</option>
            <option value="stairs">Thang bộ</option>
            <option value="elevator">Thang máy</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border">
        <span className="text-xs font-bold">Đường 2 chiều</span>
        <input
          type="checkbox"
          disabled={!isEditing}
          checked={data.bidirectional ?? true}
          onChange={(e) => onChange('bidirectional', e.target.checked)}
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
        🗑️ Xóa đối tượng
      </Button>
    </div>
  );
}
