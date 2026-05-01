import { AppSidebar } from "@/components/app.sidebar";
import { AppHeader } from "@/components/app.header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";
import { AgentProvider } from "@/contexts/agent-context";
import { AdminGuard } from "@/components/admin-guard";
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
      <body className="bg-background-light text-text-main font-display antialiased h-screen flex flex-col overflow-hidden relative">
        <TooltipProvider>
          <ReactQueryProvider>
            <AgentProvider>
              <SidebarProvider style={{ "--sidebar-width": "16.25rem" } as React.CSSProperties}>
                <AdminGuard>
                  <div className="flex flex-1 min-h-0 w-full">
                    <AppSidebar />
                    <main className="flex-1 flex flex-col min-w-0 bg-background-light">
                      <AppHeader />
                      <div className="flex-1 overflow-auto flex flex-col p-4 md:p-6 w-full mx-auto">
                        {children}
                      </div>
                    </main>
                  </div>
                </AdminGuard>
              </SidebarProvider>
            </AgentProvider>
          </ReactQueryProvider>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
