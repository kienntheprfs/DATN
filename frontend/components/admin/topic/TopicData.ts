import type { PipelineRange, TopicFilter, TopicItem, TopicStatus } from "./TopicTypes";

export const TOPICS: TopicItem[] = [
  {
    id: "TOPIC-QC-2024-001",
    title: "Tiến hóa của Điện toán lượng tử",
    summary: "Kiến trúc lõi, Qubits, Chồng chập",
    queries: 84212,
    lastUpdated: "4m ago",
    status: "stable",
    pinned: true,
    knowledgeUpdated: true,
    featuredEntity: "Mô hình ngôn ngữ lớn (LLM)",
    confidence: 94.8,
    syncAgo: "4 phút trước",
    tags: ["Kiến trúc lõi", "Qubits", "Chồng chập", "Rối lượng tử", "Cổng logic"],
    sources: [
      { label: "Vector Clusters (Main)", percent: "62.4%" },
      { label: "Tài liệu Quy chế 123/QD-BK", percent: "24.1%" },
      { label: "Truy vấn người dùng trực tiếp", percent: "13.5%" },
    ],
    sentimentPositive: 82,
    sentimentComplex: 18,
    moderationNote:
      "Chủ đề này đang có mức tăng trưởng truy vấn đột biến từ khối kỹ thuật. Cần cập nhật thêm các tài liệu hướng dẫn mới nhất về Qubit Error Correction để đáp ứng độ chính xác RAG.",
    rawQuestions: [
      {
        question: "Làm thế nào để giảm thiểu lỗi decoherence trong qubit siêu dẫn?",
        user: "User_8842",
        timestamp: "2023-10-24 14:20:05",
      },
      {
        question: "Sự khác biệt giữa ủ lượng tử và điện toán lượng tử phổ quát?",
        user: "hv.nguyen33",
        timestamp: "2023-10-24 13:45:12",
      },
      {
        question: "Tại sao mã hóa lượng tử lại được coi là không thể bẻ khóa?",
        user: "Guest_002",
        timestamp: "2023-10-24 11:12:30",
      },
      {
        question: "Khi nào máy tính lượng tử có thể giải quyết các bài toán tối ưu hóa Logistics?",
        user: "admin_research",
        timestamp: "2023-10-24 09:05:44",
      },
    ],
  },
  {
    id: "TOPIC-SC-2024-011",
    title: "Chuỗi cung ứng bền vững",
    summary: "Tuân thủ ESG, Logistics, Trung hòa Carbon",
    queries: 62904,
    lastUpdated: "12m ago",
    status: "new",
    pinned: false,
    knowledgeUpdated: false,
    featuredEntity: "Carbon-neutral logistics",
    confidence: 88.2,
    syncAgo: "12 phút trước",
    tags: ["ESG", "Logistics", "Net Zero", "Năng lượng tái tạo"],
    sources: [
      { label: "Báo cáo doanh nghiệp", percent: "51.2%" },
      { label: "Nghị định môi trường", percent: "31.7%" },
      { label: "Thảo luận học thuật", percent: "17.1%" },
    ],
    sentimentPositive: 75,
    sentimentComplex: 25,
    moderationNote: "Khuyến nghị bổ sung thêm tài liệu benchmark phát thải trong vận tải biển.",
    rawQuestions: [
      { question: "Doanh nghiệp cần làm gì để đạt net zero vào 2030?", user: "linhtran", timestamp: "2023-10-24 14:02:10" },
      { question: "Sự khác biệt giữa Scope 1, 2, 3 trong logistics là gì?", user: "hiep.ng", timestamp: "2023-10-24 12:11:03" },
      { question: "Có framework ESG nào áp dụng riêng cho chuỗi cung ứng không?", user: "guest_777", timestamp: "2023-10-24 09:44:50" },
      { question: "Các công cụ đo vết carbon phổ biến hiện nay?", user: "anhvu", timestamp: "2023-10-24 08:31:19" },
    ],
  },
  {
    id: "TOPIC-LLM-2024-021",
    title: "Chiến lược tinh chỉnh LLM",
    summary: "RLHF, LoRA, Context Windows",
    queries: 128443,
    lastUpdated: "1h ago",
    status: "stable",
    pinned: true,
    knowledgeUpdated: false,
    featuredEntity: "Instruction tuning",
    confidence: 92.1,
    syncAgo: "1 giờ trước",
    tags: ["RLHF", "LoRA", "Evaluation", "Prompting"],
    sources: [
      { label: "Paper collections", percent: "66.0%" },
      { label: "Internal benchmark", percent: "20.8%" },
      { label: "Community feedback", percent: "13.2%" },
    ],
    sentimentPositive: 79,
    sentimentComplex: 21,
    moderationNote: "Nên cập nhật thêm benchmark tiếng Việt cho các mô hình dưới 13B.",
    rawQuestions: [
      { question: "LoRA và QLoRA khác nhau ở điểm nào quan trọng nhất?", user: "khoaai", timestamp: "2023-10-24 16:01:21" },
      { question: "RLHF có bắt buộc với chatbot nội bộ không?", user: "ops_bot", timestamp: "2023-10-24 13:31:14" },
      { question: "Nên chọn tập dữ liệu đánh giá nào cho tiếng Việt?", user: "namduc", timestamp: "2023-10-24 10:52:06" },
      { question: "Context window dài có luôn tốt hơn không?", user: "guest_011", timestamp: "2023-10-24 07:23:09" },
    ],
  },
  {
    id: "TOPIC-EDGE-2024-034",
    title: "An ninh Điện toán Biên",
    summary: "IoT, Zero Trust, Quyền riêng tư dữ liệu",
    queries: 41200,
    lastUpdated: "3h ago",
    status: "waiting",
    pinned: false,
    knowledgeUpdated: true,
    featuredEntity: "Zero trust edge architecture",
    confidence: 86.7,
    syncAgo: "3 giờ trước",
    tags: ["IoT", "Zero Trust", "Edge AI", "Privacy"],
    sources: [
      { label: "Security advisories", percent: "48.9%" },
      { label: "Vendor whitepapers", percent: "29.3%" },
      { label: "User incident reports", percent: "21.8%" },
    ],
    sentimentPositive: 67,
    sentimentComplex: 33,
    moderationNote: "Đang chờ bổ sung tài liệu về secure enclave cho edge inference.",
    rawQuestions: [
      { question: "Làm sao triển khai zero trust cho hàng nghìn thiết bị IoT?", user: "iot_lab", timestamp: "2023-10-24 15:20:40" },
      { question: "Edge AI có vi phạm quyền riêng tư dữ liệu không?", user: "guest_909", timestamp: "2023-10-24 12:05:17" },
      { question: "Mã hóa dữ liệu khi thiết bị offline xử lý thế nào?", user: "thang.pt", timestamp: "2023-10-24 10:40:55" },
      { question: "Chọn TPM hay secure enclave cho camera edge?", user: "research_lab", timestamp: "2023-10-24 08:19:32" },
    ],
  },
];

export const FILTERS: { key: TopicFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "popular", label: "Chủ đề phổ biến" },
  { key: "missing-knowledge", label: "Thiếu tri thức" },
];

export const TREND_BARS = [20, 35, 65, 90, 60, 40, 55, 30];

export const PIPELINE_RANGE_LABELS: Record<PipelineRange, string> = {
  "24h": "24h qua",
  "1w": "1 tuần qua",
  "2w": "2 tuần qua",
  "1m": "1 tháng qua",
};

export const statusBadgeClass: Record<TopicStatus, string> = {
  new: "bg-emerald-50 text-emerald-700 border-emerald-100",
  waiting: "bg-orange-50 text-orange-700 border-orange-100",
  stable: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

export const statusBadgeLabel: Record<TopicStatus, string> = {
  new: "Mới",
  waiting: "Chờ",
  stable: "Hệ thống ổn định",
};

export const formatQueries = (value: number) => `${value.toLocaleString("en-US")} Queries`;
