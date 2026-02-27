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
  // ---- 海报数据状态 ----
  const [posterData, setPosterData] = useState<PosterData>({
    readingRoom: "常德桃源县老约翰阅读馆",
    studentInfo: "李俊瑞（二年级）",
    bookTitle: "《玩具岛梦幻之旅》",
    mainTitle: "给爸爸妈妈的一封信",
    content:
      "亲爱的爸爸妈妈：\n这是我来狮子家的第二天。\n今天他们带我去大森林里探险啦！我学会了闻着气味找猎物，认出了哪种草有毒会扎人，还学着怎么用尖尖的爪子去扑小动物。\n一开始听到草丛里的怪声音我还挺害怕的，但现在慢慢习惯啦。我觉得狮子们真的好聪明、好勇敢！今天玩得超级开心，感觉自己也变厉害了！",
    imageLeft: "/pict.png",
    imageRight: "/pict01.png",
    teacherName: "老师评语：（老约翰阅读馆 萱萱老师）",
    teacherComment:
      "俊瑞，你真是一位想象力丰富又勇敢的探险家！习作不仅有闻气味、辨毒草这些生动的细节，更棒的是写出了自己从害怕到变厉害的心理成长。你的文字充满了力量，让老师也想跟着你去探险了！",
    qrCode: "/qr-code.png",
    phone: "电话：13912345678\n报课请扫码咨询",
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
    if (posterData.imageLeft)  imagePromises["left"]  = loadImage(posterData.imageLeft);
    if (posterData.imageRight) imagePromises["right"] = loadImage(posterData.imageRight);
    if (posterData.qrCode)     imagePromises["qr"]    = loadImage(posterData.qrCode);

    const imageKeys = Object.keys(imagePromises);
    const imageValues = await Promise.all(imageKeys.map(k => imagePromises[k].catch(() => null)));
    const images: Record<string, HTMLImageElement | null> = {};
    imageKeys.forEach((k, i) => { images[k] = imageValues[i]; });

    // ------ 预计算各区块高度 ------

    // 头部：curY=72, logoH=100, infoY=192, 3行×42=126, 留余量至334
    const headerHeight = 334;
    const headerBoardGap = 6;

    const boardPaddingTop = 36;
    const boardPaddingBottom = 36;

    const titleFontSize = 32;
    const titleLineHeight = 46;
    const contentFontSize = 26;
    const contentLineHeight = 44;

    const offCanvas = document.createElement("canvas");
    offCanvas.width = 1; offCanvas.height = 1;
    const offCtx = offCanvas.getContext("2d")!;

    offCtx.font = `bold ${titleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const titleWrapped = wrapText(offCtx, posterData.mainTitle, BOARD_TEXT_WIDTH, titleLineHeight);

    const titleContentGap = 16;

    offCtx.font = `${contentFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const contentWrapped = wrapText(offCtx, posterData.content, BOARD_TEXT_WIDTH, contentLineHeight);

    const contentImageGap = 24;
    const hasLeft = !!images["left"];
    const hasRight = !!images["right"];
    const imageMaxHeight = 300;
    let imageAreaHeight = 0;
    if (hasLeft || hasRight) {
      imageAreaHeight = imageMaxHeight + contentImageGap * 2;
    }

    const imageCommentGap = (hasLeft || hasRight) ? 8 : 16;
    const commentTitleFontSize = 28;
    const commentTitleLineHeight = 42;
    const commentFontSize = 24;
    const commentLineHeight = 40;

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

    // Step 1: 粉红背景
    ctx.fillStyle = THEME_COLOR;
    ctx.fillRect(0, 0, POSTER_WIDTH, totalHeight);

    // Step 2: 头部区域（顶部多留半倍空间：48→72）
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
    ctx.fillText(`\u9986\u3000\u540d\uff1a${posterData.readingRoom}`, infoX, infoY);
    ctx.fillText(`\u5b66\u3000\u5458\uff1a${posterData.studentInfo}`, infoX, infoY + infoLineH);
    // 书目为空时，第三行显示"看图写话"（字体加大加粗）
    if (posterData.bookTitle.trim()) {
      ctx.fillText(`\u4e66\u3000\u76ee\uff1a${posterData.bookTitle}`, infoX, infoY + infoLineH * 2);
    } else {
      ctx.font = `bold 36px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillText(`\u770b\u56fe\u5199\u8bdd`, infoX, infoY + infoLineH * 2 + 10);
      ctx.font = `${labelFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    }

    curY = headerHeight;

    // Step 3: 白色圆角底板
    const boardX = PADDING_X;
    const boardY = curY + headerBoardGap;
    const boardW = POSTER_WIDTH - PADDING_X * 2;

    ctx.fillStyle = "#FFFFFF";
    drawRoundRect(ctx, boardX, boardY, boardW, boardH, BOARD_RADIUS);
    ctx.fill();

    let drawY = boardY + boardPaddingTop;
    const drawX = boardX + BOARD_PADDING_X;

    // Step 4: 主标题
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

    // Step 5: 正文
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

    // Step 6: 图片区
    if (hasLeft || hasRight) {
      drawY += contentImageGap;
      const imgAreaW = boardW - BOARD_PADDING_X * 2;
      const imgAreaX = drawX;

      if (hasLeft && hasRight) {
        const imgH = imageMaxHeight;

        // ---- 右侧圆形手写稿参数 ----
        const circleDiameter = 340;  // 更大的圆形直径
        const circleBorder = 8;     // 红色描边粗度
        const circleRadius = circleDiameter / 2;
        // 圆心向右偏移，让圆形右侧超出白板边缘（产生裁切效果）
        const circleOverflow = 80;   // 超出白板右边缘的距离
        const circleCX = boardX + boardW - circleRadius + circleOverflow;
        const circleCY = drawY + imgH / 2; // 垂直居中

        // 左侧插图宽度：留出圆形在白板内的可见部分
        const gap = 16;
        const circleVisibleW = circleDiameter - circleOverflow; // 圆形在白板内可见宽度
        const leftW = imgAreaW - circleVisibleW - gap + BOARD_PADDING_X;

        // ---- 左侧插图（圆角矩形） ----
        if (images["left"]) {
          ctx.save();
          drawRoundRect(ctx, imgAreaX, drawY, leftW, imgH, 12);
          ctx.clip();
          const lImg = images["left"];
          const s = Math.max(leftW / lImg.width, imgH / lImg.height);
          ctx.drawImage(lImg,
            imgAreaX + (leftW - lImg.width * s) / 2,
            drawY + (imgH - lImg.height * s) / 2,
            lImg.width * s, lImg.height * s
          );
          ctx.restore();
        }

        // ---- 右侧手写稿（大圆形 + 超出白板右侧裁切效果） ----
        if (images["right"]) {
          const rImg = images["right"];

          // 红色圆形描边（无阴影）
          ctx.beginPath();
          ctx.arc(circleCX, circleCY, circleRadius, 0, Math.PI * 2);
          ctx.fillStyle = THEME_COLOR;
          ctx.fill();

          // 白色内衬圆
          ctx.beginPath();
          ctx.arc(circleCX, circleCY, circleRadius - circleBorder, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();

          // 圆形裁切绘制图片
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

    // Step 7: 评语区
    drawY += imageCommentGap;

    ctx.fillStyle = "#111111";
    ctx.font = `bold ${commentTitleFontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    for (const line of commentTitleWrapped.lines) {
      ctx.fillText(line, drawX, drawY);
      drawY += commentTitleLineHeight;
    }
    drawY += commentGap;

    ctx.fillStyle = "#333333";
    ctx.font = `${commentFontSize}px "SimSun","STSong","Songti SC",serif`;
    for (const line of commentWrapped.lines) {
      ctx.fillText(line, drawX, drawY);
      drawY += commentLineHeight;
    }

    // Step 8: 底部
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
    // 联系信息：按换行拆分，逐行绘制，从二维码底部向上排列
    ctx.font = `22px "PingFang SC","Microsoft YaHei",sans-serif`;
    const contactLines = posterData.phone.split("\n").filter(Boolean);
    const lineH = 32;
    for (let i = contactLines.length - 1; i >= 0; i--) {
      const offsetY = qrBottom - (contactLines.length - 1 - i) * lineH;
      ctx.fillText(contactLines[i], textRightX, offsetY);
    }

    } catch (err) {
      console.error("海报绘制出错：", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterData, wrapText]);

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

  const handleReEdit = (field: "imageLeft" | "imageRight") => {
    const originalSrc = originalImages[field];
    if (!originalSrc) return;
    setCropImage(originalSrc);
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
            <div className="flex items-start gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700 leading-relaxed">
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>手写体识别可能存在偏差，建议与原稿逐字比对后再确认，以确保内容准确无误。</span>
            </div>
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

      {/* 页面标题 */}
      <div className="max-w-[1400px] mx-auto mb-5">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <img src="/logo-1.png" alt="老约翰" className="w-10 h-10 object-contain" />
          深度阅读学员习作展示海报生成器
        </h1>
        <p className="text-gray-500 text-sm mt-1">填写左侧表单，右侧实时预览海报，点击下载保存高清图片</p>
      </div>

      {/* 左右两栏 */}
      <div className="max-w-[1400px] mx-auto grid grid-cols-[520px_1fr] gap-6 items-start">
        {/* ========== 左侧配置面板 ========== */}
        <div className="space-y-3 max-h-[calc(100vh-130px)] overflow-y-auto pr-2">
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
                <Label className="text-xs">左侧插图 <span className="text-gray-400 font-normal">{posterData.bookTitle.trim() ? "（上传课程书目相关图片）" : "（上传看图写话中的图片）"}</span></Label>
                <input ref={replaceLeftRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, "imageLeft")} />
                {posterData.imageLeft ? (
                  <div className="mt-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <img
                      src={posterData.imageLeft}
                      alt="左侧插图"
                      className="w-14 h-14 object-cover rounded cursor-pointer border border-gray-300 hover:border-[#ff7670] transition"
                      onClick={() => replaceLeftRef.current?.click()}
                      title="点击替换图片"
                    />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => replaceLeftRef.current?.click()}>
                      <p className="text-xs text-gray-700 truncate">{fileNames.imageLeft || "已上传图片"}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">点击替换 · 右侧编辑裁切</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleReEdit("imageLeft")} className="h-7 text-xs px-2 shrink-0">
                      <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      编辑
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1">
                    <Input type="file" accept="image/*" onChange={e => handleImageUpload(e, "imageLeft")} className="text-xs h-9" />
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
                <Input type="file" accept="image/*" onChange={e => handleImageUpload(e, "qrCode")} className="text-xs h-8 flex-1" />
                {posterData.qrCode && (
                  <Button variant="ghost" size="sm" onClick={() => setPosterData(p => ({ ...p, qrCode: null }))} className="text-red-500 shrink-0 h-7 text-[10px] px-1.5">清除</Button>
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
    </div>
  );
}
