import { Inter } from "next/font/google";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app.sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "@/app/globals.css";
import { AppHeader } from "@/components/app.header";
import { AgentProvider } from "@/contexts/agent-context";

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
});

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght@20..48,100..700;0,20..48,100..700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        <TooltipProvider>
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

            </SidebarProvider>
          </AgentProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
