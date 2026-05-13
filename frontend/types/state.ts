import { HistoryItem } from "./history";
import { User } from "./user";
import { MapWithData } from "./wayfinding";

export interface AppState {
  user: User | null;
  
  // Các state cho Lịch sử
  history: HistoryItem[];
  isLoadingHistory: boolean; // Đang chờ API trả về hay không
  hasMoreHistory: boolean;   // Backend báo còn data để tải nữa không?
  currentPage: number;       // Đang ở trang mấy

  // Bản đồ
  allMaps: MapWithData[];
  isLoadingMaps: boolean;
  
  // Actions
  login: (userData?: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  
  // Action gọi API (Async)
  fetchMoreHistory: () => Promise<void>; 
  clearAllHistory: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  deleteHistoryItem: (threadId: string) => Promise<void>;
  updateHistoryItemTitle: (threadId: string, newTitle: string) => Promise<void>;
  fetchAllMaps: () => Promise<void>;
}