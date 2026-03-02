/**
 * 图库 API
 *
 * 双模式策略：
 *   - 开发环境：实时扫描 public/gallery/ 目录，新增图片无需任何额外操作
 *   - 生产环境：读取 prebuild 阶段生成的 gallery-manifest.json（避免超出 Vercel 300MB 限制）
 */

import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";

const isDev = process.env.NODE_ENV === "development";
let prodCache: unknown = null;

const IMAGE_EXTS = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif", ".svg"]);

const GRADE_ORDER = [
  { id: "grade-1", dir: "一年级", label: "一年级" },
  { id: "grade-2", dir: "二年级", label: "二年级" },
  { id: "grade-3", dir: "三年级", label: "三年级" },
  { id: "grade-4", dir: "四年级", label: "四年级" },
  { id: "grade-5", dir: "五年级", label: "五年级" },
  { id: "grade-6", dir: "六年级", label: "六年级" },
];

async function isDirectory(p: string) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function safeReaddir(p: string) {
  try { return await readdir(p); } catch { return []; }
}

function extractOrder(dirName: string) {
  const m = dirName.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : 9999;
}

/** 扫描目录下的所有图片文件 */
async function scanImages(dirPath: string, urlPrefix: string) {
  const files = await safeReaddir(dirPath);
  return files
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && !f.startsWith("Thumbs"))
    .map((f) => ({ src: `${urlPrefix}/${f}`, name: path.parse(f).name }));
}

/** 扫描课程书目：年级 → 书名 → 图片 */
async function scanCourseBooks(galleryRoot: string) {
  const courseRoot = path.join(galleryRoot, "课程书目");
  const grades = [];

  for (const grade of GRADE_ORDER) {
    const gradeDir = path.join(courseRoot, grade.dir);
    if (!(await isDirectory(gradeDir))) {
      grades.push({ id: grade.id, label: grade.label, books: [] });
      continue;
    }

    const bookDirs = await safeReaddir(gradeDir);
    const bookEntries: { order: number; book: { id: string; label: string; images: { src: string; name: string }[] } }[] = [];

    for (const bd of bookDirs) {
      if (!(await isDirectory(path.join(gradeDir, bd)))) continue;
      const urlPrefix = `/gallery/课程书目/${grade.dir}/${bd}`;
      const images = await scanImages(path.join(gradeDir, bd), urlPrefix);
      if (images.length === 0) continue;

      const order = extractOrder(bd);
      bookEntries.push({
        order,
        book: {
          id: `${grade.id}-book-${order}`,
          label: `《${bd.replace(/^\d+-/, "")}》`,
          images,
        },
      });
    }

    bookEntries.sort((a, b) => a.order - b.order);
    grades.push({ id: grade.id, label: grade.label, books: bookEntries.map((e) => e.book) });
  }

  return { id: "course-books", label: "课程书目", grades };
}

/** 扫描看图写话：扁平图片列表 */
async function scanPictureWriting(galleryRoot: string) {
  const images = await scanImages(path.join(galleryRoot, "看图写话"), "/gallery/看图写话");
  return { id: "picture-writing", label: "看图写话", images };
}

/** 开发模式：实时扫描目录 */
async function scanGalleryLive() {
  const galleryRoot = path.join(process.cwd(), "public", "gallery");
  if (!(await isDirectory(galleryRoot))) return [];
  return [await scanCourseBooks(galleryRoot), await scanPictureWriting(galleryRoot)];
}

/** 生产模式：读取预生成清单（带缓存） */
async function readManifest() {
  if (prodCache) return prodCache;
  const raw = await readFile(path.join(process.cwd(), "public", "gallery-manifest.json"), "utf-8");
  prodCache = JSON.parse(raw);
  return prodCache;
}

export async function GET() {
  try {
    const data = isDev ? await scanGalleryLive() : await readManifest();
    return NextResponse.json(data);
  } catch (err) {
    console.error("图库数据获取失败：", err);
    return NextResponse.json([]);
  }
}
