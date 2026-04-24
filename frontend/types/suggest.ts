export interface Topic {
    id: string;
    title: string;
    description: string;
    link: string;
    iconName: string;
}

export interface HotTopic extends Topic {
    badge: string; // Thẻ Hot có thêm trường badge đặc biệt
}

export interface SuggestionData {
    hotTopic: HotTopic;
    regularTopics: Topic[];
}

// --- 3. KHAI BÁO STATE CHO ZUSTAND ---
export interface SuggestionState {
    suggestions: SuggestionData | null; // Dùng Interface xịn vừa tạo, không xài typeof nữa
    isLoadingSuggestions: boolean;
    fetchSuggestions: () => Promise<void>;
}