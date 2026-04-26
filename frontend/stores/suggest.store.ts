import { create } from "zustand";
import type { SuggestionData, SuggestionState } from "@/types/suggest";
import { pinnedPostService } from "@/services/pinned-post-api";

// --- 2. DỮ LIỆU GIẢ LẬP (Ép kiểu chuẩn theo SuggestionData) ---
const MOCK_SUGGESTIONS: SuggestionData = {
    hotTopic: {
        id: "hot-1",
        title: "Lịch thi học kỳ",
        description: "Cập nhật mới nhất về lịch thi và địa điểm cho tất cả các khoa.",
        badge: "Thông tin mới",
        link: "#",
        iconName: "flame",
    },
    regularTopics: [
        // {
        //     id: "reg-1",
        //     title: "Tin tức nội bộ",
        //     description: "Cập nhật các thông báo mới nhất từ phòng Đào tạo.",
        //     link: "#",
        //     iconName: "newspaper",
        // },
        // {
        //     id: "reg-2",
        //     title: "Biểu mẫu sinh viên",
        //     description: "Tải về các loại đơn từ, giấy xác nhận sinh viên.",
        //     link: "#",
        //     iconName: "newspaper",
        // },
        // {
        //     id: "reg-3",
        //     title: "Hướng dẫn học vụ",
        //     description: "Quy trình đăng ký môn học và xử lý học vụ.",
        //     link: "#",
        //     iconName: "newspaper",
        // },
    ],
};

// --- 4. TẠO STORE ---
export const useSuggestionStore = create<SuggestionState>()((set, get) => ({
    suggestions: null,
    isLoadingSuggestions: false,

    fetchSuggestions: async () => {
        const state = get();

        // Chặn gọi API nếu đang tải hoặc đã có data
        if (state.isLoadingSuggestions || state.suggestions) return;

        set({ isLoadingSuggestions: true });

        try {
            // 🔴 CHỖ NÀY LÀ NƠI GỌI API FASTAPI THẬT:
            // const response = await fetch(`http://localhost:8000/api/suggestions`);
            // const data: SuggestionData = await response.json(); 

            const pinnedResponse = await pinnedPostService.listPublic({
                limit: 1,
                sort_by: "manual",
            });

            const topPinned = pinnedResponse.items[0];

            const nextSuggestions: SuggestionData = topPinned
                ? {
                    hotTopic: {
                        id: topPinned.id,
                        title: topPinned.title,
                        description: topPinned.summary,
                        badge: "Bài ghim nổi bật",
                        link: topPinned.source_url || "/pinned-post",
                        iconName: "flame",
                    },
                    regularTopics: [],
                }
                : MOCK_SUGGESTIONS;

            set({
                suggestions: nextSuggestions,
                isLoadingSuggestions: false,
            });
        } catch (error) {
            console.error("Lỗi khi tải gợi ý tra cứu:", error);
            set({ isLoadingSuggestions: false });
        }
    },
}));