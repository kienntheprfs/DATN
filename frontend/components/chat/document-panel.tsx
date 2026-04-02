"use client";

import { useState } from "react";
import { X, Search, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
	isOpen: boolean;
	onClose: () => void;
}

export function DocumentPanel({ isOpen, onClose }: DocumentPanelProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
	const [expandedSection, setExpandedSection] = useState<string | null>(null);

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

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border shadow-lg z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Tài liệu tham khảo</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        <div className="p-4 border-b">
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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

          {searchQuery && filteredDocs.every(doc => 
            doc.sections.every(section => 
              !section.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
              !section.content.toLowerCase().includes(searchQuery.toLowerCase())
            )
          ) && (
            <p className="text-center text-muted-foreground text-sm py-8">
              Không tìm thấy kết quả nào
            </p>
          )}
        </div>
      </div>
    </>
  );
}
