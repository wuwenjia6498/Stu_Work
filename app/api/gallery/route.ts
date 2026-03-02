/**
 * 图库 API —— 读取构建时预生成的 gallery-manifest.json
 *
 * 清单由 scripts/generate-gallery.js 生成：
 *   - 开发环境：npm run dev 前自动执行（predev 钩子）
 *   - 生产环境：npm run build 前自动执行（prebuild 钩子）
 *
 * 只读取单个 JSON 文件，不扫描 public/gallery/ 目录，
 * 避免 Vercel 将 371MB 图片打包进 Serverless Function（300MB 限制）。
 */

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// 生产环境启用内存缓存；开发环境每次读取最新清单（predev 已重新生成）
let cache: unknown = null;
const isDev = process.env.NODE_ENV === "development";

export async function GET() {
  if (!isDev && cache) {
    return NextResponse.json(cache);
  }

  try {
    const manifestPath = path.join(process.cwd(), "public", "gallery-manifest.json");
    const raw = await readFile(manifestPath, "utf-8");
    const data = JSON.parse(raw);
    if (!isDev) cache = data;
    return NextResponse.json(data);
  } catch (err) {
    console.error("图库清单读取失败：", err);
    return NextResponse.json([]);
  }
}
