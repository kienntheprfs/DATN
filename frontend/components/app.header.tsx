"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

// TỪ ĐIỂN DỊCH URL SANG TIẾNG VIỆT (Tuỳ chọn)
// Ví dụ URL là /dashboard/settings thì nó sẽ hiện "Bảng điều khiển > Cấu hình hệ thống"
const routeDictionary: Record<string, string> = {
  "dashboard": "Bảng điều khiển",
  "history": "Lịch sử tra cứu",
  "settings": "Cấu hình hệ thống",
  "knowledge": "Kho văn bản",
  "navigation": "Tìm đường"
};

export function AppHeader() {
  // Lấy đường dẫn hiện tại (VD: "/history/123")
  const pathname = usePathname();
  
  // Tách URL thành mảng và loại bỏ các phần tử rỗng (VD: ["history", "123"])
  const pathSegments = pathname === "/" ? [] : pathname.split("/").filter((segment) => segment);

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-4">
      
      {/* Nút mở Sidebar */}
      <SidebarTrigger className="-ml-3" />

      {/* Đường kẻ dọc phân cách (tui thấy trong code cũ bạn import mà quên xài) */}
      <div className="mr-2 h-4 w-px bg-border" /> 

      <Breadcrumb>
        <BreadcrumbList>
          
          {/* LUÔN HIỂN THỊ TRANG CHỦ LÀM GỐC */}
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink asChild>
              <Link href="/">Trang chủ</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {/* VẼ CÁC NẤC TIẾP THEO DỰA VÀO URL */}
          {pathSegments.length > 0 && <BreadcrumbSeparator className="hidden md:block" />}
          
          {pathSegments.map((segment, index) => {
            // Tính toán đường dẫn cho thẻ Link (VD: "/history")
            const href = `/${pathSegments.slice(0, index + 1).join("/")}`;
            
            // Kiểm tra xem đây có phải là nấc cuối cùng không
            const isLast = index === pathSegments.length - 1;
            
            // Dịch tên URL sang tiếng Việt (nếu không có trong từ điển thì viết hoa chữ cái đầu)
            const title = routeDictionary[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

            return (
              <React.Fragment key={href}>
                <BreadcrumbItem>
                  {isLast ? (
                    // Nếu là nấc cuối -> Dùng BreadcrumbPage (chữ in đậm, không bấm được)
                    <BreadcrumbPage>{title}</BreadcrumbPage>
                  ) : (
                    // Nếu là nấc giữa -> Dùng BreadcrumbLink (chữ mờ, bấm vào chuyển trang)
                    <BreadcrumbLink asChild>
                      <Link href={href}>{title}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                
                {/* Thêm dấu '>' nếu chưa phải nấc cuối */}
                {!isLast && <BreadcrumbSeparator />}
              </React.Fragment>
            );
          })}

        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}