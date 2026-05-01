import Link from "next/link";
import { Button } from "@/components/ui/button";
import "@/app/globals.css";

export default function GlobalNotFound() {
  return (
    <html lang="vi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <title>404 - Không tìm thấy trang</title>
      </head>
      <body className="bg-background-light text-text-main font-display antialiased">
        <div className="flex h-screen w-full flex-col items-center justify-center text-center p-4">
          <div className="flex flex-col items-center max-w-md">
            <h1 className="text-[120px] font-extrabold text-primary mb-4 leading-none tracking-tight drop-shadow-sm">
              404
            </h1>
            <h2 className="text-3xl font-bold text-text-main mb-4">
              Trang không tồn tại
            </h2>
            <p className="text-text-secondary text-lg mb-8 leading-relaxed">
              Rất tiếc, trang bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ bỏ. Vui lòng kiểm tra lại đường dẫn.
            </p>
            <Link href="/">
              <Button size="lg" className="font-semibold px-8 h-12 cursor-pointer shadow-md hover:shadow-lg transition-all">
                Quay lại trang chủ
              </Button>
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
