"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app.store";
import { authService } from "@/services/auth-api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAppStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      // Nếu đã có user trong store, kiểm tra quyền
      if (user) {
        const isAdmin = user.roles.some((r) => r.name === "admin") || user.is_superuser;
        if (!isAdmin) {
          router.replace("/?error=admin_required");
        } else {
          if (mounted) setIsChecking(false);
        }
        return;
      }

      // Nếu chưa có user trong store, kiểm tra token trong cookie/localStorage
      const token = authService.getToken();
      if (!token) {
        router.replace("/auth?redirected=true");
        return;
      }

      // Nếu có token nhưng chưa có user trong store, thử gọi API lấy thông tin user
      try {
        const fetchedUser = await authService.me();
        const isAdmin = fetchedUser.roles.some((r) => r.name === "admin") || fetchedUser.is_superuser;
        if (!isAdmin) {
          router.replace("/?error=admin_required");
        } else {
          if (mounted) setIsChecking(false);
        }
      } catch {
        authService.logout();
        router.replace("/auth?error=expired");
      }
    };

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [user, router]);

  if (isChecking) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
