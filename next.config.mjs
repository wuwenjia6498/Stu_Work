/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许更大的请求体（base64 图片较大，尤其多图 OCR）
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
