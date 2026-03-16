// app/layout.tsx
import './globals.css';
import { Inter } from 'next/font/google';
import Providers from "./providers";

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      </head>
      <body className={`${inter.className} bg-[#f6f7f8] dark:bg-[#101922] text-white`}>
        {children}
      </body>
    </html>
  );
}