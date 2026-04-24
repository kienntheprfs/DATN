"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemGroup } from "@/components/ui/item";
import { PinnedPostCard, SortDropdown } from "@/components/features/pinned-posts";

// Category color mapping
const CATEGORY_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  "Quy chế Đào tạo": {
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-[#030391]",
  },
  "Hướng dẫn": {
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    text: "text-emerald-700",
  },
  "Thông báo": {
    bg: "bg-orange-50",
    border: "border-orange-100",
    text: "text-orange-700",
  },
  "Nghiên cứu": {
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-[#030391]",
  },
  "Chính sách": {
    bg: "bg-slate-100",
    border: "border-slate-200",
    text: "text-slate-700",
  },
  "Tài chính": {
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-[#030391]",
  },
  "Phòng thí nghiệm": {
    bg: "bg-orange-50",
    border: "border-orange-100",
    text: "text-orange-700",
  },
  "Hợp tác": {
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    text: "text-emerald-700",
  },
  "Khảo thí": {
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-[#030391]",
  },
  "Cơ sở vật chất": {
    bg: "bg-slate-100",
    border: "border-slate-200",
    text: "text-slate-700",
  },
};

interface PinnedPost {
  id: string;
  category: string;
  title: string;
  description: string;
  date: string;
  link?: string;
}

// Mock data based on HTML
const MOCK_PINNED_POSTS: PinnedPost[] = [
  {
    id: "1",
    category: "Quy chế Đào tạo",
    title: "Quy định về việc hoãn bảo vệ luận văn thạc sĩ tại HCMUT",
    description:
      "Chi tiết các điều kiện bắt buộc, quy trình nộp đơn và thời hạn tối đa được phép gia hạn theo quyết định của Hội đồng Khoa học...",
    date: "12/10/2023",
  },
  {
    id: "2",
    category: "Hướng dẫn",
    title:
      "Quy trình sử dụng tài khoản email và xác thực tập trung MyBK",
    description:
      "Hướng dẫn các bước kích hoạt, bảo mật 2 lớp và xử lý sự cố khi không thể đăng nhập vào hệ thống quản lý sinh viên...",
    date: "05/01/2024",
  },
  {
    id: "3",
    category: "Thông báo",
    title: "Kế hoạch đăng ký học phần Học kỳ 2 - Năm học 2023-2024",
    description:
      "Lịch trình chi tiết các đợt đăng ký, tiêu chuẩn tín chỉ và các quy định về học vụ bổ sung cho khối kỹ thuật chất lượng cao...",
    date: "20/12/2023",
  },
  {
    id: "4",
    category: "Nghiên cứu",
    title: "Tiêu chí xét duyệt đề tài NCKH cấp Trường dành cho giảng viên trẻ",
    description:
      "Bảng điểm đánh giá năng lực, các yêu cầu về công bố quốc tế và định mức kinh phí hỗ trợ tối đa cho một dự án trọng điểm...",
    date: "15/11/2023",
  },
  {
    id: "5",
    category: "Chính sách",
    title:
      "Quy tắc đạo đức và liêm chính trong học thuật (Academic Integrity)",
    description:
      "Hệ thống các quy chuẩn về trích dẫn tài liệu tham khảo, sử dụng AI trong nghiên cứu và các hình thức xử phạt vi phạm bản quyền...",
    date: "02/02/2024",
  },
  {
    id: "6",
    category: "Tài chính",
    title: "Quyết định về định mức học phí các chương trình tiên tiến năm 2024",
    description:
      "Cập nhật đơn giá tín chỉ, các khoản phụ phí hành chính và chính sách miễn giảm học phí cho sinh viên diện chính sách...",
    date: "18/12/2023",
  },
  {
    id: "7",
    category: "Phòng thí nghiệm",
    title: "Nội quy an toàn phòng thí nghiệm và quản lý hóa chất độc hại",
    description:
      "Quy định về trang phục bảo hộ, quy trình xử lý rác thải hóa học và đăng ký sử dụng phòng thí nghiệm ngoài giờ hành chính...",
    date: "01/11/2023",
  },
  {
    id: "8",
    category: "Hợp tác",
    title:
      "Chương trình trao đổi sinh viên quốc tế (Exchange) - EU/Asia 2024",
    description:
      "Danh sách các trường đối tác, tiêu chuẩn tiếng Anh IELTS/TOEFL và các suất học bổng toàn phần dành cho sinh viên xuất sắc...",
    date: "10/01/2024",
  },
  {
    id: "9",
    category: "Khảo thí",
    title: "Hướng dẫn phúc khảo bài thi cuối kỳ - Học kỳ 1 (2023-2024)",
    description:
      "Quy định về thời hạn nộp đơn phúc khảo, lệ phí và quy trình làm việc của ban khảo thí sau khi công bố điểm thi...",
    date: "25/01/2024",
  },
  {
    id: "10",
    category: "Cơ sở vật chất",
    title:
      "Sơ đồ vị trí và quy hoạch tòa nhà Innovation Center (Lý Thường Kiệt)",
    description:
      "Phân bổ các khu vực nghiên cứu, văn phòng đại diện doanh nghiệp và hệ thống phòng họp thông minh tại tòa nhà mới...",
    date: "05/12/2023",
  },
];

type SortValue = "newest" | "oldest" | "title-asc" | "title-desc";

export default function PinnedPostsPage() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<SortValue>("newest");

  // Sort posts based on the current sort value
  const sortedPosts = useMemo(() => {
    const posts = [...MOCK_PINNED_POSTS];

    switch (sortBy) {
      case "newest":
        return posts.sort((a, b) => {
          const dateA = new Date(
            a.date.split("/").reverse().join("-")
          ).getTime();
          const dateB = new Date(
            b.date.split("/").reverse().join("-")
          ).getTime();
          return dateB - dateA;
        });
      case "oldest":
        return posts.sort((a, b) => {
          const dateA = new Date(
            a.date.split("/").reverse().join("-")
          ).getTime();
          const dateB = new Date(
            b.date.split("/").reverse().join("-")
          ).getTime();
          return dateA - dateB;
        });
      case "title-asc":
        return posts.sort((a, b) => a.title.localeCompare(b.title, "vi"));
      case "title-desc":
        return posts.sort((a, b) => b.title.localeCompare(a.title, "vi"));
      default:
        return posts;
    }
  }, [sortBy]);

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="p-4 sm:p-8 w-full">
        <div className="max-w-350 mx-auto">
          {/* Back Button */}
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="gap-1.5 text-primary hover:bg-muted h-auto px-3 py-1 text-sm font-semibold"
            >
              <ArrowLeft className="w-5 h-5" />
              Quay lại
            </Button>
          </div>

          {/* Header Section */}
          <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-2">
                Thông tin phổ biến được cập nhật thường xuyên
              </h1>
              <p className="text-sm text-muted-foreground">
                Danh sách các quy định và thông báo quan trọng được đính kèm cố
                định trong hệ thống Nexus.
              </p>
            </div>

            {/* Sort Controls */}
            <div className="flex items-end gap-6 w-full md:w-auto">
              <SortDropdown value={sortBy} onChange={(val) => setSortBy(val as SortValue)} />
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
                  {sortedPosts.length} Records
                </p>
              </div>
            </div>
          </div>

          {/* Posts List Container */}
          {sortedPosts.length > 0 ? (
            <>
              <div className="flex flex-col border border-border bg-card shadow-sm rounded overflow-hidden">
                <ItemGroup className="gap-0">
                  {sortedPosts.map((post) => (
                    <div
                      key={post.id}
                      className={`border-b border-border last:border-b-0`}
                    >
                      <PinnedPostCard
                        id={post.id}
                        category={post.category}
                        categoryColor={
                          CATEGORY_COLORS[post.category] || {
                            bg: "bg-slate-50",
                            border: "border-slate-200",
                            text: "text-slate-700",
                          }
                        }
                        title={post.title}
                        description={post.description}
                        date={post.date}
                        link={post.link}
                      />
                    </div>
                  ))}
                </ItemGroup>
              </div>

              {/* Footer Info */}
              <div className="mt-12 mb-8 flex items-center justify-center gap-3">
                <div className="h-px flex-1 bg-border"></div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono px-4">
                  End of Pinned Repository
                </p>
                <div className="h-px flex-1 bg-border"></div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-2">Không có bài ghim nào</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
