import { useCallback, useEffect, useRef, useState } from "react";

const MAX_CANVAS_SIDE = 760;

function quantize(value: number, levels: number): number {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

export function PixelPetStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [pixelSize, setPixelSize] = useState(8);
  const [colorLevels, setColorLevels] = useState(6);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [tolerance, setTolerance] = useState(42);
  const [isBouncing, setIsBouncing] = useState(false);
  const [showHearts, setShowHearts] = useState(false);

  const renderPixelPet = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) return;

    const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const sampleWidth = Math.max(1, Math.ceil(width / pixelSize));
    const sampleHeight = Math.max(1, Math.ceil(height / pixelSize));
    const sample = document.createElement("canvas");
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    const context = canvas.getContext("2d");
    if (sampleContext === null || context === null) return;

    sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const cornerIndexes = [
      0,
      (sampleWidth - 1) * 4,
      (sampleHeight - 1) * sampleWidth * 4,
      (sampleHeight * sampleWidth - 1) * 4,
    ];
    const background = [0, 1, 2].map((channel) =>
      cornerIndexes.reduce((sum, index) => sum + pixels.data[index + channel], 0) / 4,
    );

    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const distance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
      pixels.data[index] = quantize(red, colorLevels);
      pixels.data[index + 1] = quantize(green, colorLevels);
      pixels.data[index + 2] = quantize(blue, colorLevels);
      pixels.data[index + 3] = removeBackground && distance < tolerance ? 0 : 255;
    }

    sampleContext.putImageData(pixels, 0, 0);
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    context.drawImage(sample, 0, 0, width, height);
  }, [colorLevels, image, pixelSize, removeBackground, tolerance]);

  useEffect(() => renderPixelPet(), [renderPixelPet]);

  function loadFile(file: File | undefined) {
    if (file === undefined || !file.type.startsWith("image/")) return;
    const objectUrl = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setFileName(file.name);
      URL.revokeObjectURL(objectUrl);
    };
    nextImage.src = objectUrl;
  }

  function playInteraction() {
    if (image === null) return;
    setIsBouncing(false);
    setShowHearts(false);
    window.requestAnimationFrame(() => {
      setIsBouncing(true);
      setShowHearts(true);
      window.setTimeout(() => setIsBouncing(false), 650);
      window.setTimeout(() => setShowHearts(false), 900);
    });
  }

  function download() {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) return;
    const link = document.createElement("a");
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "pixel-pet"}-pixel.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <section className="studio" aria-label="像素宠物工作台">
      <aside className="studio-controls">
        <p className="eyebrow">本地即时生成 · 图片不会上传</p>
        <h1>把宠物变成<br />像素伙伴</h1>
        <p className="studio-intro">上传一张照片，立即生成可下载、可点击互动的像素宠物。</p>

        <label className="upload-button">
          <input
            aria-label="上传宠物图片"
            accept="image/*"
            type="file"
            onChange={(event) => loadFile(event.target.files?.[0])}
          />
          <span>{image === null ? "选择宠物照片" : "更换照片"}</span>
          <strong>↗</strong>
        </label>
        {fileName && <p className="file-name">当前：{fileName}</p>}

        <div className="control-group">
          <label htmlFor="pixel-size"><span>像素颗粒</span><output>{pixelSize}px</output></label>
          <input id="pixel-size" type="range" min="3" max="24" value={pixelSize} onChange={(event) => setPixelSize(Number(event.target.value))} />
        </div>
        <div className="control-group">
          <label htmlFor="color-levels"><span>颜色层次</span><output>{colorLevels}</output></label>
          <input id="color-levels" type="range" min="3" max="12" value={colorLevels} onChange={(event) => setColorLevels(Number(event.target.value))} />
        </div>
        <label className="toggle-row">
          <span><strong>尝试去除纯色背景</strong><small>复杂背景建议关闭</small></span>
          <input type="checkbox" checked={removeBackground} onChange={(event) => setRemoveBackground(event.target.checked)} />
        </label>
        {removeBackground && (
          <div className="control-group compact">
            <label htmlFor="tolerance"><span>背景容差</span><output>{tolerance}</output></label>
            <input id="tolerance" type="range" min="8" max="120" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} />
          </div>
        )}

        <button className="download-button" type="button" disabled={image === null} onClick={download}>
          {removeBackground ? "下载透明 PNG" : "下载像素 PNG"}
        </button>
      </aside>

      <div className="studio-stage">
        <div className="stage-toolbar">
          <span>PIXEL ROOM / 01</span>
          <span className={image === null ? "status waiting" : "status ready"}>{image === null ? "等待照片" : "可以互动"}</span>
        </div>
        <button className="pet-canvas-button" type="button" disabled={image === null} onClick={playInteraction} aria-label="点击宠物互动">
          {image === null && (
            <div className="empty-stage" aria-hidden="true">
              <span className="empty-pet">🐾</span>
              <strong>你的宠物会出现在这里</strong>
              <small>支持 JPG、PNG、WebP</small>
            </div>
          )}
          <div className={`canvas-wrap${isBouncing ? " is-bouncing" : ""}${image === null ? " is-empty" : ""}`}>
            <canvas ref={canvasRef} />
            {showHearts && <div className="hearts" aria-hidden="true"><i>♥</i><i>♥</i><i>♥</i></div>}
          </div>
        </button>
        <p className="interaction-hint">{image === null ? "先从左侧上传照片" : "点击宠物，和它打个招呼"}</p>
      </div>
    </section>
  );
}
