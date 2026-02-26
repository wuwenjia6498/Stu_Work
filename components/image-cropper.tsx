"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

// ============================================================
// 类型定义
// ============================================================

interface ImageCropperProps {
  /** 待裁切的图片源（base64 或 URL） */
  imageSrc: string;
  /** 裁切区域宽高比（宽/高），默认 4/3 */
  aspectRatio?: number;
  /** 确认裁切回调，返回裁切后的 base64 */
  onConfirm: (croppedBase64: string) => void;
  /** 取消回调 */
  onCancel: () => void;
}

// ============================================================
// 图片裁切组件
// ============================================================

export default function ImageCropper({
  imageSrc,
  aspectRatio = 4 / 3,
  onConfirm,
  onCancel,
}: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 原始图片
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // 视口尺寸（canvas 实际显示尺寸）
  const [viewW, setViewW] = useState(700);
  const [viewH, setViewH] = useState(500);

  // 裁切区域尺寸（居中固定）
  const [cropW, setCropW] = useState(400);
  const [cropH, setCropH] = useState(300);

  // 图片变换参数
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // 拖拽状态
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  // 初始缩放（让图片刚好覆盖裁切区域）
  const initialScaleRef = useRef(1);

  // ============================================================
  // 加载图片
  // ============================================================

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // ============================================================
  // 计算视口和裁切区域尺寸
  // ============================================================

  useEffect(() => {
    if (!imgLoaded || !containerRef.current) return;

    // 视口尺寸：取容器可用空间
    const rect = containerRef.current.getBoundingClientRect();
    const vw = Math.min(rect.width - 40, 800);
    const vh = Math.min(rect.height - 40, 600);
    setViewW(vw);
    setViewH(vh);

    // 裁切区域：在视口中占 70%，保持指定宽高比
    const maxCropW = vw * 0.75;
    const maxCropH = vh * 0.75;
    let cw = maxCropW;
    let ch = cw / aspectRatio;
    if (ch > maxCropH) {
      ch = maxCropH;
      cw = ch * aspectRatio;
    }
    setCropW(Math.round(cw));
    setCropH(Math.round(ch));

    // 计算初始缩放：让图片完全覆盖裁切框
    const img = imgRef.current!;
    const scaleToFit = Math.max(cw / img.width, ch / img.height);
    initialScaleRef.current = scaleToFit;
    setScale(scaleToFit);
    // 居中
    setOffsetX((vw - img.width * scaleToFit) / 2);
    setOffsetY((vh - img.height * scaleToFit) / 2);
  }, [imgLoaded, aspectRatio]);

  // ============================================================
  // 绘制 Canvas
  // ============================================================

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewW * dpr;
    canvas.height = viewH * dpr;
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 深色背景
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, viewW, viewH);

    // 绘制图片
    ctx.drawImage(img, offsetX, offsetY, img.width * scale, img.height * scale);

    // 半透明遮罩（裁切框外）
    const cropX = (viewW - cropW) / 2;
    const cropY = (viewH - cropH) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    // 上
    ctx.fillRect(0, 0, viewW, cropY);
    // 下
    ctx.fillRect(0, cropY + cropH, viewW, viewH - cropY - cropH);
    // 左
    ctx.fillRect(0, cropY, cropX, cropH);
    // 右
    ctx.fillRect(cropX + cropW, cropY, viewW - cropX - cropW, cropH);

    // 裁切框边框
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);

    // 九宫格辅助线
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      // 水平线
      const ly = cropY + (cropH / 3) * i;
      ctx.beginPath(); ctx.moveTo(cropX, ly); ctx.lineTo(cropX + cropW, ly); ctx.stroke();
      // 垂直线
      const lx = cropX + (cropW / 3) * i;
      ctx.beginPath(); ctx.moveTo(lx, cropY); ctx.lineTo(lx, cropY + cropH); ctx.stroke();
    }
  }, [viewW, viewH, cropW, cropH, scale, offsetX, offsetY]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ============================================================
  // 鼠标/触控 - 拖拽
  // ============================================================

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { x: offsetX, y: offsetY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffsetX(offsetStart.current.x + dx);
    setOffsetY(offsetStart.current.y + dy);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  // ============================================================
  // 鼠标滚轮 - 缩放
  // ============================================================

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.03 : 0.03;
    setScale(prev => {
      const minScale = initialScaleRef.current * 0.3;
      const maxScale = initialScaleRef.current * 5;
      return Math.min(maxScale, Math.max(minScale, prev + delta));
    });
  };

  // ============================================================
  // 滑块缩放
  // ============================================================

  const minSlider = Math.round(initialScaleRef.current * 30);
  const maxSlider = Math.round(initialScaleRef.current * 500);
  const sliderValue = Math.round(scale * 100);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(Number(e.target.value) / 100);
  };

  // ============================================================
  // 确认裁切 → 输出 base64
  // ============================================================

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;

    // 裁切框在 canvas 中的位置
    const cropX = (viewW - cropW) / 2;
    const cropY = (viewH - cropH) / 2;

    // 对应到原图的坐标
    const srcX = (cropX - offsetX) / scale;
    const srcY = (cropY - offsetY) / scale;
    const srcW = cropW / scale;
    const srcH = cropH / scale;

    // 输出尺寸（高清，裁切区域原始像素）
    const outW = Math.round(srcW);
    const outH = Math.round(srcH);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext("2d")!;
    outCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    onConfirm(outCanvas.toDataURL("image/png", 1.0));
  };

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl flex flex-col max-w-[860px] w-[95vw] max-h-[90vh] overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-white text-base font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            裁切图片
          </h3>
          <button onClick={onCancel} className="text-white/50 hover:text-white transition">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* 画布区域 */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center p-4 min-h-[400px] select-none"
          style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
        >
          {imgLoaded ? (
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
              className="rounded-lg"
              style={{ touchAction: "none" }}
            />
          ) : (
            <p className="text-white/50">加载中...</p>
          )}
        </div>

        {/* 缩放滑块 */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-white/10">
          <span className="text-white/60 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            缩放
          </span>
          <input
            type="range"
            min={minSlider}
            max={maxSlider}
            value={sliderValue}
            onChange={handleSliderChange}
            className="flex-1 h-1.5 accent-[#ff7670] bg-white/20 rounded-full appearance-none cursor-pointer"
          />
          <span className="text-white/60 text-sm w-12 text-right">
            {Math.round((scale / initialScaleRef.current) * 100)}%
          </span>
        </div>

        {/* 提示 + 操作按钮 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <p className="text-white/40 text-xs">拖动图片调整位置，滚动鼠标滚轮或使用滑块调整缩放</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 transition text-sm"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 rounded-lg bg-[#ff7670] hover:bg-[#e5635d] text-white transition text-sm font-medium"
            >
              确认裁切
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

