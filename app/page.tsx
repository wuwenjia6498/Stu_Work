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
    phone: "电话：13912345678",
    footerText: "报课请扫码咨询",
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

  // ---- OCR 识别相关状态 ----
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [ocrResult, setOcrResult] = useState("");

  // ---- AI 生成评语相关状态 ----
  const [commentLoading, setCommentLoading] = useState(false);

  const ocrInputRef = useRef<HTMLInputElement>(null);

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

    // 头部：curY=72, logoH=100, infoY=192, 3行×42=126, 底部≈318，留余量至334
    const headerHeight = 334;
    const headerBoardGap = 16;

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
    ctx.fillText(`\u4e66\u3000\u76ee\uff1a${posterData.bookTitle}`, infoX, infoY + infoLineH * 2);

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

          // 红色圆形描边（带阴影）
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.12)";
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 3;
          ctx.beginPath();
          ctx.arc(circleCX, circleCY, circleRadius, 0, Math.PI * 2);
          ctx.fillStyle = THEME_COLOR;
          ctx.fill();
          ctx.restore();

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
    ctx.font = `22px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillText(posterData.footerText, textRightX, qrBottom);
    ctx.font = `bold 24px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillText(posterData.phone, textRightX, qrBottom - 34);

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
  // 下载海报
  // ============================================================

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setOcrLoading(true);

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ocr", imageBase64: base64 }),
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
    reader.readAsDataURL(file);
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
                <Label className="text-xs">阅读书目</Label>
                <Input value={posterData.bookTitle} onChange={e => updateField("bookTitle", e.target.value)} className="mt-1 h-9 text-sm" />
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
                    {ocrLoading ? "识别中..." : "上传手写稿识别"}
                  </Button>
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleOcrUpload}
                  />
                </div>
                <Textarea value={posterData.content} onChange={e => updateField("content", e.target.value)} className="mt-1 min-h-[200px] text-sm" placeholder="支持换行，也可上传手写稿自动识别" />
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
                {posterData.imageLeft ? (
                  <div className="mt-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <img
                      src={posterData.imageLeft}
                      alt="左侧插图"
                      className="w-14 h-14 object-cover rounded cursor-pointer border border-gray-300 hover:border-[#ff7670] transition"
                      onClick={() => handleReEdit("imageLeft")}
                      title="点击重新裁切"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{fileNames.imageLeft || "已上传图片"}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">点击缩略图可重新裁切</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleReEdit("imageLeft")} className="h-7 text-xs px-2">
                        <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleClearImage("imageLeft")} className="h-7 text-xs px-2 text-red-500 hover:text-red-600">清除</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1">
                    <Input type="file" accept="image/*" onChange={e => handleImageUpload(e, "imageLeft")} className="text-xs h-9" />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">右侧手写稿</Label>
                {posterData.imageRight ? (
                  <div className="mt-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <img
                      src={posterData.imageRight}
                      alt="右侧手写稿"
                      className="w-14 h-14 object-cover rounded cursor-pointer border border-gray-300 hover:border-[#ff7670] transition"
                      onClick={() => handleReEdit("imageRight")}
                      title="点击重新裁切"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{fileNames.imageRight || "已上传图片"}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">点击缩略图可重新裁切</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleReEdit("imageRight")} className="h-7 text-xs px-2">
                        <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleClearImage("imageRight")} className="h-7 text-xs px-2 text-red-500 hover:text-red-600">清除</Button>
                    </div>
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
              </div>
            </CardContent>
          </Card>

          {/* 底部信息 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#ff7670] rounded-full inline-block" />
                底部信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              <div>
                <Label className="text-xs">二维码图片</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input type="file" accept="image/*" onChange={e => handleImageUpload(e, "qrCode")} className="text-xs h-9" />
                  {posterData.qrCode && (
                    <Button variant="ghost" size="sm" onClick={() => setPosterData(p => ({ ...p, qrCode: null }))} className="text-red-500 shrink-0 h-8 text-xs">清除</Button>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">联系电话</Label>
                <Input value={posterData.phone} onChange={e => updateField("phone", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">引导文字</Label>
                <Input value={posterData.footerText} onChange={e => updateField("footerText", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
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
