"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Suspense } from "react";

function GlobalToastContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "admin_required") {
      toast.error("Bạn không có quyền truy cập trang quản trị!");
    } else if (error === "expired") {
      toast.error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại!");
    }
  }, [searchParams, pathname, router]);

  return null;
}

export function GlobalToast() {
  return (
    <Suspense fallback={null}>
      <GlobalToastContent />
    </Suspense>
  );
}
