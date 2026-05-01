import { Be_Vietnam_Pro } from "next/font/google";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app.sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import "@/app/globals.css";
import { AppHeader } from "@/components/app.header";
import { AgentProvider } from "@/contexts/agent-context";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";

const beVietnamPro = Be_Vietnam_Pro({ 
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
});

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        <TooltipProvider>
          <ReactQueryProvider>
            <AgentProvider>
              <SidebarProvider>
                
                <AppSidebar />
                
                <main className="flex flex-col flex-1 w-full min-w-0">
                  
                  <AppHeader />
                  
                  <div className="flex flex-1 overflow-hidden">
                    {children}
                  </div>
                  
                </main>

                <Toaster />
                <ConfirmProvider />

              </SidebarProvider>
            </AgentProvider>
          </ReactQueryProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
