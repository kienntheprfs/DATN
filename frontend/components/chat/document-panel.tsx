"use client";

import { useState, useEffect } from "react";
import { X, Search, FileText, ChevronDown, ChevronUp, ExternalLink, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MiniNavigation } from "./MapPreview";

interface DocumentSection {
	id: string;
	title: string;
	content: string;
}

interface Document {
	id: string;
	title: string;
	sections: DocumentSection[];
}

interface Citation {
	file_name: string;
	s3_url: string;
	text_preview: string;
	source_type: string;
}

interface RouteData {
	type: string;
	start_name: string;
	end_name: string;
	map: any;
	path_coords: number[][];
	path_node_ids: number[];
	total_distance_m: number;
	instructions: any[];
	is_multi_floor?: boolean;
	floor_count?: number;
	route_maps?: any[];
	floors?: any[];
}

const mockDocuments: Document[] = [
	{
		id: "1",
		title: "Quy chế đào tạo 2024",
		sections: [
			{
				id: "1-1",
				title: "Điều 1. Phạm vi điều chỉnh",
				content:
					"Quy chế này quy định về đào tạo trình độ đại học, cao đẳng tại Trường Đại học Bách Khoa. Áp dụng cho tất cả các ngành đào tạo trực thuộc trường.",
			},
			{
				id: "1-2",
				title: "Điều 2. Đối tượng áp dụng",
				content: "Quy chế này áp dụng cho sinh viên, giảng viên và các đơn vị tham gia vào quá trình đào tạo tại trường.",
			},
			{
				id: "1-3",
				title: "Điều 3. Nguyên tắc đào tạo",
				content: "Đào tạo theo tín chỉ, kết hợp lý thuyết với thực hành, đảm bảo chất lượng và phát triển năng lực người học.",
			},
		],
	},
	{
		id: "2",
		title: "Quy định về đánh giá học phần",
		sections: [
			{
				id: "2-1",
				title: "Điều 10. Thành phần đánh giá",
				content: "Đánh giá học phần gồm: điểm thường xuyên (30%), điểm giữa kỳ (20%), điểm cuối kỳ (50%).",
			},
			{
				id: "2-2",
				title: "Điều 11. Thang điểm",
				content: "Sử dụng thang điểm 10. Điểm học phần là điểm trung bình có trọng số của các thành phần đánh giá.",
			},
		],
	},
	{
		id: "3",
		title: "Quy chế về tốt nghiệp",
		sections: [
			{
				id: "3-1",
				title: "Điều 25. Điều kiện tốt nghiệp",
				content:
					"Sinh viên được xét tốt nghiệp khi: tích lũy đủ số tín chỉ theo yêu cầu chương trình, điểm trung bình tích lũy từ 5.0 trở lên, không nợ học phí.",
			},
			{
				id: "3-2",
				title: "Điều 26. Thời gian tốt nghiệp",
				content: "Thời gian đào tạo chuẩn là 4 năm cho chương trình đại học, có thể kéo dài tối đa 2 năm nếu sinh viên chưa hoàn thành chương trình.",
			},
		],
	},
];

interface HighlightedTextProps {
	text: string;
	highlight: string;
}

function HighlightedText({ text, highlight }: HighlightedTextProps) {
	if (!highlight.trim()) {
		return <>{text}</>;
	}

	const parts = text.split(new RegExp(`(${highlight})`, "gi"));

	return (
		<>
			{parts.map((part, index) =>
				part.toLowerCase() === highlight.toLowerCase() ? (
					<mark key={index} className="bg-yellow-200 px-0.5 rounded">
						{part}
					</mark>
				) : (
					<span key={index}>{part}</span>
				),
			)}
		</>
	);
}

interface DocumentPanelProps {
	onClose: () => void;
	citations?: Citation[];
	routeData?: RouteData | null;
}

