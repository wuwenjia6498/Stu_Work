/**
 * 构建前预生成图库清单 JSON
 * 运行时机：npm run build 之前（prebuild 钩子）
 * 输出文件：public/gallery-manifest.json
 *
 * 这样 api/gallery 路由只需读取一个小 JSON，
 * 不会把 public/gallery/ 下的图片打包进 Serverless Function。
 */

const fs = require("fs");
const path = require("path");

const IMAGE_EXTS = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif", ".svg"]);

const GRADE_ORDER = [
  { id: "grade-1", dir: "一年级", label: "一年级" },
  { id: "grade-2", dir: "二年级", label: "二年级" },
  { id: "grade-3", dir: "三年级", label: "三年级" },
  { id: "grade-4", dir: "四年级", label: "四年级" },
  { id: "grade-5", dir: "五年级", label: "五年级" },
  { id: "grade-6", dir: "六年级", label: "六年级" },
];

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function safeReaddir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}

function extractOrder(dirName) {
  const m = dirName.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : 9999;
}

function extractBookName(dirName) {
  return dirName.replace(/^\d+-/, "");
}

function scanImages(dirPath, urlPrefix) {
  return safeReaddir(dirPath)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXTS.has(ext) && !f.startsWith("Thumbs");
    })
    .map((f) => ({
      src: `${urlPrefix}/${f}`,
      name: path.parse(f).name,
    }));
}

function scanCourseBooks(galleryRoot) {
  const courseRoot = path.join(galleryRoot, "课程书目");
  const grades = [];

  for (const grade of GRADE_ORDER) {
    const gradeDir = path.join(courseRoot, grade.dir);
    if (!isDir(gradeDir)) {
      grades.push({ id: grade.id, label: grade.label, books: [] });
      continue;
    }

    const bookDirs = safeReaddir(gradeDir);
    const bookEntries = [];

    for (const bd of bookDirs) {
      const bookPath = path.join(gradeDir, bd);
      if (!isDir(bookPath)) continue;

      const urlPrefix = `/gallery/课程书目/${grade.dir}/${bd}`;
      const images = scanImages(bookPath, urlPrefix);
      if (images.length === 0) continue;

      bookEntries.push({
        order: extractOrder(bd),
        book: {
          id: `${grade.id}-book-${extractOrder(bd)}`,
          label: `《${extractBookName(bd)}》`,
          images,
        },
      });
    }

    bookEntries.sort((a, b) => a.order - b.order);
    grades.push({ id: grade.id, label: grade.label, books: bookEntries.map((e) => e.book) });
  }

  return { id: "course-books", label: "课程书目", grades };
}

function scanPictureWriting(galleryRoot) {
  const pwRoot = path.join(galleryRoot, "看图写话");
  const images = scanImages(pwRoot, "/gallery/看图写话");
  return { id: "picture-writing", label: "看图写话", images };
}

function main() {
  const galleryRoot = path.join(process.cwd(), "public", "gallery");
  const outputPath = path.join(process.cwd(), "public", "gallery-manifest.json");

  if (!isDir(galleryRoot)) {
    console.warn("[generate-gallery] public/gallery 目录不存在，写入空清单");
    fs.writeFileSync(outputPath, JSON.stringify([]), "utf-8");
    return;
  }

  const courseBooks = scanCourseBooks(galleryRoot);
  const pictureWriting = scanPictureWriting(galleryRoot);
  const manifest = [courseBooks, pictureWriting];

  fs.writeFileSync(outputPath, JSON.stringify(manifest), "utf-8");
  console.log(`[generate-gallery] 清单已生成：${outputPath}`);

  // 统计数量
  let bookCount = 0;
  let imgCount = 0;
  for (const g of courseBooks.grades) {
    bookCount += g.books.length;
    for (const b of g.books) imgCount += b.images.length;
  }
  imgCount += pictureWriting.images.length;
  console.log(`[generate-gallery] 课程书目 ${bookCount} 本，共 ${imgCount} 张图片`);
}

main();
