import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/** 页面元信息 */
export const metadata: Metadata = {
  title: "老约翰学员习作展示海报生成器",
  description: "一键生成精美学员习作展示海报",
};

/** 根布局 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

