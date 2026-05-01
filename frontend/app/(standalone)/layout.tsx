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
    <html lang="vi" className={beVietnamPro.variable}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <script
          src="https://accounts.google.com/gsi/client"
          async
          defer
        />
      </head>
      <body className="font-sans">
        <TooltipProvider>
          <Toaster />
          <ConfirmProvider />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
