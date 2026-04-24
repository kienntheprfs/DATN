"use client";

import React, { useMemo, useState } from "react";
import { RatingDetailModal } from "@/components/admin/rating/RatingDetailModal";
import { RatingFilterPanel, RatingFilters } from "@/components/admin/rating/RatingFilterPanel";
import { RatingPagination } from "@/components/admin/rating/RatingPagination";
import type { RatingRow } from "@/components/admin/rating/Rating.types";
import { RatingTable } from "@/components/admin/rating/RatingTable";

const MOCK_ROWS: RatingRow[] = [
	{
		id: "1",
		sessionId: "TS2024-001",
		sessionUuid: "7ca1eb23-5612-42d9-82c3-c77ceb9a1234",
		pair: 1,
		date: "05/03/2024",
		time: "09:15",
		question: "Cho em hỏi quy chế tuyển sinh 2024 của trường có gì mới không ạ?",
		questionFull: "Cho mình hỏi về quy định chuẩn đầu ra tiếng Anh cho sinh viên khóa 2021?",
		answer:
			"Chào bạn, quy chế tuyển sinh 2024 của HCMUT giữ ổn định 5 phương thức xét tuyển, có bổ sung chỉ tiêu cho...",
		answerFull:
			"Chào bạn, theo Quyết định số 1234/QĐ-ĐHBK về Quy chế Đào tạo, chuẩn đầu ra tiếng Anh đối với sinh viên khóa 2021 (K21) yêu cầu đạt chứng chỉ quốc tế tương đương bậc 3/6 theo Khung năng lực ngoại ngữ 6 bậc dùng cho Việt Nam (VSTEP) hoặc các chứng chỉ quốc tế khác như TOEIC (nghe-đọc) tối thiểu 450-600 tùy theo ngành [DOC 1]. Bạn cần nộp chứng chỉ về phòng Đào tạo trước khi xét tốt nghiệp ít nhất 2 tháng. Đối với các chương trình tiên tiến hoặc chất lượng cao, yêu cầu có thể cao hơn (IELTS 6.0 trở lên) [DOC 3]. Bạn có cần mình cung cấp danh sách các chứng chỉ được chấp nhận không?",
		sentiment: "positive",
		comment: "Thông tin rất đầy đủ",
	},
	{
		id: "2",
		sessionId: "HB-2024-88",
		sessionUuid: "59f9f8e2-7a60-4cac-a9e6-1d8081ef2445",
		pair: 0,
		date: "04/03/2024",
		time: "14:20",
		question: "Điều kiện để nhận học bổng khuyến khích học tập là gì?",
		questionFull: "Điều kiện để nhận học bổng khuyến khích học tập là gì?",
		answer: "Để nhận học bổng, sinh viên cần có điểm trung bình học kỳ từ 7.0 trở lên và điểm rèn luyện từ loại tốt...",
		answerFull:
			"Để nhận học bổng, sinh viên cần có điểm trung bình học kỳ từ 7.0 trở lên và điểm rèn luyện từ loại tốt. Ngoài ra cần hoàn thành đầy đủ số tín chỉ theo tiến độ và không vi phạm kỷ luật học vụ.",
		sentiment: "positive",
		comment: "Cảm ơn chatbot",
	},
	{
		id: "3",
		sessionId: "DKMH-102",
		sessionUuid: "41f20a2a-7125-4f56-860b-c91f7cd3d0d1",
		pair: 2,
		date: "03/03/2024",
		time: "08:00",
		question: "Khi nào thì bắt đầu đăng ký môn học học kỳ 1 vậy ạ?",
		questionFull: "Khi nào thì bắt đầu đăng ký môn học học kỳ 1 vậy ạ?",
		answer: "Lịch đăng ký môn học dự kiến bắt đầu từ tuần thứ 2 của tháng 8. Bạn nên theo dõi thông báo trên BKSI...",
		answerFull:
			"Lịch đăng ký môn học dự kiến bắt đầu từ tuần thứ 2 của tháng 8. Bạn nên theo dõi thông báo trên BKSI hoặc cổng thông tin phòng Đào tạo để có mốc cụ thể theo từng khóa và chương trình.",
		sentiment: "negative",
		comment: "Chưa có ngày cụ thể",
	},
	{
		id: "4",
		sessionId: "BL-2024-05",
		sessionUuid: "fb77f2c4-5937-4bd4-aae9-a68af73de55f",
		pair: 1,
		date: "02/03/2024",
		time: "16:45",
		question: "Thủ tục bảo lưu kết quả học tập thực hiện như thế nào?",
		questionFull: "Thủ tục bảo lưu kết quả học tập thực hiện như thế nào?",
		answer: "Sinh viên cần làm đơn xin bảo lưu theo mẫu của Phòng Đào tạo, nộp kèm các giấy tờ minh chứng lý do...",
		answerFull:
			"Sinh viên cần làm đơn xin bảo lưu theo mẫu của Phòng Đào tạo, nộp kèm giấy tờ minh chứng lý do và hoàn tất trước thời hạn học kỳ theo thông báo chính thức từ nhà trường.",
		sentiment: "positive",
		comment: "Rất rõ ràng, cảm ơn",
	},
];