export function DocumentPanel({ onClose, citations, routeData }: DocumentPanelProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
	const [expandedSection, setExpandedSection] = useState<string | null>(null);
	const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
	const [previewSearch, setPreviewSearch] = useState("");
	const [activeTab, setActiveTab] = useState<"documents" | "map">("documents");

	useEffect(() => {
		if (citations && citations.length > 0 && !selectedCitation) {
			setSelectedCitation(citations[0]);
		}
	}, [citations, selectedCitation]);

	useEffect(() => {
		if (routeData) {
			setActiveTab("map");
		}
	}, [routeData]);

	const filteredDocs = mockDocuments.map((doc) => {
		if (!searchQuery.trim()) return doc;

		const matchingSections = doc.sections.filter(
			(section) => section.title.toLowerCase().includes(searchQuery.toLowerCase()) || section.content.toLowerCase().includes(searchQuery.toLowerCase()),
		);

		return {
			...doc,
			sections: matchingSections.length > 0 ? matchingSections : doc.sections,
		};
	});

	const filteredCitations = citations?.filter(
		(cite) =>
			!searchQuery.trim() ||
			cite.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			cite.text_preview.toLowerCase().includes(searchQuery.toLowerCase())
	);

	return (
		<div className="flex flex-col h-full bg-background">
			<div className="flex items-center justify-between p-4 border-b shrink-0">
				<h2 className="text-lg font-semibold">
					{activeTab === "map" ? "Bản đồ" : "Tài liệu tham khảo"}
				</h2>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="size-5" />
				</Button>
			</div>

			{routeData && (
				<div className="flex border-b shrink-0">
					<button
						onClick={() => setActiveTab("documents")}
						className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
							activeTab === "documents"
								? "border-primary text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						Tài liệu
					</button>
					<button
						onClick={() => setActiveTab("map")}
						className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
							activeTab === "map"
								? "border-primary text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<Map className="size-4" />
						Bản đồ
					</button>
				</div>
			)}

			{activeTab === "map" && routeData ? (
				<div className="flex-1 overflow-y-auto p-4">
					<MiniNavigation routeData={routeData} />
				</div>
			) : (
				<>
					<div className="p-4 border-b shrink-0">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
							<Input
								placeholder="Tìm kiếm trong tài liệu..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-9"
							/>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto">
						{citations && citations.length > 0 && (
							<div className="p-4 border-b bg-blue-50/50">
								<div className="text-xs font-semibold text-blue-600 mb-2">Nguồn trong cuộc trò chuyện</div>
								<div className="space-y-2">
									{filteredCitations?.map((cite, idx) => (
										<button
											key={idx}
											onClick={() => setSelectedCitation(cite)}
											className="w-full text-left p-2 rounded bg-white border hover:bg-blue-50 transition-colors"
										>
											<div className="flex items-center gap-2">
												<FileText className="size-4 text-blue-500" />
												<span className="text-sm font-medium text-blue-700">{cite.file_name}</span>
											</div>
											<p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cite.text_preview}</p>
										</button>
									))}
								</div>
							</div>
						)}

						<div className="p-4 space-y-3">
							{filteredDocs.map((doc) => (
								<div key={doc.id} className="border rounded-lg overflow-hidden">
									<button
										onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
										className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors"
									>
										<div className="flex items-center gap-2">
											<FileText className="size-4 text-muted-foreground" />
											<span className="font-medium text-sm">{doc.title}</span>
										</div>
										{expandedDoc === doc.id ? (
											<ChevronUp className="size-4" />
										) : (
											<ChevronDown className="size-4" />
										)}
									</button>

									{expandedDoc === doc.id && (
										<div className="border-t">
											{doc.sections.map((section) => (
												<div key={section.id} className="border-b last:border-b-0">
													<button
														onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
														className="w-full p-3 text-left hover:bg-muted/30 transition-colors flex items-center justify-between"
													>
														<span className="text-sm font-medium">{section.title}</span>
														{expandedSection === section.id ? (
															<ChevronUp className="size-3 text-muted-foreground" />
														) : (
															<ChevronDown className="size-3 text-muted-foreground" />
														)}
													</button>

													{expandedSection === section.id && (
														<div className="px-3 pb-3">
															<p className="text-sm text-muted-foreground leading-relaxed">
																<HighlightedText text={section.content} highlight={searchQuery} />
															</p>
														</div>
													)}
												</div>
											))}
										</div>
									)}
								</div>
							))}

							{searchQuery && filteredDocs.every((doc) => doc.sections.every((section) => !section.title.toLowerCase().includes(searchQuery.toLowerCase()) && !section.content.toLowerCase().includes(searchQuery.toLowerCase()))) && (
								<p className="text-center text-muted-foreground text-sm py-8">Không tìm thấy kết quả nào</p>
							)}
						</div>
					</div>
				</>
			)}

			{selectedCitation && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
					<div className="bg-background rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
						<div className="flex items-center justify-between p-4 border-b shrink-0">
							<div className="flex items-center gap-2">
								<FileText className="size-5 text-blue-500" />
								<h3 className="font-semibold">{selectedCitation.file_name}</h3>
								<span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{selectedCitation.source_type}</span>
							</div>
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="icon" onClick={() => window.open(selectedCitation.s3_url, "_blank")}>
									<ExternalLink className="size-4" />
								</Button>
								<Button variant="ghost" size="icon" onClick={() => setSelectedCitation(null)}>
									<X className="size-5" />
								</Button>
							</div>
						</div>

						<div className="p-4 border-b shrink-0">
							<div className="relative">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
								<Input
									placeholder="Tìm kiếm trong tài liệu..."
									value={previewSearch}
									onChange={(e) => setPreviewSearch(e.target.value)}
									className="pl-9"
								/>
							</div>
						</div>

						<div className="flex-1 overflow-y-auto p-4">
							<div className="prose prose-sm max-w-none">
								<HighlightedText text={selectedCitation.text_preview} highlight={previewSearch} />
							</div>
							{!selectedCitation.text_preview && (
								<p className="text-muted-foreground text-sm">Không có nội dung xem trước</p>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}