import { Be_Vietnam_Pro } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

const beVietnamPro = Be_Vietnam_Pro({ 
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
});

export default function NavigationLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
    </TooltipProvider>
  );
}
