import { Be_Vietnam_Pro } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import "@/app/globals.css";

const beVietnamPro = Be_Vietnam_Pro({ 
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
});

export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        src="https://accounts.google.com/gsi/client"
        async
        defer
      />
      <TooltipProvider>
        <Toaster />
        <ConfirmProvider />
        {children}
      </TooltipProvider>
    </>
  );
}
