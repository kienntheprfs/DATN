import { HistoryItem } from "./history";
import { User } from "./user";

export interface AppState {
  user: User | null;
  
  // Các state cho Lịch sử
  history: HistoryItem[];
  isLoadingHistory: boolean; // Đang chờ API trả về hay không
  hasMoreHistory: boolean;   // Backend báo còn data để tải nữa không?
  currentPage: number;       // Đang ở trang mấy
  
  // Actions
  login: (userData?: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  
  // Action gọi API (Async)
  fetchMoreHistory: () => Promise<void>; 
}