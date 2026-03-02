"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import ImageCropper from "@/components/image-cropper";
import type { GalleryCategory } from "./gallery-data";

// ============================================================
// 类型定义
// ============================================================

/** 海报数据状态接口 */
interface PosterData {
  readingRoom: string;       // 馆名
  studentInfo: string;       // 学员信息
  bookTitle: string;         // 书名
  mainTitle: string;         // 习作主标题
  content: string;           // 习作正文（支持 \n 换行）
  imageLeft: string | null;  // 左侧插图 base64
  imageRight: string | null; // 右侧手写稿 base64
  teacherName: string;       // 老师署名
  teacherComment: string;    // 老师评语
  qrCode: string | null;     // 底部二维码
  phone: string;             // 联系电话
  footerText: string;        // 底部引导文字
}

/** 历史记录条目接口 */
interface HistoryItem {
  id: string;               // 唯一标识
  timestamp: number;        // 生成时间戳
  thumbnail: string;        // 缩略图 base64（低质量，节省空间）
  posterData: PosterData;   // 海报数据快照
}

/** localStorage 存储键名 */
const HISTORY_KEY = "poster-generator-history";
/** 最大历史记录条数 */
const MAX_HISTORY = 20;

// ============================================================
// 常量配置
// ============================================================

/** 海报基准宽度 */
const POSTER_WIDTH = 750;
/** 海报主色（背景色） */
const THEME_COLOR = "#ff7670";
/** 海报内容区左右内边距 */
const PADDING_X = 40;
/** 白板圆角半径 */
const BOARD_RADIUS = 20;
/** 白板水平内边距 */
const BOARD_PADDING_X = 36;
/** 白板内可用文本宽度 */
const BOARD_TEXT_WIDTH = POSTER_WIDTH - PADDING_X * 2 - BOARD_PADDING_X * 2;

// ============================================================
// 主页面组件
// ============================================================

