/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许更大的请求体（base64 图片较大，尤其多图 OCR）
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // 将 public/gallery 图片目录排除出所有 Serverless Function 的文件追踪
  // 图片作为静态资源由 Vercel CDN 托管，函数只需读取小体积的 gallery-manifest.json
  outputFileTracingExcludes: {
    "*": ["./public/gallery/**/*"],
  },
};

export default nextConfig;
