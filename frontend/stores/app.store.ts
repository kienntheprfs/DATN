import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState} from '@/types/state'
import type { HistoryItem, User } from '@/types'
import { authService } from '@/services/auth-api'

const MOCK_USERS = [
  { name: "Nguyễn Văn A", email: "nguyen.van.a@hcmut.edu.vn", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=nguyenvana" },
  { name: "Trần Thị Bảo Trân", email: "tran.thi.bao.tran@hcmut.edu.vn", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=baotran" },
  { name: "Lê Hoàng Nam", email: "le.hoang.nam@hcmut.edu.vn", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=nam" },
]

export const useAppStore = create<AppState>()(
    (set, get) => ({ // Dùng thêm hàm get() để lấy state hiện tại lúc đang ở trong action
      user: null, 
      
      // Khởi tạo Lịch sử trống
      history: [],
      isLoadingHistory: false,
      hasMoreHistory: true,
      currentPage: 1,

      login: async (userData?: { email: string; password: string }) => {
        if (userData) {
          try {
            const result = await authService.login(userData.email, userData.password);
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

      // --- HÀM GỌI API THỰC TẾ ---
      fetchMoreHistory: async () => {
        const state = get();
        
        // Nếu đang tải rồi, hoặc đã hết data thì không gọi API nữa để chống spam click
        if (state.isLoadingHistory || !state.hasMoreHistory) return;

        // Bật trạng thái loading lên để UI hiện icon xoay tròn
        set({ isLoadingHistory: true });

        try {
            // 🔴 CHỖ NÀY LÀ NƠI BẠN GỌI API FASTAPI THẬT:
            // const response = await fetch(`http://localhost:8000/api/history?page=${state.currentPage}`);
            // const data = await response.json();
            
            // --- BẮT ĐẦU GIẢ LẬP API CHỜ 1 GIÂY ---
            await new Promise((resolve) => setTimeout(resolve, 1000));
            
            // Tạo ra 3 dòng lịch sử ảo mới dựa trên số page
            const newFetchedItems: HistoryItem[] = [
                { id: `page-${state.currentPage}-1`, title: `Lịch sử trang ${state.currentPage} - Mục 1`, url: "#" },
                { id: `page-${state.currentPage}-2`, title: `Lịch sử trang ${state.currentPage} - Mục 2`, url: "#" },
                { id: `page-${state.currentPage}-3`, title: `Lịch sử trang ${state.currentPage} - Mục 3`, url: "#" },
            ];
            // --- KẾT THÚC GIẢ LẬP ---

            // Cập nhật state sau khi API trả về thành công
            set((prevState) => ({
                history: [...prevState.history, ...newFetchedItems],
                currentPage: prevState.currentPage + 1,
                isLoadingHistory: false,
                // Giả sử API giới hạn chỉ có 3 trang thì hết (Tắt nút xem thêm)
                hasMoreHistory: prevState.currentPage < 3 
            }));

        } catch (error) {
            console.error("Lỗi khi tải lịch sử:", error);
            // Lỗi mạng thì cũng phải tắt loading
            set({ isLoadingHistory: false });
        }
      },
    }
  )
)
