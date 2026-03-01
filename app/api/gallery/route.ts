/**
 * 图库 API —— 读取构建时预生成的 gallery-manifest.json
 *
 * 清单由 scripts/generate-gallery.js 在 prebuild 阶段生成，
 * 存放在 public/gallery-manifest.json（作为静态文件部署）。
 *
 * 改用静态 JSON 的原因：
 *   - 避免 Serverless Function 在运行时扫描 public/gallery/
 *   - 防止 Vercel 把 371MB 的图片目录打包进函数 Bundle，超出 300MB 限制
 *   - 图片本身由 Vercel CDN 静态托管，函数只需返回清单
 */

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// 内存缓存，避免重复读取文件
let cache: unknown = null;

export async function GET() {
  if (cache) {
    return NextResponse.json(cache);
  }

  try {
    // 读取构建时生成的清单文件
    const manifestPath = path.join(process.cwd(), "public", "gallery-manifest.json");
    const raw = await readFile(manifestPath, "utf-8");
    cache = JSON.parse(raw);
    return NextResponse.json(cache);
  } catch (err) {
    console.error("图库清单读取失败：", err);
    // 降级返回空数组，前端会显示"暂无图片"
    return NextResponse.json([]);
  }
}
