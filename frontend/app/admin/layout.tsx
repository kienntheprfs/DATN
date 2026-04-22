import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";
import { Toaster } from "@/components/ui/sonner";
import "@/app/globals.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-background-light text-text-main font-display antialiased h-screen flex overflow-hidden relative">
        <AdminSidebar />
        <main className="flex-1 flex flex-col min-w-0 bg-background-light">
          <AdminHeader />
          <div className="flex-1 overflow-auto flex flex-col p-4 md:p-6 w-full mx-auto">
            {children}
          </div>
        </main>
        <Toaster />
      </body>
    </html>
  );
}
