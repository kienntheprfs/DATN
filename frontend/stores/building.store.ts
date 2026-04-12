import { create } from 'zustand';
import { Building } from '@/types';
import { buildingApi } from '@/services/building-api';

interface BuildingState {
  buildings: Building[];
  isLoading: boolean;
  error: string | null;
  fetchBuildings: () => Promise<void>;
  getBuildingById: (id: number) => Building | undefined;
  addBuilding: (building: Building) => void;
  updateBuilding: (id: number, data: Partial<Building>) => void;
}

export const useBuildingStore = create<BuildingState>((set, get) => ({
  buildings: [],
  isLoading: false,
  error: null,

  fetchBuildings: async () => {
    const state = get();
    if (state.isLoading) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const buildings = await buildingApi.getAll();
      set({ buildings, isLoading: false });
    } catch (error) {
      console.error('Failed to load buildings:', error);
      set({ error: 'Failed to load buildings', isLoading: false });
    }
  },

  getBuildingById: (id: number) => {
    return get().buildings.find(b => b.id === id);
  },

  addBuilding: (building: Building) => {
    set((state) => ({ buildings: [...state.buildings, building] }));
  },

  updateBuilding: (id: number, data: Partial<Building>) => {
    set((state) => ({
      buildings: state.buildings.map(b => b.id === id ? { ...b, ...data } : b),
    }));
  },
}));
