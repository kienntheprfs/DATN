import { Inter } from "next/font/google";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app.sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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

            </SidebarProvider>
          </AgentProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
