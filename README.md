# 老约翰学员习作展示海报生成器

一款面向**老约翰深度阅读**阅读馆老师的在线海报生成工具。  
老师只需在左侧表单中填入学员信息、习作正文和图片，右侧即可实时预览并一键下载排版精美的高清展示海报（PNG），方便分享到朋友圈或发给家长。

> 海报在浏览器端渲染（Canvas），文字与图片不上传到任何服务器（智能识别功能除外），孩子作品隐私有保障。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **双模板切换** | 「品牌橙红」和「简约留白」两套海报模板，一键切换，适配不同风格需求 |
| **Canvas 实时预览** | 表单内容变化时自动重绘海报，所见即所得 |
| **手写稿 OCR 识别** | 上传孩子手写稿照片（最多 5 张），调用 AI 大模型识别文字，弹窗核对后一键填入正文 |
| **AI 智能生成评语** | 根据习作内容自动生成 50–80 字的老师评语，可手动微调 |
| **图片裁切编辑器** | 上传插图/手写稿后进入裁切编辑器，支持拖拽平移、滚轮缩放、九宫格辅助线 |
| **内置插图图库** | 按「课程书目」（年级 → 书名 → 图片三级结构）和「看图写话」分类浏览，选图后直接进入裁切 |
| **高清 PNG 下载** | 输出 Retina 高清海报图，文件名自动包含学员姓名 |
| **生成历史记录** | 每次下载自动保存缩略图 + 数据快照到 localStorage（最多 20 条），可回溯加载 |
| **表单自动记忆** | 所有文字字段与二维码自动持久化到 localStorage，刷新页面不丢失 |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | [Next.js 14](https://nextjs.org/) (App Router) |
| 语言 | TypeScript + React 18 |
| 样式 | [Tailwind CSS 3.4](https://tailwindcss.com/) |
| UI 组件 | [shadcn/ui](https://ui.shadcn.com/)（Button / Card / Dialog / Input / Label / Textarea） |
| 通知 | [Sonner](https://sonner.emilkowal.dev/) Toast |
| AI 服务 | [AiHubMix](https://aihubmix.com/) API（OpenAI 兼容格式） — OCR: `gemini-2.0-flash`，评语: `gemini-2.5-pro` |
| 海报渲染 | 浏览器端 Canvas 2D |
| 图库清单 | 构建前脚本 `scripts/generate-gallery.js` 预生成 JSON，避免将图片打包进 Serverless Function |

---

## 项目结构

```
poster-generator/
├── app/
│   ├── api/
│   │   ├── ai/route.ts            # AI 接口（OCR + 评语生成）
│   │   └── gallery/route.ts       # 图库清单 API（读取预生成的 JSON）
│   ├── gallery-data.ts            # 图库 TypeScript 类型定义
│   ├── globals.css                # 全局样式（Tailwind 指令 + 自定义样式）
│   ├── layout.tsx                 # 根布局（Metadata + Toaster）
│   └── page.tsx                   # 主页面（表单 + Canvas 渲染 + 全部业务逻辑）
├── components/
│   ├── image-cropper.tsx          # 图片裁切编辑器组件
│   └── ui/                        # shadcn/ui 基础组件
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── sonner.tsx
│       └── textarea.tsx
├── lib/
│   └── utils.ts                   # cn() 工具函数（clsx + tailwind-merge）
├── public/
│   ├── gallery/                   # 插图图库（按分类/年级/书名组织）
│   │   ├── 课程书目/
│   │   │   ├── 一年级/ … 六年级/
│   │   │   │   └── {序号}-{书名}/  # 每本书一个文件夹，内含 .webp/.png 图片
│   │   └── 看图写话/              # 一级平铺图片
│   ├── gallery-manifest.json      # 构建时自动生成的图库清单
│   ├── logo.png                   # 经典模板 Logo
│   ├── logo01.png                 # 简约模板 Logo
│   └── logo-1.png                 # 页面标题 Logo
├── scripts/
│   └── generate-gallery.js        # 构建前预生成 gallery-manifest.json
├── .env.local                     # 环境变量（需手动创建，见下方说明）
├── .gitignore
├── next.config.mjs
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## 本地运行

### 1. 环境要求

- **Node.js** ≥ 18
- **npm**（或 pnpm / yarn）

### 2. 安装依赖

```bash
git clone <仓库地址>
cd poster-generator
npm install
```

### 3. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```env
# AI 服务 API Key（AiHubMix 平台申请）
# 用于手写稿 OCR 识别和智能生成评语功能
# 如不配置，其余功能均可正常使用，仅 AI 相关功能不可用
AIHUBMIX_API_KEY=your_api_key_here
```

> **获取方式：** 前往 [aihubmix.com](https://aihubmix.com/) 注册并获取 API Key。

### 4. 启动开发服务器

```bash
npm run dev
```

启动时会自动执行 `scripts/generate-gallery.js`（`predev` 钩子），扫描 `public/gallery/` 目录并生成图库清单。

浏览器访问 [http://localhost:3000](http://localhost:3000) 即可使用。

### 5. 生产构建

```bash
npm run build
npm start
```

构建前同样会自动生成图库清单（`prebuild` 钩子）。

---

## 图库管理

图库图片按以下目录结构放入 `public/gallery/` 即可自动识别：

```
public/gallery/
├── 课程书目/
│   ├── 一年级/
│   │   ├── 01-玩具岛梦幻之旅/
│   │   │   ├── 插图1.webp
│   │   │   └── 插图2.webp
│   │   └── 02-另一本书/
│   │       └── ...
│   ├── 二年级/
│   │   └── ...
│   └── ... (三至六年级)
└── 看图写话/
    ├── 图片1.webp
    └── 图片2.webp
```

- 书名文件夹命名格式：`序号-书名`（序号用于排序，书名自动提取并加书名号显示）
- 支持格式：`.webp` `.jpg` `.jpeg` `.png` `.gif` `.svg`
- 添加或删除图片后重启开发服务器即可生效

---

## License

本项目仅供老约翰阅读馆内部教学使用。
