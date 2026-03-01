/**
 * 图库类型定义
 * ============================================================
 * 实际数据由 /api/gallery 自动扫描 public/gallery 目录生成，
 * 此文件仅保留 TypeScript 类型供前端组件引用。
 *
 * 目录约定：
 *   public/gallery/课程书目/{年级}/{序号-书名}/{图片}.webp
 *   public/gallery/看图写话/{图片}.webp
 * ============================================================
 */

/** 单张图库图片 */
export interface GalleryImage {
  /** 图片路径（相对于 public 目录） */
  src: string;
  /** 图片名称（显示在图库中） */
  name: string;
}

/** 书目（第三级） */
export interface GalleryBook {
  /** 书目 ID（唯一标识） */
  id: string;
  /** 书名（显示在下拉列表中） */
  label: string;
  /** 该书目下的图片列表 */
  images: GalleryImage[];
}

/** 年级（第二级，仅课程书目使用） */
export interface GalleryGrade {
  /** 年级 ID（唯一标识） */
  id: string;
  /** 年级名称（显示在 Tab 上） */
  label: string;
  /** 该年级下的书目列表 */
  books: GalleryBook[];
}

/** 图库分类（第一级） */
export interface GalleryCategory {
  /** 分类 ID（唯一标识） */
  id: string;
  /** 分类名称（显示在一级 Tab 上） */
  label: string;
  /** 直接图片列表（无层级结构时使用，如看图写话） */
  images?: GalleryImage[];
  /** 年级列表（课程书目使用，三级结构：年级 → 书名 → 图片） */
  grades?: GalleryGrade[];
}
