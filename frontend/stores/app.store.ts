import { create } from 'zustand'
import type { AppState} from '@/types/state'
import type { HistoryItem, User, MapWithData } from '@/types'
import { authService } from '@/services/auth-api'
import { agentClient } from '@/services/agent'
import { wayfindingMapApi } from '@/services/wayfinding-map-api'

const fetchWithBackoff = async <T>(fn: () => Promise<T>, retries = 5, initialDelay = 1000): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

const MOCK_USERS = [
  { name: "Nguyễn Văn A", email: "nguyen.van.a@hcmut.edu.vn", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=nguyenvana" },
  { name: "Trần Thị Bảo Trân", email: "tran.thi.bao.tran@hcmut.edu.vn", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=baotran" },
  { name: "Lê Hoàng Nam", email: "le.hoang.nam@hcmut.edu.vn", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=nam" },
]

export const useAppStore = create<AppState>()(
    (set, get) => ({ // Dùng thêm hàm get() để lấy state hiện tại lúc đang ở trong action
      user: null, 
      
      history: [],
      isLoadingHistory: false,
      hasMoreHistory: true,
      isErrorHistory: false,
      currentPage: 1,

      // Maps
      allMaps: [],
      isLoadingMaps: false,

      login: async (userData?: { email: string; password: string }) => {
        if (userData) {
          try {
            await authService.login(userData.email, userData.password);
            const user = await authService.me();
            set({ user });
          } catch (error) {
            console.error("Login failed:", error);
            throw error;
          }
        } else {
          const token = authService.getToken();
          if (token) {
            try {
              const user = await authService.me();
              set({ user });
            } catch {
              authService.logout();
            }
          }
        }
      },
      
      logout: async () => {
        try {
          await authService.logout();
        } catch {
          // Ignore errors
        }
        set({ user: null, history: [], currentPage: 1 });
      },

      clearAllHistory: async () => {
        try {
          await agentClient.deleteAllThreads();
          set({ history: [], currentPage: 1, hasMoreHistory: false });
        } catch (error) {
          console.error("Lỗi khi xóa lịch sử:", error);
          throw error;
        }
      },

      refreshHistory: async () => {
        const state = get();
        // Prevent concurrent refresh; keep existing history visible while fetching
        if (state.isLoadingHistory) return;
        set({ isLoadingHistory: true, isErrorHistory: false, currentPage: 1, hasMoreHistory: true });
        try {
          const response = await fetchWithBackoff(() => agentClient.getThreads(5, 0));
          const newFetchedItems: HistoryItem[] = response.items.map((thread) => ({
            id: thread.id,
            title: thread.title || "Cuộc trò chuyện mới",
            url: `/chat?thread_id=${thread.id}`,
            updatedAt: thread.updated_at || undefined,
            preview: thread.title || "",
          }));
          set({
            history: newFetchedItems,
            currentPage: 2,
            isLoadingHistory: false,
            hasMoreHistory: response.items.length === 5,
            isErrorHistory: false
          });
        } catch (error) {
          console.error("Lỗi khi tải lịch sử (sau 5 lần thử):", error);
          set({ isLoadingHistory: false, isErrorHistory: true });
        }
      },

      // --- HÀM GỌI API THỰC TẾ ---
      fetchMoreHistory: async () => {
        const state = get();
        
        if (state.isLoadingHistory || !state.hasMoreHistory) return;
        set({ isLoadingHistory: true, isErrorHistory: false });
        try {
            const response = await fetchWithBackoff(() => agentClient.getThreads(5, (state.currentPage - 1) * 5));
            const newFetchedItems: HistoryItem[] = response.items.map((thread) => ({
              id: thread.id,
              title: thread.title || "Cuộc trò chuyện mới",
              url: `/chat?thread_id=${thread.id}`,
              updatedAt: thread.updated_at || undefined,
              preview: thread.title || "",
            }));

            set((prevState) => ({
                history: [...prevState.history, ...newFetchedItems],
                currentPage: prevState.currentPage + 1,
                isLoadingHistory: false,
                hasMoreHistory: response.items.length === 5,
                isErrorHistory: false
            }));

        } catch (error) {
            console.error("Lỗi khi tải thêm lịch sử (sau 5 lần thử):", error);
            set({ isLoadingHistory: false, isErrorHistory: true });
        }
      },

      deleteHistoryItem: async (threadId: string) => {
        try {
          await agentClient.deleteThread(threadId);
          set((state) => ({
            history: state.history.filter((item) => item.id !== threadId),
          }));
        } catch (error) {
          console.error("Lỗi khi xóa lịch sử:", error);
          throw error;
        }
      },

      updateHistoryItemTitle: async (threadId: string, newTitle: string) => {
        try {
          await agentClient.updateThreadTitle(threadId, newTitle);
          set((state) => ({
            history: state.history.map((item) =>
              item.id === threadId ? { ...item, title: newTitle } : item
            ),
          }));
        } catch (error) {
          console.error("Lỗi khi cập nhật tiêu đề:", error);
          throw error;
        }
      },

      fetchAllMaps: async (force = false) => {
        const state = get();
        if (!force && (state.allMaps.length > 0 || state.isLoadingMaps)) return;

        set({ isLoadingMaps: true });
        try {
          const data = await wayfindingMapApi.getAllMapsWithData();
          set({ allMaps: data, isLoadingMaps: false });
        } catch (error) {
          console.error("Lỗi khi tải bản đồ:", error);
          set({ isLoadingMaps: false });
        }
      },
    })
)
