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
            
            const mockHistoryData = [
              {
                id: `page-${state.currentPage}-1`,
                title: "Điều kiện bảo lưu kết quả học tập năm 2023?",
                url: "#",
                timestamp: "15/10/2023 14:30",
                preview: "Theo Điều 15, Quy chế đào tạo Đại học chính quy năm 2023, sinh viên được phép xin nghỉ học tạm thời và bảo lưu kết quả đã học trong các trường hợp: được động viên vào lực lượng vũ trang, bị ốm đau phải điều trị dài ngày, hoặc vì lý do cá nhân khác nhưng phải học ít nhất 1 học kỳ...",
              },
              {
                id: `page-${state.currentPage}-2`,
                title: "Tiêu chuẩn chuẩn đầu ra tiếng Anh khóa 2021?",
                url: "#",
                timestamp: "12/10/2023 09:15",
                preview: "Chuẩn đầu ra ngoại ngữ đối với sinh viên khóa 2021 được quy định như sau: Sinh viên chương trình đại trà cần đạt tối thiểu TOEIC 600 hoặc IELTS 5.5. Các chứng chỉ phải còn hạn ít nhất 3 tháng tính đến thời điểm nộp hồ sơ xét tốt nghiệp...",
              },
              {
                id: `page-${state.currentPage}-3`,
                title: "Quy định về việc học cải thiện điểm?",
                url: "#",
                timestamp: "05/10/2023 16:45",
                preview: "Sinh viên có điểm học phần dưới 5.0 (theo thang điểm 10) được phép đăng ký học lại để cải thiện điểm. Sinh viên có thể chọn học lại chính học phần đó hoặc một học phần tương đương được Khoa cho phép. Điểm được tính sẽ là điểm cao nhất trong các lần học...",
              },
              {
                id: `page-${state.currentPage}-4`,
                title: "Mức thu học phí học kỳ 1 năm 2023-2024?",
                url: "#",
                timestamp: "01/10/2023 11:20",
                preview: "Theo Thông báo số 123/TB-ĐHBK, mức thu học phí học kỳ 1 năm học 2023-2024 đối với chương trình đại trà là 30.000.000 VNĐ/năm. Sinh viên chương trình Chất lượng cao sẽ đóng mức học phí 80.000.000 VNĐ/năm...",
              },
            ];

            const newFetchedItems: HistoryItem[] = mockHistoryData;
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
