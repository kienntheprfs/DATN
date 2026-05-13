"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/use-page-title";

function AuthCallbackContent() {
  usePageTitle();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    
    if (code) {
      const errorMsg = "Google OAuth callback cần backend xử lý. Vui lòng đăng nhập bằng email/password trước.";
      setError(errorMsg);
      toast.error("Đăng nhập Google thất bại", {
        description: errorMsg,
      });
    } else {
      const errorMsg = "Không nhận được mã xác thực từ Google.";
      setError(errorMsg);
      toast.error("Đăng nhập Google thất bại", {
        description: errorMsg,
      });
    }
  }, [searchParams]);

  return (
    <div className="text-center">
      {error ? (
        <>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push("/auth")}
            className="text-primary hover:underline"
          >
            Quay lại trang đăng nhập
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-text-secondary">Đang xử lý đăng nhập Google...</p>
        </>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light">
      <Suspense fallback={
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-text-secondary">Đang tải...</p>
        </div>
      }>
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
