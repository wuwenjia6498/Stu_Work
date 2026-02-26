"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Sonner Toast 容器组件
 * 在 layout.tsx 中引入，提供全局 Toast 通知能力
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      richColors
      toastOptions={{
        style: {
          fontSize: "14px",
        },
      }}
    />
  );
}
