import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
});

export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
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
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
