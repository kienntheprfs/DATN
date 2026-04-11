"use client";

import React, { useState } from "react";
import { SearchFilterPanel } from "@/components/admin/knowledge/SearchFilterPanel";
import { DocumentTable, Document } from "@/components/admin/knowledge/DocumentTable";
import { Pagination } from "@/components/admin/knowledge/Pagination";
import { UploadModal } from "@/components/admin/knowledge/UploadModal";

const MOCK_DOCUMENTS: Document[] = [
  {
    id: "1",
    code: "1234/QĐ-ĐHBK",
    title: "Quyết định về việc ban hành Quy chế Đào tạo và Học vụ Đại học Chính quy (2023)",
    summary: "Quy định chi tiết về tín chỉ, đăng ký môn học, điểm số và xét tốt nghiệp...",
    signedDate: "15/08/2023",
    unit: "Phòng Đào Tạo",
    type: "Quyết định",
    tags: ["Đại học", "Đào tạo"],
  },
  {
    id: "2",
    code: "56/TB-CTSV",
    title: "Thông báo V/v Nộp hồ sơ xét chế độ chính sách Miễn giảm học phí HK1/2023-2024",
    summary: "Hướng dẫn sinh viên các diện chính sách nộp hồ sơ đúng hạn...",
    signedDate: "01/09/2023",
    unit: "P. CTCT-SV",
    type: "Thông báo",
    tags: ["Học phí", "SV Chính sách"],
  },
  {
    id: "3",
    code: "101/QĐ-TCCB",
    title: "Quyết định thành lập Hội đồng Đánh giá Luận văn Thạc sĩ đợt 2 năm 2023",
    summary: "Danh sách thành viên hội đồng và lịch trình bảo vệ...",
    signedDate: "10/10/2023",
    unit: "Phòng TCCB",
    type: "Quyết định",
    tags: ["Sau Đại học"],
  },
  {
    id: "4",
    code: "HD-05/KHTH",
    title: "Hướng dẫn thực hiện đồ án tốt nghiệp cho sinh viên K19",
    summary: "Quy định về format, thời gian nộp và quy trình chấm điểm.",
    signedDate: "22/11/2023",
    unit: "Phòng Đào Tạo",
    type: "Hướng dẫn",
    tags: ["Đồ án", "K19"],
  },
  {
    id: "5",
    code: "123/QĐ-ĐHBK-2024",
    title: "Quyết định về việc ban hành quy chế sử dụng hệ thống Chatbot AI (Tài liệu mẫu xem chi tiết)",
    summary: "Nhằm cung cấp công cụ hỗ trợ giải đáp thắc mắc cho sinh viên và giảng viên toàn trường về các quy chế biểu mẫu...",
    signedDate: "20/02/2024",
    unit: "Trung tâm phần mềm",
    type: "Quyết định",
    tags: ["AI", "Hỗ trợ", "Mới"],
  },
];

export default function KnowledgePage() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    year: "all",
    unit: "all",
    type: "all",
  });

  const totalItems = 1204; // Set to a large number as in the original HTML mock
  const itemsPerPage = 10;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="max-w-400 mx-auto w-full flex flex-col md:h-full">
      <div className="flex flex-col gap-6 mb-6 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-text-main tracking-tight">Thư viện &amp; Lịch sử</h1>
            <p className="text-sm text-text-secondary mt-1">Quản lý các phiên làm việc cũ và tra cứu kho văn bản gốc.</p>
          </div>
          <button 
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-blue-800 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium w-full sm:w-auto"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span>Tải lên văn bản mới</span>
          </button>
        </div>
        
        {/* <div className="border-b border-border-color w-full overflow-x-auto">
          <div className="flex gap-8 min-w-max">
            <button className="group relative pb-3 px-1">
              <span className="text-sm font-bold text-text-secondary group-hover:text-text-main transition-colors">Lịch sử Chat</span>
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-transparent group-hover:bg-slate-300 transition-colors translate-y-px"></span>
            </button>
            <button className="relative pb-3 px-1">
              <span className="text-sm font-bold text-primary">Kho Văn bản</span>
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary transition-colors translate-y-px"></span>
            </button>
          </div>
        </div> */}
      </div>

      <SearchFilterPanel filters={filters} setFilters={setFilters} />

      <div className="bg-surface rounded-md border border-border-color shadow-sm flex flex-col overflow-visible md:flex-1 md:overflow-hidden">
        <DocumentTable documents={MOCK_DOCUMENTS} isLoading={false} />
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>

      <UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} />
    </div>
  );
}
