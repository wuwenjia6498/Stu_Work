/**
 * 图库配置文件
 * ============================================================
 * 目录层级：
 *   一级分类（课程书目 / 看图写话 / 通用素材）
 *     └─ 年级（仅课程书目有，一年级 ~ 六年级）
 *         └─ 书名（每个年级 20-40 本书）
 *             └─ 图片列表
 *
 * 使用说明：
 * 1. 图片放入 public/gallery/{分类}/{年级}/{书名}/ 目录下
 * 2. 在下方配置中添加对应的图片信息
 * 3. 路径示例：/gallery/课程书目/一年级/玩具岛梦幻之旅/img1.jpg
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
  /** 直接图片列表（无层级结构时使用，如看图写话、通用素材） */
  images?: GalleryImage[];
  /** 年级列表（课程书目使用，三级结构：年级 → 书名 → 图片） */
  grades?: GalleryGrade[];
}

// ============================================================
// 图库数据
// ============================================================

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  {
    id: "course-books",
    label: "课程书目",
    grades: [
      {
        id: "grade-1",
        label: "一年级",
        books: [
          {
            id: "toy-island",
            label: "《玩具岛梦幻之旅》",
            images: [
              { src: "/gallery/课程书目/一年级/玩具岛梦幻之旅/sample-1.svg", name: "玩具岛插图 1" },
              { src: "/gallery/课程书目/一年级/玩具岛梦幻之旅/sample-2.svg", name: "玩具岛插图 2" },
              { src: "/gallery/课程书目/一年级/玩具岛梦幻之旅/sample-3.svg", name: "玩具岛插图 3" },
            ],
          },
          {
            id: "little-bear",
            label: "《小熊维尼历险记》",
            images: [
              { src: "/gallery/课程书目/一年级/小熊维尼历险记/sample-1.svg", name: "小熊维尼插图 1" },
              { src: "/gallery/课程书目/一年级/小熊维尼历险记/sample-2.svg", name: "小熊维尼插图 2" },
            ],
          },
          // 添加更多一年级书目...
        ],
      },
      {
        id: "grade-2",
        label: "二年级",
        books: [
          {
            id: "little-prince",
            label: "《小王子》",
            images: [
              { src: "/gallery/课程书目/二年级/小王子/sample-1.svg", name: "小王子插图 1" },
              { src: "/gallery/课程书目/二年级/小王子/sample-2.svg", name: "小王子插图 2" },
              { src: "/gallery/课程书目/二年级/小王子/sample-3.svg", name: "小王子插图 3" },
            ],
          },
          {
            id: "charlottes-web",
            label: "《夏洛的网》",
            images: [
              { src: "/gallery/课程书目/二年级/夏洛的网/sample-1.svg", name: "夏洛的网插图 1" },
              { src: "/gallery/课程书目/二年级/夏洛的网/sample-2.svg", name: "夏洛的网插图 2" },
              { src: "/gallery/课程书目/二年级/夏洛的网/sample-3.svg", name: "夏洛的网插图 3" },
            ],
          },
          // 添加更多二年级书目...
        ],
      },
      {
        id: "grade-3",
        label: "三年级",
        books: [
          // 添加三年级书目...
        ],
      },
      {
        id: "grade-4",
        label: "四年级",
        books: [
          // 添加四年级书目...
        ],
      },
      {
        id: "grade-5",
        label: "五年级",
        books: [
          // 添加五年级书目...
        ],
      },
      {
        id: "grade-6",
        label: "六年级",
        books: [
          // 添加六年级书目...
        ],
      },
    ],
  },
  {
    id: "picture-writing",
    label: "看图写话",
    images: [
      { src: "/gallery/看图写话/sample-pw-1.svg", name: "示例看图写话 1" },
      { src: "/gallery/看图写话/sample-pw-2.svg", name: "示例看图写话 2" },
      { src: "/gallery/看图写话/sample-pw-3.svg", name: "示例看图写话 3" },
    ],
  },
];
