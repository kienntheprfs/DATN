import { Inter } from "next/font/google"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app.sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { AppHeader } from "@/components/app.header";
import { AgentProvider } from "@/contexts/agent-context";

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="font-sans">
        <TooltipProvider>
          <AgentProvider>
            <SidebarProvider>
              
              <AppSidebar />
              
              {/* THÊM CLASS VÀO THẺ MAIN Ở ĐÂY */}
              {/* flex-1: Chiếm hết khoảng trống còn lại */}
              {/* w-full: Rộng 100% phần không gian được chia */}
              {/* flex flex-col: Xếp Header ở trên, Nội dung ở dưới */}
              <main className="flex flex-1 flex-col w-full min-w-0">
                
                <AppHeader />
                
                {/* Vùng chứa các trang con */}
                <div className="flex-1 flex flex-col">
                  {children}
                </div>
                
              </main>

            </SidebarProvider>
          </AgentProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}