// src/features/editor/stores/editorStore.ts
import { create } from 'zustand';
import { MapNode, MapEdge, MapData } from '@/shared/types'; // Nhớ config alias @ hoặc chỉnh đường dẫn relative

export type ToolType = 'select' | 'add-node' | 'add-edge';
export type SelectionType = 'node' | 'edge' | null;

interface EditorState {
  // --- DATA ---
  maps: MapData[];
  currentMap: MapData | null;
  nodes: MapNode[];
  edges: MapEdge[];

  // --- UI STATE ---
  activeTool: ToolType;
  selectedId: number | null;
  selectedType: SelectionType;
  isEditing: boolean; // Chế độ sửa (cho phép kéo thả node)
  
  // --- ACTIONS ---
  setMaps: (maps: MapData[]) => void;
  addMap: (map: MapData) => void;
  updateMapInList: (id: number, data: Partial<MapData>) => void;
  deleteMap: (id: number) => void;

  setMap: (map: MapData) => void;
  
  // Node Actions
  setNodes: (nodes: MapNode[]) => void;
  addNode: (node: MapNode) => void;
  updateNode: (id: number, data: Partial<MapNode>) => void;
  deleteNode: (id: number) => void;

  // Edge Actions
  setEdges: (edges: MapEdge[]) => void;
  addEdge: (edge: MapEdge) => void;
  updateEdge: (id: number, data: Partial<MapEdge>) => void;
  deleteEdge: (id: number) => void;

  // UI Actions
  setTool: (tool: ToolType) => void;
  selectItem: (type: SelectionType, id: number | null) => void;
  setEditing: (isEditing: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // Initial State
  maps: [],
  currentMap: null,
  nodes: [],
  edges: [],
  activeTool: 'select',
  selectedId: null,
  selectedType: null,
  isEditing: false,

  // Actions Implementation
  setMaps: (maps) => set({ maps }),
  
  addMap: (map) => set((state) => ({ 
    maps: [...state.maps, map] 
  })),

  updateMapInList: (id, data) => set((state) => ({
    maps: state.maps.map((m) => m.id === id ? { ...m, ...data } : m),
    // Nếu map đang sửa chính là map bị update thì update luôn currentMap
    currentMap: state.currentMap?.id === id ? { ...state.currentMap, ...data } : state.currentMap
  })),

  deleteMap: (id) => set((state) => ({
    maps: state.maps.filter((m) => m.id !== id),
    // Nếu xóa đúng map đang mở thì reset currentMap về null
    currentMap: state.currentMap?.id === id ? null : state.currentMap
  })),

  setMap: (map) => set({ currentMap: map }),
  
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (id, data) => set((state) => ({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, ...data } : n)
  })),
  deleteNode: (id) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== id),
    // Xóa luôn edge liên quan
    edges: state.edges.filter((e) => e.start_node_id !== id && e.end_node_id !== id)
  })),

  setEdges: (edges) => set({ edges }),
  addEdge: (edge) => set((state) => ({ edges: [...state.edges, edge] })),
  updateEdge: (id, data) => set((state) => ({
    edges: state.edges.map((e) => e.id === id ? { ...e, ...data } : e)
  })),
  deleteEdge: (id) => set((state) => ({
    edges: state.edges.filter((e) => e.id !== id)
  })),

  setTool: (tool) => set({ 
    activeTool: tool, 
    selectedId: null, 
    selectedType: null,
    isEditing: false 
  }),

  selectItem: (type, id) => set({ 
    selectedType: type, 
    selectedId: id,
    // Reset editing khi chọn cái mới để tránh lỗi
    isEditing: false 
  }),

  setEditing: (isEditing) => set({ isEditing }),
}));