export default function PosterPage() {
  // ---- 模板样式状态：'classic' 品牌橙红 | 'minimalist' 简约留白 ----
  const [templateStyle, setTemplateStyle] = useState<'classic' | 'minimalist'>('classic');

  // ---- 使用指南弹窗状态 ----
  const [guideOpen, setGuideOpen] = useState(false);

  // ---- 海报数据状态（服务端/客户端统一用默认值，避免 Hydration 错误）----
  const [posterData, setPosterData] = useState<PosterData>({
    readingRoom: "宁波市区文化路老约翰阅读馆",
    studentInfo: "赵涵语（二年级）",
    bookTitle: "《玩具岛梦幻之旅》",
    mainTitle: "给爸爸妈妈的一封信",
    content:
      "亲爱的爸爸妈妈：\n这是我来狮子家的第二天。\n今天他们带我去大森林里探险啦！我学会了闻着气味找猎物，认出了哪种草有毒会扎人，还学着怎么用尖尖的爪子去扑小动物。\n一开始听到草丛里的怪声音我还挺害怕的，但现在慢慢习惯啦。我觉得狮子们真的好聪明、好勇敢！今天玩得超级开心，感觉自己也变厉害了！",
    imageLeft: "/pict.png",
    imageRight: "/pict01.png",
    teacherName: "老师评语：（老约翰阅读馆 萱萱老师）",
    teacherComment:
      "涵语，你真是一位想象力丰富又勇敢的探险家！习作不仅有闻气味、辨毒草这些生动的细节，更棒的是写出了自己从害怕到变厉害的心理成长。你的文字充满了力量，让老师也想跟着你去探险了！",
    qrCode: null,
    phone: "",
    footerText: "",
  });

  /** Canvas 引用 */
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ---- 图片裁切弹窗状态 ----
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<"imageLeft" | "imageRight" | "qrCode" | null>(null);

  // ---- 原始图片信息（裁切前），用于"重新编辑" ----
  const [originalImages, setOriginalImages] = useState<{
    imageLeft: string | null;
    imageRight: string | null;
  }>({ imageLeft: null, imageRight: null });
  const [fileNames, setFileNames] = useState<{
    imageLeft: string;
    imageRight: string;
  }>({ imageLeft: "", imageRight: "" });

  // ---- 历史记录状态 ----
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  // ---- OCR 识别相关状态 ----
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [ocrResult, setOcrResult] = useState("");

  // ---- AI 生成评语相关状态 ----
  const [commentLoading, setCommentLoading] = useState(false);

  // ---- 图库数据（从 API 动态加载） ----
  const [galleryCategories, setGalleryCategories] = useState<GalleryCategory[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  // ---- 图库选择弹窗状态 ----
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryTab, setGalleryTab] = useState("");   // 一级分类
  const [galleryGrade, setGalleryGrade] = useState("");   // 二级：年级
  const [galleryBook, setGalleryBook] = useState("");     // 三级：书名

  const ocrInputRef = useRef<HTMLInputElement>(null);
  const replaceLeftRef = useRef<HTMLInputElement>(null);
  const replaceRightRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // 工具函数：多行文本折行计算
  // ============================================================

  const wrapText = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      text: string,
      maxWidth: number,
      lineHeight: number
    ): { lines: string[]; height: number } => {
      const result: string[] = [];
      const paragraphs = text.split("\n");

      for (const para of paragraphs) {
        if (para === "") {
          result.push("");
          continue;
        }
        let currentLine = "";
        for (let i = 0; i < para.length; i++) {
          const testLine = currentLine + para[i];
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && currentLine !== "") {
            result.push(currentLine);
            currentLine = para[i];
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          result.push(currentLine);
        }
      }

      return {
        lines: result,
        height: result.length * lineHeight,
      };
    },
    []
  );

  // ============================================================
  // 辅助绘制函数
  // ============================================================

  /** 绘制圆角矩形路径 */
  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    w: number, h: number,
    r: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // ============================================================
  // Canvas 主绘制逻辑
  // ============================================================

  const drawPoster = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2;

    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    const imagePromises: Record<string, Promise<HTMLImageElement>> = {};
    imagePromises["logo"] = loadImage("/logo.png");
    imagePromises["logo01"] = loadImage("/logo01.png");
    if (posterData.imageLeft)  imagePromises["left"]  = loadImage(posterData.imageLeft);
    if (posterData.imageRight) imagePromises["right"] = loadImage(posterData.imageRight);
    if (posterData.qrCode)     imagePromises["qr"]    = loadImage(posterData.qrCode);

    const imageKeys = Object.keys(imagePromises);
    const imageValues = await Promise.all(imageKeys.map(k => imagePromises[k].catch(() => null)));
    const images: Record<string, HTMLImageElement | null> = {};
    imageKeys.forEach((k, i) => { images[k] = imageValues[i]; });

    // ------ 公共预计算参数 ------
    const hasLeft = !!images["left"];
    const hasRight = !!images["right"];
    const imageMaxHeight = 300;
    const offCanvas = document.createElement("canvas");
    offCanvas.width = 1; offCanvas.height = 1;
    const offCtx = offCanvas.getContext("2d")!;

    // ====================================================================
    // 经典粉红模板 (classic)
    // ====================================================================
    if (templateStyle === 'classic') {

    const headerHeight = 334;
    const headerBoardGap = 6;
    const boardPaddingTop = 36;
    const boardPaddingBottom = 36;
    const titleFontSize = 32;
    const titleLineHeight = 46;
    const contentFontSize = 26;
    const contentLineHeight = 44;

    offCtx.font = `bold ${titleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const titleWrapped = wrapText(offCtx, posterData.mainTitle, BOARD_TEXT_WIDTH, titleLineHeight);
    const titleContentGap = 16;

    offCtx.font = `${contentFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const contentWrapped = wrapText(offCtx, posterData.content, BOARD_TEXT_WIDTH, contentLineHeight);

    const contentImageGap = 24;
    let imageAreaHeight = 0;
    if (hasLeft || hasRight) {
      imageAreaHeight = imageMaxHeight + contentImageGap * 2;
    }

    const imageCommentGap = (hasLeft || hasRight) ? 8 : 16;
    const commentTitleFontSize = 27;
    const commentTitleLineHeight = 41;
    const commentFontSize = 23;
    const commentLineHeight = 39;

    offCtx.font = `bold ${commentTitleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const commentTitleWrapped = wrapText(offCtx, posterData.teacherName, BOARD_TEXT_WIDTH, commentTitleLineHeight);
    offCtx.font = `${commentFontSize}px "SimSun","STSong","Songti SC",serif`;
    const commentWrapped = wrapText(offCtx, posterData.teacherComment, BOARD_TEXT_WIDTH, commentLineHeight);
    const commentGap = 6;

    const boardH =
      boardPaddingTop +
      titleWrapped.height + titleContentGap +
      contentWrapped.height +
      imageAreaHeight +
      imageCommentGap +
      commentTitleWrapped.height + commentGap +
      commentWrapped.height +
      boardPaddingBottom;

    const boardFooterGap = 24;
    const footerHeight = 160;
    const totalHeight = headerHeight + headerBoardGap + boardH + boardFooterGap + footerHeight + 20;

    canvas.width = POSTER_WIDTH * dpr;
    canvas.height = totalHeight * dpr;
    const viewportH = window.innerHeight;
    const availableH = viewportH - 140;
    const scale = Math.min(1, availableH / totalHeight);
    canvas.style.width = `${POSTER_WIDTH * scale}px`;
    canvas.style.height = `${totalHeight * scale}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = THEME_COLOR;
    ctx.fillRect(0, 0, POSTER_WIDTH, totalHeight);

    let curY = 72;
    const logoW = 260;
    const logoH = 100;
    const logoX = PADDING_X;
    const logoY = curY;
    if (images["logo"]) {
      ctx.drawImage(images["logo"], logoX, logoY, logoW, logoH);
    }

    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 28px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillText("习作分享", POSTER_WIDTH - PADDING_X, curY + 16);
    ctx.textAlign = "left";

    const infoY = logoY + logoH + 20;
    const labelFontSize = 27;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `${labelFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textBaseline = "top";

    const infoX = PADDING_X + 8;
    const infoLineH = 42;

    // 辅助函数：标签加粗 + 内容正常，同行绘制
    const drawInfoLine = (label: string, value: string, x: number, y: number, fontSize: number) => {
      ctx.font = `bold ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillText(label, x, y);
      const labelW = ctx.measureText(label).width;
      ctx.font = `${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillText(value, x + labelW, y);
    };

    drawInfoLine("\u9986\u3000\u540d\uff1a", posterData.readingRoom, infoX, infoY, labelFontSize);
    drawInfoLine("\u5b66\u3000\u5458\uff1a", posterData.studentInfo, infoX, infoY + infoLineH, labelFontSize);
    if (posterData.bookTitle.trim()) {
      drawInfoLine("\u4e66\u3000\u76ee\uff1a", posterData.bookTitle, infoX, infoY + infoLineH * 2, labelFontSize);
    } else {
      ctx.font = `bold 36px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillText(`\u770b\u56fe\u5199\u8bdd`, infoX, infoY + infoLineH * 2 + 10);
      ctx.font = `${labelFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    }

    curY = headerHeight;

    const boardX = PADDING_X;
    const boardY = curY + headerBoardGap;
    const boardW = POSTER_WIDTH - PADDING_X * 2;

    ctx.fillStyle = "#FFFFFF";
    drawRoundRect(ctx, boardX, boardY, boardW, boardH, BOARD_RADIUS);
    ctx.fill();

    let drawY = boardY + boardPaddingTop;
    const drawX = boardX + BOARD_PADDING_X;

    ctx.fillStyle = "#222222";
    ctx.font = `bold ${titleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = "center";
    for (const line of titleWrapped.lines) {
      ctx.fillText(line, POSTER_WIDTH / 2, drawY);
      drawY += titleLineHeight;
    }
    ctx.textAlign = "left";

    drawY += 4;
    ctx.strokeStyle = THEME_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(POSTER_WIDTH / 2 - 30, drawY);
    ctx.lineTo(POSTER_WIDTH / 2 + 30, drawY);
    ctx.stroke();
    drawY += titleContentGap;

    ctx.fillStyle = "#333333";
    ctx.font = `${contentFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    for (const line of contentWrapped.lines) {
      if (line === "") {
        drawY += contentLineHeight * 0.4;
      } else {
        ctx.fillText(line, drawX, drawY);
        drawY += contentLineHeight;
      }
    }

    if (hasLeft || hasRight) {
      drawY += contentImageGap;
      const imgAreaW = boardW - BOARD_PADDING_X * 2;
      const imgAreaX = drawX;

      if (hasLeft && hasRight) {
        const imgH = imageMaxHeight;
        const circleDiameter = 340;
        const circleBorder = 8;
        const circleRadius = circleDiameter / 2;
        const circleOverflow = 80;
        const circleCX = boardX + boardW - circleRadius + circleOverflow;
        const circleCY = drawY + imgH / 2;

        const gap = 16;
        const circleVisibleW = circleDiameter - circleOverflow;
        const leftW = imgAreaW - circleVisibleW - gap + BOARD_PADDING_X;

        if (images["left"]) {
          ctx.save();
          drawRoundRect(ctx, imgAreaX, drawY, leftW, imgH, 12);
          ctx.clip();
          const lImg = images["left"];
          const s = Math.max(leftW / lImg.width, imgH / lImg.height) * 0.85;
          ctx.drawImage(lImg,
            imgAreaX + (leftW - lImg.width * s) / 2,
            drawY + (imgH - lImg.height * s) / 2,
            lImg.width * s, lImg.height * s
          );
          ctx.restore();
        }

        if (images["right"]) {
          const rImg = images["right"];
          ctx.beginPath();
          ctx.arc(circleCX, circleCY, circleRadius, 0, Math.PI * 2);
          ctx.fillStyle = THEME_COLOR;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(circleCX, circleCY, circleRadius - circleBorder, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();

          const clipR = circleRadius - circleBorder - 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(circleCX, circleCY, clipR, 0, Math.PI * 2);
          ctx.clip();
          const rs = Math.max((clipR * 2) / rImg.width, (clipR * 2) / rImg.height);
          ctx.drawImage(rImg,
            circleCX - (rImg.width * rs) / 2,
            circleCY - (rImg.height * rs) / 2,
            rImg.width * rs, rImg.height * rs
          );
          ctx.restore();
        }
      } else {
        const singleImg = images["left"] || images["right"];
        if (singleImg) {
          const maxW = imgAreaW * 0.65;
          const imgH = imageMaxHeight;
          const s = Math.min(maxW / singleImg.width, imgH / singleImg.height);
          const dw = singleImg.width * s;
          const dh = singleImg.height * s;
          const cx = imgAreaX + (imgAreaW - dw) / 2;

          ctx.save();
          drawRoundRect(ctx, cx, drawY, dw, dh, 12);
          ctx.clip();
          ctx.drawImage(singleImg, cx, drawY, dw, dh);
          ctx.restore();

          ctx.strokeStyle = "#eee";
          ctx.lineWidth = 2;
          drawRoundRect(ctx, cx, drawY, dw, dh, 12);
          ctx.stroke();
        }
      }
      drawY += imageMaxHeight + contentImageGap;
    }

    drawY += imageCommentGap;
    ctx.fillStyle = "#111111";
    ctx.font = `bold ${commentTitleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    for (const line of commentTitleWrapped.lines) {
      ctx.fillText(line, drawX, drawY);
      drawY += commentTitleLineHeight;
    }
    drawY += commentGap;

    ctx.fillStyle = "#333333";
    ctx.font = `${commentFontSize}px "FangSong","STFangsong","仿宋",serif`;
    for (const line of commentWrapped.lines) {
      ctx.fillText(line, drawX, drawY);
      drawY += commentLineHeight;
    }

    const footerY = boardY + boardH + boardFooterGap;
    const qrSize = 110;
    const qrX = PADDING_X + 10;
    const qrY = footerY;

    if (images["qr"]) {
      ctx.fillStyle = "#fff";
      drawRoundRect(ctx, qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 8);
      ctx.fill();
      ctx.drawImage(images["qr"], qrX, qrY, qrSize, qrSize);
    } else {
      ctx.fillStyle = "#fff";
      drawRoundRect(ctx, qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 8);
      ctx.fill();
      ctx.fillStyle = "#ccc";
      ctx.font = `14px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("二维码", qrX + qrSize / 2, qrY + qrSize / 2 + 4);
      ctx.textAlign = "left";
    }

    const textRightX = qrX + qrSize + 24;
    const qrBottom = qrY + qrSize;
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "bottom";
    ctx.font = `22px "PingFang SC","Microsoft YaHei",sans-serif`;
    const contactLines = posterData.phone.split("\n").filter(Boolean);
    const lineH = 32;
    for (let i = contactLines.length - 1; i >= 0; i--) {
      const offsetY = qrBottom - (contactLines.length - 1 - i) * lineH;
      ctx.fillText(contactLines[i], textRightX, offsetY);
    }

    // ====================================================================
    // 简约留白模板 (minimalist)
    // ====================================================================
    } else {

    const M_OUTER_PAD = 20;       // 外层浅灰与白板的边距
    const M_CARD_RADIUS = 16;     // 白色卡片圆角
    const M_INNER_PAD_X = 40;     // 白板内左右内边距
    const M_INNER_PAD_TOP = 36;   // 白板内顶部内边距
    const M_TEXT_WIDTH = POSTER_WIDTH - M_OUTER_PAD * 2 - M_INNER_PAD_X * 2;

    // -- 预计算各文本区块高度 --
    const mTitleFontSize = 40;
    const mTitleLineHeight = 56;
    const mContentFontSize = 26;
    const mContentLineHeight = 44;
    const mCommentTitleFontSize = 27;
    const mCommentTitleLineHeight = 41;
    const mCommentFontSize = 23;
    const mCommentLineHeight = 39;

    offCtx.font = `bold ${mTitleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const mTitleWrapped = wrapText(offCtx, posterData.mainTitle, M_TEXT_WIDTH, mTitleLineHeight);

    offCtx.font = `${mContentFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const mContentWrapped = wrapText(offCtx, posterData.content, M_TEXT_WIDTH, mContentLineHeight);

    offCtx.font = `bold ${mCommentTitleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const mCommentTitleWrapped = wrapText(offCtx, posterData.teacherName, M_TEXT_WIDTH, mCommentTitleLineHeight);

    offCtx.font = `${mCommentFontSize}px "FangSong","STFangsong","仿宋",serif`;
    const mCommentWrapped = wrapText(offCtx, posterData.teacherComment, M_TEXT_WIDTH, mCommentLineHeight);

    // -- 头部信息区高度（Logo + 标签 + 三行信息）--
    const mLogoH = 100;             // Logo 高度
    const mLogoBottomGap = 16;      // Logo 与标签间距
    const mHeaderTagH = 36;          // 胶囊标签高度
    const mHeaderTagBottom = 16;     // 标签与信息间距
    const mInfoLineH = 40;
    const mHeaderInfoH = mInfoLineH * 3;
    const mHeaderBottomGap = 24;     // 头部与主标题间距
    const mHeaderTotalH = M_INNER_PAD_TOP + mLogoH + mLogoBottomGap + mHeaderTagH + mHeaderTagBottom + mHeaderInfoH + mHeaderBottomGap;

    // -- 正文区 --
    const mTitleContentGap = 20;
    const mContentImageGap = 24;
    let mImageAreaHeight = 0;
    if (hasLeft || hasRight) {
      mImageAreaHeight = imageMaxHeight + mContentImageGap * 2;
    }

    // -- 评语区 --
    const mImageCommentGap = (hasLeft || hasRight) ? 12 : 20;
    const mCommentGap = 8;

    // -- 分隔线 --
    const mDividerGap = 16;

    // -- 底部信息区 --
    const mFooterHeight = 110;
    const mFooterTopGap = 12;

    // -- 白板总高度 --
    const mCardH =
      mHeaderTotalH +
      mTitleWrapped.height + mTitleContentGap +
      mContentWrapped.height +
      mImageAreaHeight +
      mImageCommentGap +
      mDividerGap * 2 + 2 +
      mCommentTitleWrapped.height + mCommentGap +
      mCommentWrapped.height +
      mFooterTopGap +
      mDividerGap * 2 + 2 +
      mFooterHeight +
      16;

    const mTotalHeight = M_OUTER_PAD * 2 + mCardH;

    canvas.width = POSTER_WIDTH * dpr;
    canvas.height = mTotalHeight * dpr;
    const viewportH = window.innerHeight;
    const availableH = viewportH - 140;
    const scale = Math.min(1, availableH / mTotalHeight);
    canvas.style.width = `${POSTER_WIDTH * scale}px`;
    canvas.style.height = `${mTotalHeight * scale}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Step 1: 浅灰背景
    ctx.fillStyle = "#F5F5F5";
    ctx.fillRect(0, 0, POSTER_WIDTH, mTotalHeight);

    // Step 2: 白色圆角卡片底板
    const cardX = M_OUTER_PAD;
    const cardY = M_OUTER_PAD;
    const cardW = POSTER_WIDTH - M_OUTER_PAD * 2;
    ctx.fillStyle = "#FFFFFF";
    drawRoundRect(ctx, cardX, cardY, cardW, mCardH, M_CARD_RADIUS);
    ctx.fill();

    let drawY = cardY + M_INNER_PAD_TOP;
    const drawX = cardX + M_INNER_PAD_X;
    const drawRight = cardX + cardW - M_INNER_PAD_X;
    ctx.textBaseline = "top";

    // Step 3: 头部信息区
    // 右上角 Logo（简约模板使用 logo01.png，尺寸与经典模板一致）
    const logoH = 100;
    const logoW = 260;
    if (images["logo01"]) {
      const logoImg = images["logo01"];
      ctx.drawImage(logoImg, drawRight - logoW, drawY - 8, logoW, logoH);
    }

    // Logo 下方留间距后再绘制标签和信息
    drawY += logoH + 16;

    // 粉红胶囊标签"习作分享"
    const tagText = "习作分享";
    const tagFontSize = 20;
    const tagPadX = 20;
    const tagH = mHeaderTagH;
    ctx.font = `bold ${tagFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const tagTextW = ctx.measureText(tagText).width;
    const tagW = tagTextW + tagPadX * 2;
    const tagRadius = tagH / 2;

    ctx.fillStyle = "#FF7A84";
    drawRoundRect(ctx, drawX, drawY, tagW, tagH, tagRadius);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(tagText, drawX + tagPadX, drawY + (tagH - tagFontSize) / 2);

    drawY += tagH + mHeaderTagBottom;

    // 左侧三行信息（标签加粗，内容正常字重）
    const mLabelFontSize = 25;
    ctx.fillStyle = "#333333";

    const drawMInfoLine = (label: string, value: string, x: number, y: number, fontSize: number) => {
      ctx.font = `bold ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillStyle = "#333333";
      ctx.fillText(label, x, y);
      const labelW = ctx.measureText(label).width;
      ctx.font = `${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillText(value, x + labelW, y);
    };

    drawMInfoLine("\u9986\u3000\u540d\uff1a", posterData.readingRoom, drawX, drawY, mLabelFontSize);
    drawY += mInfoLineH;
    drawMInfoLine("\u5b66\u3000\u5458\uff1a", posterData.studentInfo, drawX, drawY, mLabelFontSize);
    drawY += mInfoLineH;
    if (posterData.bookTitle.trim()) {
      drawMInfoLine("\u4e66\u3000\u76ee\uff1a", posterData.bookTitle, drawX, drawY, mLabelFontSize);
    } else {
      ctx.font = `bold 32px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillStyle = "#333333";
      ctx.fillText(`\u770b\u56fe\u5199\u8bdd`, drawX, drawY);
    }
    drawY += mInfoLineH + mHeaderBottomGap;

    // Step 4: 主标题（居中，粉红色，大号加粗）
    ctx.fillStyle = "#FF7A84";
    ctx.font = `bold ${mTitleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = "center";
    for (const line of mTitleWrapped.lines) {
      ctx.fillText(line, POSTER_WIDTH / 2, drawY);
      drawY += mTitleLineHeight;
    }
    ctx.textAlign = "left";
    drawY += mTitleContentGap;

    // Step 5: 正文（深灰色，左对齐）
    ctx.fillStyle = "#555555";
    ctx.font = `${mContentFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    for (const line of mContentWrapped.lines) {
      if (line === "") {
        drawY += mContentLineHeight * 0.4;
      } else {
        ctx.fillText(line, drawX, drawY);
        drawY += mContentLineHeight;
      }
    }

    // Step 6: 图片区（尺寸与经典模板保持一致）
    if (hasLeft || hasRight) {
      drawY += mContentImageGap;
      // 使用与经典模板相同的图片区宽度参数
      const classicBoardW = POSTER_WIDTH - PADDING_X * 2;
      const imgAreaW = classicBoardW - BOARD_PADDING_X * 2;
      const imgAreaX = drawX;

      if (hasLeft && hasRight) {
        const imgH = imageMaxHeight;
        const circleDiameter = 340;
        const circleBorder = 8;
        const circleRadius = circleDiameter / 2;
        const circleOverflow = 80;
        const circleCX = cardX + cardW - circleRadius + circleOverflow;
        const circleCY = drawY + imgH / 2;

        const gap = 16;
        const circleVisibleW = circleDiameter - circleOverflow;
        const leftW = imgAreaW - circleVisibleW - gap + BOARD_PADDING_X;

        if (images["left"]) {
          ctx.save();
          drawRoundRect(ctx, imgAreaX, drawY, leftW, imgH, 12);
          ctx.clip();
          const lImg = images["left"];
          const s = Math.max(leftW / lImg.width, imgH / lImg.height) * 0.85;
          ctx.drawImage(lImg,
            imgAreaX + (leftW - lImg.width * s) / 2,
            drawY + (imgH - lImg.height * s) / 2,
            lImg.width * s, lImg.height * s
          );
          ctx.restore();
        }

        if (images["right"]) {
          const rImg = images["right"];
          ctx.beginPath();
          ctx.arc(circleCX, circleCY, circleRadius, 0, Math.PI * 2);
          ctx.fillStyle = "#E8E8E8";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(circleCX, circleCY, circleRadius - circleBorder, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();

          const clipR = circleRadius - circleBorder - 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(circleCX, circleCY, clipR, 0, Math.PI * 2);
          ctx.clip();
          const rs = Math.max((clipR * 2) / rImg.width, (clipR * 2) / rImg.height);
          ctx.drawImage(rImg,
            circleCX - (rImg.width * rs) / 2,
            circleCY - (rImg.height * rs) / 2,
            rImg.width * rs, rImg.height * rs
          );
          ctx.restore();
        }
      } else {
        const singleImg = images["left"] || images["right"];
        if (singleImg) {
          const maxW = imgAreaW * 0.65;
          const imgH = imageMaxHeight;
          const s = Math.min(maxW / singleImg.width, imgH / singleImg.height);
          const dw = singleImg.width * s;
          const dh = singleImg.height * s;
          const cx = imgAreaX + (imgAreaW - dw) / 2;

          ctx.save();
          drawRoundRect(ctx, cx, drawY, dw, dh, 12);
          ctx.clip();
          ctx.drawImage(singleImg, cx, drawY, dw, dh);
          ctx.restore();

          ctx.strokeStyle = "#eee";
          ctx.lineWidth = 2;
          drawRoundRect(ctx, cx, drawY, dw, dh, 12);
          ctx.stroke();
        }
      }
      drawY += imageMaxHeight + mContentImageGap;
    }

    // Step 7: 分隔线 + 评语区
    drawY += mImageCommentGap;
    ctx.strokeStyle = "#E8E8E8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(drawX, drawY);
    ctx.lineTo(drawRight, drawY);
    ctx.stroke();
    drawY += mDividerGap;

    // 评语标题加粗 + 红色下划点缀
    ctx.fillStyle = "#333333";
    ctx.font = `bold ${mCommentTitleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    for (const line of mCommentTitleWrapped.lines) {
      ctx.fillText(line, drawX, drawY);
      drawY += mCommentTitleLineHeight;
    }
    drawY += mCommentGap;

    // 评语正文
    ctx.fillStyle = "#555555";
    ctx.font = `${mCommentFontSize}px "FangSong","STFangsong","仿宋",serif`;
    for (const line of mCommentWrapped.lines) {
      ctx.fillText(line, drawX, drawY);
      drawY += mCommentLineHeight;
    }

    // Step 8: 分隔线 + 底部信息区
    drawY += mFooterTopGap;
    ctx.strokeStyle = "#E8E8E8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(drawX, drawY);
    ctx.lineTo(drawRight, drawY);
    ctx.stroke();
    drawY += mDividerGap;

    const qrSize = 100;
    const qrX = drawX;
    const qrY = drawY;

    if (images["qr"]) {
      ctx.drawImage(images["qr"], qrX, qrY, qrSize, qrSize);
    } else {
      ctx.fillStyle = "#F0F0F0";
      drawRoundRect(ctx, qrX, qrY, qrSize, qrSize, 8);
      ctx.fill();
      ctx.fillStyle = "#bbb";
      ctx.font = `14px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("二维码", qrX + qrSize / 2, qrY + qrSize / 2 + 4);
      ctx.textAlign = "left";
    }

    const textRightX = qrX + qrSize + 24;
    const qrBottom = qrY + qrSize;
    ctx.fillStyle = "#333333";
    ctx.textBaseline = "bottom";
    ctx.font = `22px "PingFang SC","Microsoft YaHei",sans-serif`;
    const contactLines = posterData.phone.split("\n").filter(Boolean);
    const lineH = 32;
    for (let i = contactLines.length - 1; i >= 0; i--) {
      const offsetY = qrBottom - (contactLines.length - 1 - i) * lineH;
      ctx.fillText(contactLines[i], textRightX, offsetY);
    }

    } // end of minimalist template

    } catch (err) {
      console.error("海报绘制出错：", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterData, wrapText, templateStyle]);

  useEffect(() => {
    drawPoster();
  }, [drawPoster]);

  // ============================================================
  // 图片上传处理
  // ============================================================

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "imageLeft" | "imageRight" | "qrCode"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (field === "imageLeft" || field === "imageRight") {
        setOriginalImages(prev => ({ ...prev, [field]: base64 }));
        setFileNames(prev => ({ ...prev, [field]: file.name }));
        setCropImage(base64);
        setCropTarget(field);
      } else {
        setPosterData(prev => ({ ...prev, [field]: base64 }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleReEdit = async (field: "imageLeft" | "imageRight") => {
    let src = originalImages[field];
    if (!src) {
      // 回退：使用当前 posterData 中的图片
      const currentSrc = posterData[field];
      if (!currentSrc) return;
      // 如果是 URL（非 base64），先转为 base64 供裁切编辑器使用
      if (!currentSrc.startsWith("data:")) {
        try {
          const response = await fetch(currentSrc);
          const blob = await response.blob();
          src = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          // 同时存入 originalImages，后续重新编辑无需再次转换
          setOriginalImages(prev => ({ ...prev, [field]: src }));
        } catch {
          return;
        }
      } else {
        src = currentSrc;
        setOriginalImages(prev => ({ ...prev, [field]: src }));
      }
    }
    setCropImage(src);
    setCropTarget(field);
  };

  const handleClearImage = (field: "imageLeft" | "imageRight") => {
    setPosterData(prev => ({ ...prev, [field]: null }));
    setOriginalImages(prev => ({ ...prev, [field]: null }));
    setFileNames(prev => ({ ...prev, [field]: "" }));
  };

  const handleCropConfirm = (croppedBase64: string) => {
    if (cropTarget) {
      setPosterData(prev => ({ ...prev, [cropTarget]: croppedBase64 }));
    }
    setCropImage(null);
    setCropTarget(null);
  };

  const handleCropCancel = () => {
    setCropImage(null);
    setCropTarget(null);
  };

  // ============================================================
  // 图库选择：选中后进入裁切流程
  // ============================================================

  const handleGallerySelect = (imageSrc: string, imageName: string) => {
    // 关闭图库弹窗
    setGalleryOpen(false);
    // 记录文件名
    setFileNames(prev => ({ ...prev, imageLeft: imageName }));
    // 保存原始图片（用于重新编辑）
    setOriginalImages(prev => ({ ...prev, imageLeft: imageSrc }));
    // 打开裁切弹窗
    setCropImage(imageSrc);
    setCropTarget("imageLeft");
  };

  // ============================================================
  // 历史记录：初始化加载
  // ============================================================

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      console.warn("读取历史记录失败");
    }
  }, []);

  // 标记是否已从 localStorage 完成恢复，防止初始化时保存 effect 用默认值覆盖已存数据
  const prefsRestored = useRef(false);

  // 客户端挂载后，从 localStorage 恢复所有文字字段和二维码（图片因体积大不保存）
  useEffect(() => {
    try {
      const saved = localStorage.getItem("poster_prefs");
      if (saved) {
        const p = JSON.parse(saved);
        setPosterData(prev => ({
          ...prev,
          ...(p.readingRoom    ? { readingRoom:    p.readingRoom    } : {}),
          ...(p.studentInfo    ? { studentInfo:    p.studentInfo    } : {}),
          ...(p.bookTitle      ? { bookTitle:      p.bookTitle      } : {}),
          ...(p.mainTitle      ? { mainTitle:      p.mainTitle      } : {}),
          ...(p.content        ? { content:        p.content        } : {}),
          ...(p.teacherName    ? { teacherName:    p.teacherName    } : {}),
          ...(p.teacherComment ? { teacherComment: p.teacherComment } : {}),
          ...(p.phone      !== undefined ? { phone:      p.phone      } : {}),
          ...(p.footerText !== undefined ? { footerText: p.footerText } : {}),
          // 只恢复用户上传的 base64，过滤掉旧版存入的默认占位路径
          ...(p.qrCode && p.qrCode.startsWith("data:") ? { qrCode: p.qrCode } : {}),
        }));
      }
    } catch { /* 读取失败时静默使用默认值 */ }
    // 恢复完成，允许保存 effect 执行
    prefsRestored.current = true;
  }, []);

  // 所有文字字段或二维码变化时，自动保存到 localStorage（图片不保存，体积过大）
  // 必须等 prefsRestored 完成后才保存，避免用默认值覆盖已存数据
  useEffect(() => {
    if (!prefsRestored.current) return;
    try {
      localStorage.setItem("poster_prefs", JSON.stringify({
        readingRoom:    posterData.readingRoom,
        studentInfo:    posterData.studentInfo,
        bookTitle:      posterData.bookTitle,
        mainTitle:      posterData.mainTitle,
        content:        posterData.content,
        teacherName:    posterData.teacherName,
        teacherComment: posterData.teacherComment,
        phone:          posterData.phone,
        footerText:     posterData.footerText,
        qrCode:         posterData.qrCode,
      }));
    } catch { /* 存储空间不足时静默忽略 */ }
  }, [
    posterData.readingRoom, posterData.studentInfo, posterData.bookTitle,
    posterData.mainTitle, posterData.content, posterData.teacherName,
    posterData.teacherComment, posterData.phone, posterData.footerText,
    posterData.qrCode,
  ]);

  /** 加载图库数据（首次打开图库弹窗时触发） */
  const loadGallery = useCallback(async () => {
    if (galleryLoaded) return;
    try {
      const res = await fetch("/api/gallery");
      if (res.ok) {
        const data: GalleryCategory[] = await res.json();
        setGalleryCategories(data);
        // 设置默认选中项
        if (data.length > 0) {
          setGalleryTab((prev) => prev || data[0].id);
          const firstGrade = data[0].grades?.[0];
          if (firstGrade) {
            setGalleryGrade((prev) => prev || firstGrade.id);
            setGalleryBook((prev) => prev || firstGrade.books?.[0]?.id || "");
          }
        }
      }
    } catch {
      console.warn("图库数据加载失败");
    } finally {
      setGalleryLoaded(true);
    }
  }, [galleryLoaded]);

  // 图库弹窗打开时自动加载数据
  useEffect(() => {
    if (galleryOpen) loadGallery();
  }, [galleryOpen, loadGallery]);

  /** 保存历史记录到 localStorage */
  const saveHistoryToStorage = useCallback((items: HistoryItem[]) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
      console.warn("保存历史记录失败，可能存储空间不足");
    }
  }, []);

  /** 添加一条历史记录（下载时调用） */
  const addHistoryItem = useCallback((thumbnail: string) => {
    const newItem: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      thumbnail,
      posterData: { ...posterData },
    };
    const updated = [newItem, ...history].slice(0, MAX_HISTORY);
    setHistory(updated);
    saveHistoryToStorage(updated);
  }, [posterData, history, saveHistoryToStorage]);

  /** 加载历史记录到表单 */
  const loadHistoryItem = useCallback((item: HistoryItem) => {
    setPosterData({ ...item.posterData });
    // 清除裁切相关原始图片引用（历史快照已包含裁切后的图）
    setOriginalImages({ imageLeft: null, imageRight: null });
    setFileNames({ imageLeft: "", imageRight: "" });
    setSelectedHistory(null);
    setHistoryDialogOpen(false);
    toast.success("已加载历史记录");
  }, []);

  /** 删除单条历史记录 */
  const deleteHistoryItem = useCallback((id: string) => {
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    saveHistoryToStorage(updated);
    // 如果正在预览被删的条目，关闭预览
    if (selectedHistory?.id === id) {
      setSelectedHistory(null);
    }
    toast.success("已删除该记录");
  }, [history, saveHistoryToStorage, selectedHistory]);

  /** 清空所有历史记录 */
  const clearAllHistory = useCallback(() => {
    setHistory([]);
    saveHistoryToStorage([]);
    setSelectedHistory(null);
    toast.success("已清空所有历史记录");
  }, [saveHistoryToStorage]);

  // ============================================================
  // 下载海报
  // ============================================================

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 生成缩略图（低质量 JPEG，节省 localStorage 空间）
    const thumbCanvas = document.createElement("canvas");
    const thumbScale = 150 / POSTER_WIDTH; // 缩略图宽 150px
    thumbCanvas.width = 150;
    thumbCanvas.height = canvas.height / (canvas.width / 150);
    const thumbCtx = thumbCanvas.getContext("2d");
    if (thumbCtx) {
      thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.5);
      addHistoryItem(thumbnail);
    }

    // 下载高清图
    const link = document.createElement("a");
    link.download = `海报_${posterData.studentInfo}_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png", 1.0);
    link.click();
  };

  // ============================================================
  // 表单字段更新
  // ============================================================

  const updateField = (field: keyof PosterData, value: string) => {
    setPosterData(prev => ({ ...prev, [field]: value }));
  };

  // ============================================================
  // 手写稿 OCR 识别
  // ============================================================

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 先将 FileList 复制到普通数组（清空 input.value 会导致 FileList 引用失效）
    const fileArray = Array.from(files);
    e.target.value = "";

    // 限制最多 5 张
    if (fileArray.length > 5) {
      toast.warning("最多支持 5 张图片，请减少选择数量");
      return;
    }

    setOcrLoading(true);

    try {
      // 读取所有图片为 base64
      const base64List = await Promise.all(
        fileArray.map(
          (file) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            })
        )
      );

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ocr", imageBase64List: base64List }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "OCR 识别失败，请重试");
        return;
      }

      setOcrResult(data.result || "");
      setOcrDialogOpen(true);

      // 如果后端检测到输出被截断，弹窗打开后再提示
      if (data.warning) {
        setTimeout(() => toast.warning(data.warning), 300);
      }
    } catch {
      toast.error("网络错误，请检查网络连接后重试");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcrConfirm = () => {
    setPosterData(prev => ({ ...prev, content: ocrResult }));
    setOcrDialogOpen(false);
    setOcrResult("");
    toast.success("已将识别结果填入习作正文");
  };

  // ============================================================
  // AI 一键生成评语
  // ============================================================

  const commentDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleGenerateComment = () => {
    if (!posterData.content.trim()) {
      toast.warning("请先输入习作正文，再生成评语");
      return;
    }

    if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current);
    commentDebounceRef.current = setTimeout(async () => {
      setCommentLoading(true);
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "comment",
            content: posterData.content,
            studentInfo: posterData.studentInfo,
            bookTitle: posterData.bookTitle,
            mainTitle: posterData.mainTitle,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "评语生成失败，请重试");
          return;
        }

        setPosterData(prev => ({ ...prev, teacherComment: data.result || "" }));
        toast.success("评语已生成，可在下方编辑微调");
      } catch {
        toast.error("网络错误，请检查网络连接后重试");
      } finally {
        setCommentLoading(false);
      }
    }, 300);
  };

  // ============================================================
  // UI 渲染
  // ============================================================

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-6">
      {/* 图片裁切弹窗 */}
      {/* ========== 图库选择弹窗 ========== */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">从图库选择插图</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              选择一张图片后将进入裁切编辑
            </DialogDescription>
          </DialogHeader>

          {/* 一级分类 Tab 导航 */}
          <div className="flex gap-1.5 border-b border-gray-100 pb-2">
            {galleryCategories.map(cat => (
              <button
                key={cat.id}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                  galleryTab === cat.id
                    ? "bg-[#ff7670] text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                onClick={() => {
                  setGalleryTab(cat.id);
                  if (cat.grades && cat.grades.length > 0) {
                    setGalleryGrade(cat.grades[0].id);
                    setGalleryBook(cat.grades[0].books?.[0]?.id || "");
                  } else {
                    setGalleryGrade("");
                    setGalleryBook("");
                  }
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 课程书目：二级年级 Tab + 三级书名下拉 */}
          {(() => {
            const activeCat = galleryCategories.find(c => c.id === galleryTab);
            if (!activeCat?.grades || activeCat.grades.length === 0) return null;

            const activeGrade = activeCat.grades.find(g => g.id === galleryGrade);

            return (
              <div className="space-y-2">
                {/* 年级 Tab */}
                <div className="flex gap-1.5 flex-wrap">
                  {activeCat.grades.map(grade => (
                    <button
                      key={grade.id}
                      className={`px-2.5 py-1 text-[11px] rounded-md transition-colors border ${
                        galleryGrade === grade.id
                          ? "bg-[#314F80] text-white border-[#314F80] shadow-sm"
                          : "bg-white text-gray-600 border-gray-200 hover:border-[#314F80] hover:text-[#314F80]"
                      }`}
                      onClick={() => {
                        setGalleryGrade(grade.id);
                        setGalleryBook(grade.books?.[0]?.id || "");
                      }}
                    >
                      {grade.label}
                      <span className="ml-1 opacity-50">({grade.books.length})</span>
                    </button>
                  ))}
                </div>

                {/* 书名可滚动列表 */}
                {activeGrade && activeGrade.books.length > 0 && (
                  <div className="max-h-[132px] overflow-y-auto border border-gray-200 rounded-lg bg-gray-50/50">
                    {activeGrade.books.map(book => (
                      <button
                        key={book.id}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer ${
                          galleryBook === book.id
                            ? "bg-[#ff7670]/10 text-[#ff7670] font-medium"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                        onClick={() => setGalleryBook(book.id)}
                      >
                        <span className="truncate">{book.label}</span>
                        <span className={`shrink-0 ml-2 text-[10px] ${galleryBook === book.id ? "text-[#ff7670]/60" : "text-gray-400"}`}>
                          {book.images.length} 张
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 该年级无书目提示 */}
                {activeGrade && activeGrade.books.length === 0 && (
                  <div className="text-xs text-gray-400 py-1">该年级暂未添加书目</div>
                )}
              </div>
            );
          })()}

          {/* 图片网格 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {(() => {
              const activeCat = galleryCategories.find(c => c.id === galleryTab);

              // 根据分类类型获取当前图片列表
              let currentImages: { src: string; name: string }[] = [];
              if (activeCat?.grades) {
                // 课程书目：三级结构
                const activeGrade = activeCat.grades.find(g => g.id === galleryGrade);
                const activeBook = activeGrade?.books.find(b => b.id === galleryBook);
                currentImages = activeBook?.images ?? [];
              } else {
                // 看图写话 / 通用素材：一级平铺
                currentImages = activeCat?.images ?? [];
              }

              if (currentImages.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <svg className="w-10 h-10 mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                    <p className="text-xs">暂无图片</p>
                    <p className="text-[10px] mt-1">请将图片放入对应的 public/gallery/ 目录并更新配置</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-3 gap-3 p-1">
                  {currentImages.map((img) => (
                    <button
                      key={img.src}
                      className="group relative aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-[#ff7670] transition-all bg-gray-50"
                      onClick={() => handleGallerySelect(img.src, img.name)}
                      title={img.name}
                    >
                      <img
                        src={img.src}
                        alt={img.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center">
                        <span className="text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity pb-2 px-2 text-center leading-tight drop-shadow">
                          {img.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* 底部提示 */}
          <div className="text-[10px] text-gray-400 text-center pt-2 border-t border-gray-100">
            图片目录：public/gallery/分类/年级/书名/ · 放入图片后自动识别
          </div>
        </DialogContent>
      </Dialog>

      {cropImage && cropTarget && (
        <ImageCropper
          imageSrc={cropImage}
          aspectRatio={cropTarget === "imageRight" ? 3 / 4 : 4 / 3}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {/* OCR 识别结果审核弹窗 */}
      <Dialog open={ocrDialogOpen} onOpenChange={setOcrDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <svg className="w-5 h-5 text-[#ff7670]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h6"/><path d="M9 17h3"/></svg>
              手写稿识别结果
            </DialogTitle>
            <DialogDescription>
              请核对识别结果，可直接在下方编辑修改，确认后将填入习作正文。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={ocrResult}
            onChange={e => setOcrResult(e.target.value)}
            className="min-h-[200px] text-sm"
            placeholder="识别结果为空"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOcrDialogOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-[#ff7670] hover:bg-[#e5635d] text-white"
              onClick={handleOcrConfirm}
            >
              确认填入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 历史记录详情弹窗 */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <svg className="w-5 h-5 text-[#ff7670]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              历史记录详情
            </DialogTitle>
            <DialogDescription>
              {selectedHistory && (
                <span>
                  {new Date(selectedHistory.timestamp).toLocaleDateString("zh-CN")}
                  {" "}
                  {new Date(selectedHistory.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {" · "}
                  {selectedHistory.posterData.studentInfo}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedHistory && (
            <div className="space-y-3">
              {/* 缩略图预览 */}
              <div className="flex justify-center bg-gray-50 rounded-lg p-3">
                <img
                  src={selectedHistory.thumbnail}
                  alt="海报预览"
                  className="max-h-[300px] rounded-md shadow-sm"
                />
              </div>
              {/* 关键信息摘要 */}
              <div className="text-xs text-gray-500 space-y-1 bg-gray-50 rounded-lg p-3">
                <p><span className="text-gray-700 font-medium">馆名：</span>{selectedHistory.posterData.readingRoom}</p>
                <p><span className="text-gray-700 font-medium">学员：</span>{selectedHistory.posterData.studentInfo}</p>
                {selectedHistory.posterData.bookTitle?.trim() && (
                  <p><span className="text-gray-700 font-medium">书目：</span>{selectedHistory.posterData.bookTitle}</p>
                )}
                <p><span className="text-gray-700 font-medium">标题：</span>{selectedHistory.posterData.mainTitle}</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => { if (selectedHistory) { deleteHistoryItem(selectedHistory.id); setHistoryDialogOpen(false); } }}
            >
              <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              删除
            </Button>
            <Button
              className="bg-[#ff7670] hover:bg-[#e5635d] text-white"
              size="sm"
              onClick={() => { if (selectedHistory) loadHistoryItem(selectedHistory); }}
            >
              <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              加载到编辑器
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== 使用指南弹窗 ========== */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <svg className="w-5 h-5 text-[#ff7670]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              使用说明
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-400">
              老约翰深度阅读 · 学员习作展示海报生成器
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1 leading-relaxed">

            {/* 简介 */}
            <p className="text-gray-500 text-sm bg-gray-50 rounded-lg px-4 py-3 leading-relaxed">
              本工具帮助老师告别繁琐 P 图排版，只需输入文字和图片，即可一键生成排版精美、高清的展示海报，支持下载直接发给家长或发朋友圈。
            </p>

            {/* 步骤列表 */}
            {[
              {
                step: "01", title: "选择模板风格",
                content: (
                  <div className="space-y-2">
                    <p>在左侧面板顶部切换两款模板：</p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#ff7670] text-white text-sm rounded-full font-medium">品牌橙红</span>
                      <span className="text-sm text-gray-500">品牌色背景，适合大部分低年级作品</span>
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="inline-flex items-center gap-1 px-3 py-1 border border-[#ff7670] text-[#ff7670] text-sm rounded-full font-medium">简约留白</span>
                      <span className="text-sm text-gray-500">极简留白风格，适合高年级或文字较多的长篇习作</span>
                    </div>
                  </div>
                )
              },
              {
                step: "02", title: "填写头部信息",
                content: <p>在"头部信息"区依次填入<strong>馆名、学员信息、课程书目</strong>。看图写话类习作可将书目留空，海报将自动显示"看图写话"。</p>
              },
              {
                step: "03", title: "录入习作正文",
                content: (
                  <div className="space-y-2">
                    <p><strong>手动输入：</strong>直接在文本框打字，工具原样保留换行排版。</p>
                    <p><strong className="text-[#314F80]">✨ 手写稿识别（强烈推荐）：</strong>点击 <span className="bg-[#314F80] text-white text-xs px-1.5 py-0.5 rounded">手写稿识别</span> 按钮，上传孩子的手写稿照片（最多 5 张），系统自动识别文字，在弹窗核对微调后一键填入，大幅节省打字时间。</p>
                  </div>
                )
              },
              {
                step: "04", title: "编辑展示插图",
                content: (
                  <div className="space-y-2">
                    <p><strong>左侧插图：</strong>点击 <span className="bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded">内置图库</span> 从预设插图中挑选，或点击 <span className="bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded">本地上传</span> 使用自备配图，上传后可进入裁切编辑器调整构图。</p>
                    <p><strong>右侧手写稿：</strong>上传孩子的手写原稿，系统自动裁切为<strong>正圆形</strong>展示在海报右侧，无需提前修图。</p>
                    <p className="text-gray-400">💡 只传一张图时，系统自动将该图居中展示。</p>
                  </div>
                )
              },
              {
                step: "05", title: "撰写老师评语",
                content: (
                  <div className="space-y-2">
                    <p><strong className="text-[#314F80]">✨ 智能生成：</strong>填好学员信息和习作正文后，点击 <span className="bg-[#314F80] text-white text-xs px-1.5 py-0.5 rounded">智能生成</span>，系统自动生成一段专业评语，生成后可在文本框中个性化修改。</p>
                    <p><strong>手动输入：</strong>直接在评语文本框填写，并在署名栏注明老师姓名。</p>
                  </div>
                )
              },
              {
                step: "06", title: "底部信息与二维码",
                content: (
                  <div className="space-y-2">
                    <p>上传馆区专属的客服二维码，并在联系信息栏填写电话号码相关引导信息（支持换行）。</p>
                    <p className="text-gray-400">💾 <strong>自动记忆：</strong>馆名、二维码、联系信息会自动保存在浏览器中，下次在同一台电脑打开时自动恢复，无需重新填写。</p>
                  </div>
                )
              },
              {
                step: "07", title: "预览与下载",
                content: <p>左侧任何填写内容都会在右侧<strong>实时预览</strong>。确认排版无误后，点击 <span className="bg-[#ff7670] text-white text-xs px-1.5 py-0.5 rounded">下载海报</span> 保存高清 PNG 图片，同时自动保存到底部<strong>生成历史</strong>，可随时回溯加载。</p>
              },
            ].map(({ step, title, content }) => (
              <div key={step} className="flex gap-4">
                <span className="shrink-0 w-8 h-8 rounded-full bg-[#ff7670]/10 text-[#ff7670] text-sm font-bold flex items-center justify-center mt-0.5">{step}</span>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800 text-base mb-1.5">{title}</div>
                  <div className="text-gray-500 text-sm leading-relaxed">{content}</div>
                </div>
              </div>
            ))}

            {/* 小贴士 */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="21" x2="14" y2="21"/></svg>
                老师们的高效小贴士
              </div>
              <p className="text-sm text-amber-700"><strong>文字太多？</strong>画布高度全自动适应，正文再长底板也会自动拉伸，不用担心文字被截断。</p>
              <p className="text-sm text-amber-700"><strong>手写稿方向不对？</strong>上传前请确保图片方向正向，裁切效果最佳。</p>
              <p className="text-sm text-amber-700"><strong>数据安全：</strong>海报在浏览器本地生成，不依赖外部服务器（智能识别除外），孩子作品隐私有保障。</p>
              <p className="text-sm text-amber-700"><strong>换电脑或换浏览器？</strong>馆名等自动保存的信息仅存在当前浏览器中，换设备后需重新填写一次。</p>
            </div>

          </div>

          <DialogFooter>
            <Button className="bg-[#ff7670] hover:bg-[#e5635d] text-white px-8" onClick={() => setGuideOpen(false)}>
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 页面标题 */}
      <div className="max-w-[1400px] mx-auto mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <img src="/logo-1.png" alt="老约翰" className="w-10 h-10 object-contain" />
            深度阅读学员习作展示海报生成器
          </h1>
          <p className="text-gray-500 text-sm mt-1">填写左侧表单，右侧实时预览海报，点击下载保存高清图片</p>
        </div>
        <button
          onClick={() => setGuideOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-300 text-gray-600 text-sm hover:bg-gray-100 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          使用说明
        </button>
      </div>

      {/* 左右两栏 */}
      <div className="max-w-[1400px] mx-auto grid grid-cols-[520px_1fr] gap-6 items-start">
        {/* ========== 左侧配置面板 ========== */}
        <div className="space-y-3 max-h-[calc(100vh-130px)] overflow-y-auto pr-2">
          {/* 模板样式切换 */}
          <Card>
            <CardContent className="py-3 px-4">
              <Label className="text-xs text-gray-500 mb-2 block">模板样式</Label>
              <div className="grid grid-cols-2 gap-2">
                {/* 经典粉红：选中时品牌橙红色实底 */}
                <button
                  className={`relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all cursor-pointer ${
                    templateStyle === 'classic'
                      ? 'border-[#ff7670] bg-[#ff7670] shadow-sm'
                      : 'border-gray-200 bg-white hover:border-[#ff7670]/50'
                  }`}
                  onClick={() => setTemplateStyle('classic')}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    templateStyle === 'classic' ? 'border-white' : 'border-gray-300'
                  }`}>
                    {templateStyle === 'classic' && <span className="w-2 h-2 rounded-full bg-white" />}
                  </span>
                  <span className={`text-xs font-medium ${templateStyle === 'classic' ? 'text-white' : 'text-gray-700'}`}>品牌橙红</span>
                </button>
                {/* 简约留白：选中时白底+边框 */}
                <button
                  className={`relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all cursor-pointer ${
                    templateStyle === 'minimalist'
                      ? 'border-[#ff7670] bg-white shadow-sm'
                      : 'border-gray-200 bg-white hover:border-[#ff7670]/50'
                  }`}
                  onClick={() => setTemplateStyle('minimalist')}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    templateStyle === 'minimalist' ? 'border-[#ff7670]' : 'border-gray-300'
                  }`}>
                    {templateStyle === 'minimalist' && <span className="w-2 h-2 rounded-full bg-[#ff7670]" />}
                  </span>
                  <span className={`text-xs font-medium ${templateStyle === 'minimalist' ? 'text-[#ff7670]' : 'text-gray-700'}`}>简约留白</span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* 头部信息 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#ff7670] rounded-full inline-block" />
                头部信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              <div>
                <Label className="text-xs">馆名</Label>
                <Input value={posterData.readingRoom} onChange={e => updateField("readingRoom", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">学员信息</Label>
                <Input value={posterData.studentInfo} onChange={e => updateField("studentInfo", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">课程书目 <span className="text-gray-400 font-normal">（选填，看图写话可留空）</span></Label>
                <Input value={posterData.bookTitle} onChange={e => updateField("bookTitle", e.target.value)} className="mt-1 h-9 text-sm" placeholder="如为看图写话，可不填" />
              </div>
            </CardContent>
          </Card>

          {/* 正文内容 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#ff7670] rounded-full inline-block" />
                正文内容
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              <div>
                <Label className="text-xs">习作标题</Label>
                <Input value={posterData.mainTitle} onChange={e => updateField("mainTitle", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">习作正文</Label>
                  <Button
                    size="sm"
                    className="h-8 text-xs px-3 gap-1.5 bg-[#314F80] hover:bg-[#243d63] text-white border-0 shadow-sm"
                    disabled={ocrLoading}
                    onClick={() => ocrInputRef.current?.click()}
                  >
                    {ocrLoading ? (
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4m-8-10H2m20 0h-4m-1.34-7.66l-2.83 2.83m-5.66 5.66l-2.83 2.83m11.32 0l-2.83-2.83M6.34 6.34L3.51 3.51" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h6"/><path d="M9 17h3"/></svg>
                    )}
                    {ocrLoading ? "识别中..." : "手写稿识别"}
                  </Button>
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleOcrUpload}
                  />
                </div>
                <Textarea value={posterData.content} onChange={e => updateField("content", e.target.value)} className="mt-1 min-h-[200px] text-sm" placeholder="支持换行，也可上传手写稿自动识别（支持多张）" />
                {/* OCR 提示：移至正文框下方 */}
                <div className="flex items-start gap-1.5 px-2.5 py-1.5 mt-1.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-700 leading-relaxed">
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span>手写体识别可能存在偏差，建议与原稿逐字比对，以确保内容准确无误。</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 图片上传 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#ff7670] rounded-full inline-block" />
                图片上传
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              <div>
                <Label className="text-xs">左侧插图</Label>
                <input ref={replaceLeftRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, "imageLeft")} />

                {posterData.imageLeft ? (
                  /* ---- 已选图片：显示预览 + 三个操作按钮 ---- */
                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      <img
                        src={posterData.imageLeft}
                        alt="左侧插图"
                        className="w-14 h-14 object-cover rounded border border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{fileNames.imageLeft || "已选择图片"}</p>
                      </div>
                    </div>
                    {/* 三个操作按钮：编辑（裁切）、从图库选择、本地替换 */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        className="flex items-center justify-center gap-1 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-xs text-gray-600 hover:text-gray-900 cursor-pointer"
                        onClick={() => handleReEdit("imageLeft")}
                        title="裁切编辑"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        编辑
                      </button>
                      <button
                        className="flex items-center justify-center gap-1 py-1.5 rounded-md border border-[#ff7670]/50 bg-white hover:bg-[#fff5f5] transition-colors text-xs text-[#ff7670] cursor-pointer"
                        onClick={() => setGalleryOpen(true)}
                        title="从图库选择"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                        内置图库
                      </button>
                      <button
                        className="flex items-center justify-center gap-1 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-xs text-gray-600 hover:text-gray-900 cursor-pointer"
                        onClick={() => replaceLeftRef.current?.click()}
                        title="本地上传"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        本地上传
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ---- 未选图片：两个入口按钮 ---- */
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {/* 从图库选择 */}
                    <button
                      className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border-2 border-dashed border-[#ff7670]/40 bg-[#fff5f5]/50 hover:border-[#ff7670] hover:bg-[#fff5f5] transition-colors cursor-pointer group"
                      onClick={() => setGalleryOpen(true)}
                    >
                      <svg className="w-6 h-6 text-[#ff7670]/60 group-hover:text-[#ff7670] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                      <span className="text-xs text-[#ff7670]/70 group-hover:text-[#ff7670] font-medium">从图库选择</span>
                    </button>
                    {/* 本地上传 */}
                    <button
                      className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer group"
                      onClick={() => replaceLeftRef.current?.click()}
                    >
                      <svg className="w-6 h-6 text-gray-400 group-hover:text-gray-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span className="text-xs text-gray-400 group-hover:text-gray-600 font-medium">本地上传</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">右侧手写稿</Label>
                <input ref={replaceRightRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, "imageRight")} />
                {posterData.imageRight ? (
                  <div className="mt-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <img
                      src={posterData.imageRight}
                      alt="右侧手写稿"
                      className="w-14 h-14 object-cover rounded cursor-pointer border border-gray-300 hover:border-[#ff7670] transition"
                      onClick={() => replaceRightRef.current?.click()}
                      title="点击替换图片"
                    />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => replaceRightRef.current?.click()}>
                      <p className="text-xs text-gray-700 truncate">{fileNames.imageRight || "已上传图片"}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">点击替换 · 右侧编辑裁切</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleReEdit("imageRight")} className="h-7 text-xs px-2 shrink-0">
                      <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      编辑
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1">
                    <Input type="file" accept="image/*" onChange={e => handleImageUpload(e, "imageRight")} className="text-xs h-9" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 老师评语 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#ff7670] rounded-full inline-block" />
                老师评语
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              <div>
                <Label className="text-xs">评语署名</Label>
                <Input value={posterData.teacherName} onChange={e => updateField("teacherName", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">评语内容</Label>
                  <Button
                    size="sm"
                    className="h-8 text-xs px-3 gap-1.5 bg-[#314F80] hover:bg-[#243d63] text-white border-0 shadow-sm"
                    disabled={commentLoading}
                    onClick={handleGenerateComment}
                  >
                    {commentLoading ? (
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4m-8-10H2m20 0h-4m-1.34-7.66l-2.83 2.83m-5.66 5.66l-2.83 2.83m11.32 0l-2.83-2.83M6.34 6.34L3.51 3.51" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.1-.45 2.1-1.17 2.83L12 12l-2.83-3.17A4 4 0 0 1 12 2z"/><path d="M12 12v10"/><path d="M8 22h8"/><path d="M5 12h14"/></svg>
                    )}
                    {commentLoading ? "生成中..." : "智能生成"}
                  </Button>
                </div>
                <Textarea value={posterData.teacherComment} onChange={e => updateField("teacherComment", e.target.value)} className="mt-1 min-h-[86px] text-sm" placeholder="可手动输入，也可点击「AI 智能生成」自动生成" />
                <div className="flex items-start gap-1.5 px-2.5 py-1.5 mt-1.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-700 leading-relaxed">
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span>如果是系统生成的评语，请结合实际情况审核，确保评语准确贴切。</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 底部信息 */}
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#ff7670] rounded-full inline-block" />
                底部信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0 w-14">二维码</Label>
                {posterData.qrCode ? (
                  <div className="flex items-center gap-2 flex-1">
                    <img src={posterData.qrCode} alt="二维码预览" className="w-10 h-10 object-cover rounded border border-gray-200" />
                    <span className="text-xs text-gray-500 flex-1">已上传</span>
                    <label className="cursor-pointer text-xs text-[#314F80] hover:underline shrink-0">
                      替换
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, "qrCode")} />
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => setPosterData(p => ({ ...p, qrCode: null }))} className="text-red-500 shrink-0 h-7 text-[10px] px-1.5">清除</Button>
                  </div>
                ) : (
                  <Input type="file" accept="image/*" onChange={e => handleImageUpload(e, "qrCode")} className="text-xs h-8 flex-1" />
                )}
              </div>
              <div className="flex items-start gap-2">
                <Label className="text-xs shrink-0 w-14 mt-1.5">联系信息</Label>
                <Textarea value={posterData.phone} onChange={e => updateField("phone", e.target.value)} className="text-sm flex-1 min-h-[52px] resize-none" rows={2} placeholder="电话：13912345678&#10;报课请扫码咨询" />
              </div>
            </CardContent>
          </Card>

          {/* 生成历史记录 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-[#ff7670] rounded-full inline-block" />
                  生成历史
                </span>
                {history.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllHistory} className="h-6 text-[10px] px-2 text-gray-400 hover:text-red-500">
                    清空
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">暂无历史记录，下载海报后自动保存</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {history.map(item => (
                    <div
                      key={item.id}
                      className="group relative cursor-pointer rounded-lg overflow-hidden border border-gray-200 hover:border-[#ff7670] transition-all hover:shadow-md"
                      onClick={() => { setSelectedHistory(item); setHistoryDialogOpen(true); }}
                    >
                      {/* 缩略图 */}
                      <img src={item.thumbnail} alt="历史海报" className="w-full aspect-[3/5] object-cover" />
                      {/* 悬浮时间标签 */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] text-white text-center leading-tight">
                          {new Date(item.timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                          {" "}
                          {new Date(item.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {/* 右上角删除按钮 */}
                      <button
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                        onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                        title="删除"
                      >
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ========== 右侧预览与导出 ========== */}
        <div className="sticky top-6 flex flex-col items-center">
          <div className="bg-white rounded-xl shadow-lg p-3 inline-block">
            <canvas ref={canvasRef} className="block" />
          </div>
          <Button
            onClick={handleDownload}
            className="mt-4 bg-[#ff7670] hover:bg-[#e5635d] text-white px-10 py-3 text-base rounded-full shadow-md transition-all hover:shadow-lg"
            size="lg"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            下载海报
          </Button>
        </div>
      </div>
      {/* 页面底部 Footer */}
      <div className="mt-8 pb-6 text-center text-xs text-gray-400 select-none">
        © 2026 老约翰儿童阅读
      </div>
    </div>
  );
}