const INITIAL_FILTERS: RatingFilters = {
	fromDate: "2025-01-01",
	toDate: "2026-02-28",
	search: "",
	rating: "all",
};

export default function RatingPage() {
	const [draftFilters, setDraftFilters] = useState<RatingFilters>(INITIAL_FILTERS);
	const [appliedFilters, setAppliedFilters] = useState<RatingFilters>(INITIAL_FILTERS);
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedRow, setSelectedRow] = useState<RatingRow | null>(null);

	const filteredRows = useMemo(() => {
		const search = appliedFilters.search.trim().toLowerCase();

		return MOCK_ROWS.filter((row) => {
			const matchesSearch =
				search.length === 0 ||
				row.sessionId.toLowerCase().includes(search) ||
				row.question.toLowerCase().includes(search) ||
				row.answer.toLowerCase().includes(search) ||
				row.comment.toLowerCase().includes(search);

			const matchesRating =
				appliedFilters.rating === "all" ||
				(appliedFilters.rating === "positive" && row.sentiment === "positive") ||
				(appliedFilters.rating === "negative" && row.sentiment === "negative");

			return matchesSearch && matchesRating;
		});
	}, [appliedFilters]);

	const totalItems = 1204;
	const itemsPerPage = 10;
	const totalPages = 89;

	return (
		<>
			<div className="max-w-400 mx-auto w-full flex flex-col md:h-full">
				<div className="flex flex-col gap-6 mb-6 shrink-0">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-heading font-bold text-text-main tracking-tight">Bình luận của người dùng</h1>
							<p className="text-sm text-text-secondary mt-1">Theo dõi và quản lý phản hồi, đánh giá từ sinh viên và giảng viên.</p>
						</div>
					</div>
				</div>

				<RatingFilterPanel
					filters={draftFilters}
					onFiltersChange={setDraftFilters}
					onApply={() => {
						setAppliedFilters(draftFilters);
						setCurrentPage(1);
					}}
					onExport={() => {
						window.alert("Tính năng Export Excel sẽ được kết nối ở bước tích hợp API.");
					}}
					onPrint={() => {
						window.print();
					}}
				/>

				<div className="bg-surface rounded-md border border-border-color shadow-sm flex-1 flex flex-col overflow-hidden">
					<RatingTable rows={filteredRows} onOpenDetail={setSelectedRow} isLoading />
					<RatingPagination
						currentPage={currentPage}
						totalPages={totalPages}
						totalItems={totalItems}
						itemsPerPage={itemsPerPage}
						onPageChange={setCurrentPage}
					/>
				</div>
			</div>

			<RatingDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
		</>
	);
}
