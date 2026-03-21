import { Inter } from "next/font/google"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app.sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { AppHeader } from "@/components/app.header";

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="vi" className={inter.variable}>
			<body className="font-sans">
				<TooltipProvider>
					<SidebarProvider>
						<AppSidebar />
						<main>
              <AppHeader />
							{children}
						</main>
					</SidebarProvider>
				</TooltipProvider>
			</body>
		</html>
	);
}
