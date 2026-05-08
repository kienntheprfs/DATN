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
import { GlobalToast } from "@/components/global-toast";

const beVietnamPro = Be_Vietnam_Pro({ 
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
});

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <ReactQueryProvider>
        <AgentProvider>
          <SidebarProvider style={{ "--sidebar-width": "16.25rem" } as React.CSSProperties}>
            
            <AppSidebar />
            
            <main className="flex flex-col flex-1 w-full min-w-0">
              
              <AppHeader />
              
              <div className="flex flex-1 overflow-hidden">
                {children}
              </div>
              
            </main>

            <GlobalToast />
            <Toaster />
            <ConfirmProvider />

          </SidebarProvider>
        </AgentProvider>
      </ReactQueryProvider>
    </TooltipProvider>
  );
}
