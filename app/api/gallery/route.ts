/**
 * 图库 API —— 自动扫描 public/gallery 目录生成图库数据
 *
 * 目录约定：
 *   public/gallery/课程书目/{年级}/{序号-书名}/{图片}.webp
 *   public/gallery/看图写话/{图片}.webp
 *
 * 返回格式与前端 GalleryCategory[] 完全一致，前端无需额外转换。
 * 内置内存缓存，同一进程内首次扫描后直接返回缓存结果。
 */

import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";

// 支持的图片扩展名
const IMAGE_EXTS = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif", ".svg"]);

// 年级顺序配置（id → 目录名 → 显示名）
const GRADE_ORDER = [
  { id: "grade-1", dir: "一年级", label: "一年级" },
  { id: "grade-2", dir: "二年级", label: "二年级" },
  { id: "grade-3", dir: "三年级", label: "三年级" },
  { id: "grade-4", dir: "四年级", label: "四年级" },
  { id: "grade-5", dir: "五年级", label: "五年级" },
  { id: "grade-6", dir: "六年级", label: "六年级" },
];

// ---------- 内存缓存 ----------
let cache: unknown = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 开发环境 1 分钟刷新，生产环境可调大

/** 判断路径是否为目录 */
async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** 安全读取目录，不存在时返回空数组 */
async function safeReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
}

/** 从目录名提取排序序号，如 "3-一年级二班" → 3 */
function extractOrder(dirName: string): number {
  const m = dirName.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : 9999;
}

/** 从目录名提取书名，如 "3-一年级二班.最好的老师最好的班" → "一年级二班.最好的老师最好的班" */
function extractBookName(dirName: string): string {
  return dirName.replace(/^\d+-/, "");
}

/** 扫描单个目录下的图片文件 */
async function scanImages(
  dirPath: string,
  urlPrefix: string
): Promise<{ src: string; name: string }[]> {
  const files = await safeReaddir(dirPath);
  return files
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXTS.has(ext) && !f.startsWith("Thumbs");
    })
    .map((f) => ({
      src: `${urlPrefix}/${f}`,
      name: path.parse(f).name,
    }));
}

/** 扫描课程书目：按年级 → 书名 → 图片三级结构 */
async function scanCourseBooks(galleryRoot: string) {
  const courseRoot = path.join(galleryRoot, "课程书目");
  const grades = [];

  for (const grade of GRADE_ORDER) {
    const gradeDir = path.join(courseRoot, grade.dir);
    if (!(await isDir(gradeDir))) {
      grades.push({ id: grade.id, label: grade.label, books: [] });
      continue;
    }

    const bookDirs = await safeReaddir(gradeDir);
    const bookEntries = [];

    for (const bd of bookDirs) {
      const bookPath = path.join(gradeDir, bd);
      if (!(await isDir(bookPath))) continue;

      const urlPrefix = `/gallery/课程书目/${grade.dir}/${bd}`;
      const images = await scanImages(bookPath, urlPrefix);
      if (images.length === 0) continue;

      bookEntries.push({
        dirName: bd,
        order: extractOrder(bd),
        book: {
          id: `${grade.id}-book-${extractOrder(bd)}`,
          label: `《${extractBookName(bd)}》`,
          images,
        },
      });
    }

    bookEntries.sort((a, b) => a.order - b.order);

    grades.push({
      id: grade.id,
      label: grade.label,
      books: bookEntries.map((e) => e.book),
    });
  }

  return {
    id: "course-books",
    label: "课程书目",
    grades,
  };
}

/** 扫描看图写话：单层平铺结构 */
async function scanPictureWriting(galleryRoot: string) {
  const pwRoot = path.join(galleryRoot, "看图写话");
  const urlPrefix = "/gallery/看图写话";
  const images = await scanImages(pwRoot, urlPrefix);

  return {
    id: "picture-writing",
    label: "看图写话",
    images,
  };
}

/** 主扫描入口 */
async function scanGallery() {
  const galleryRoot = path.join(process.cwd(), "public", "gallery");
  const [courseBooks, pictureWriting] = await Promise.all([
    scanCourseBooks(galleryRoot),
    scanPictureWriting(galleryRoot),
  ]);
  return [courseBooks, pictureWriting];
}

export async function GET() {
  const now = Date.now();

  if (cache && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cache);
  }

  try {
    const data = await scanGallery();
    cache = data;
    cacheTime = now;
    return NextResponse.json(data);
  } catch (err) {
    console.error("图库扫描失败：", err);
    return NextResponse.json(
      { error: "图库扫描失败" },
      { status: 500 }
    );
  }
}
