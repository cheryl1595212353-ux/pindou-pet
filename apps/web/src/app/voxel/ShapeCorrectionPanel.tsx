import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { paintMask } from "./threeViewRaster";
import type {
  BinaryMask,
  CatViewName,
  NormalizedCatView,
  ShapeCorrections,
} from "./threeViewTypes";

const VIEW_OPTIONS: ReadonlyArray<{ readonly id: CatViewName; readonly label: string }> = [
  { id: "front", label: "正面轮廓" },
  { id: "side", label: "侧面轮廓" },
  { id: "top", label: "俯视轮廓" },
];

const CORRECTION_OPTIONS: ReadonlyArray<{
  readonly id: keyof ShapeCorrections;
  readonly label: string;
}> = [
  { id: "headWidth", label: "头宽" },
  { id: "bodyLength", label: "身体长度" },
  { id: "legLength", label: "腿长" },
  { id: "earHeight", label: "耳朵高度" },
  { id: "tailThickness", label: "尾巴粗细" },
];

function cloneMask(mask: BinaryMask): BinaryMask {
  return { width: mask.width, height: mask.height, data: mask.data.slice() };
}

function clampCorrection(value: number): number {
  return Math.min(1.2, Math.max(0.8, value));
}

export interface ShapeCorrectionPanelProps {
  readonly corrections: ShapeCorrections;
  readonly maskOverrides: Partial<Record<CatViewName, BinaryMask>>;
  readonly onCorrectionsChange: (corrections: ShapeCorrections) => void;
  readonly onMaskChange: (view: CatViewName, mask: BinaryMask) => void;
  readonly onReset: () => void;
  readonly views: Readonly<Record<CatViewName, NormalizedCatView>> | null;
}

export function ShapeCorrectionPanel({
  corrections,
  maskOverrides,
  onCorrectionsChange,
  onMaskChange,
  onReset,
  views,
}: ShapeCorrectionPanelProps) {
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState<CatViewName>("front");
  const [brushValue, setBrushValue] = useState<0 | 1>(1);
  const sourceMask = useMemo(
    () => maskOverrides[activeView] ?? views?.[activeView] ?? null,
    [activeView, maskOverrides, views],
  );
  const [draft, setDraft] = useState<BinaryMask | null>(() =>
    sourceMask === null ? null : cloneMask(sourceMask),
  );
  const draftRef = useRef<BinaryMask | null>(draft);
  const drawing = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const next = sourceMask === null ? null : cloneMask(sourceMask);
    draftRef.current = next;
    setDraft(next);
  }, [sourceMask]);

  useEffect(() => {
    const current = canvas.current;
    if (current === null || draft === null) return;
    const context = current.getContext("2d");
    if (context === null) return;

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, draft.width, draft.height);
    context.fillStyle = "#f8f1e6";
    context.fillRect(0, 0, draft.width, draft.height);
    context.fillStyle = "#251f1a";
    for (let y = 0; y < draft.height; y += 1) {
      for (let x = 0; x < draft.width; x += 1) {
        if (draft.data[y * draft.width + x] !== 0) context.fillRect(x, y, 1, 1);
      }
    }
  }, [draft, open]);

  const maskCellFromPointer = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): readonly [number, number] | null => {
    const current = draftRef.current;
    if (current === null) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const x = Math.max(0, Math.min(
      current.width - 1,
      Math.floor(((event.clientX - bounds.left) / bounds.width) * current.width),
    ));
    const y = Math.max(0, Math.min(
      current.height - 1,
      Math.floor(((event.clientY - bounds.top) / bounds.height) * current.height),
    ));
    return [x, y];
  };

  const paintFromPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = draftRef.current;
    const cell = maskCellFromPointer(event);
    if (current === null || cell === null) return;
    const next = paintMask(current, {
      x: cell[0],
      y: cell[1],
      radius: 1,
      value: brushValue,
    });
    draftRef.current = next;
    setDraft(next);
  };

  const finishStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const current = draftRef.current;
    if (current !== null) onMaskChange(activeView, cloneMask(current));
  };

  return (
    <details className="shape-correction" open={open}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        <span>轮廓校正</span>
        <small>可选 · 按当前猫保存</small>
      </summary>
      {open && <div className="shape-correction-content">
        <div className="mask-view-switcher" aria-label="轮廓视图">
          {VIEW_OPTIONS.map((option) => (
            <button
              aria-label={option.label}
              aria-pressed={activeView === option.id}
              key={option.id}
              onClick={() => setActiveView(option.id)}
              type="button"
            >
              {option.label.slice(0, 2)}
            </button>
          ))}
        </div>

        <div className="mask-brush-switcher" aria-label="轮廓画笔">
          <button
            aria-label="补轮廓"
            aria-pressed={brushValue === 1}
            onClick={() => setBrushValue(1)}
            type="button"
          >
            ＋ 补轮廓
          </button>
          <button
            aria-label="擦轮廓"
            aria-pressed={brushValue === 0}
            onClick={() => setBrushValue(0)}
            type="button"
          >
            － 擦轮廓
          </button>
        </div>

        {draft === null ? (
          <p className="mask-loading">正在准备可编辑轮廓…</p>
        ) : (
          <canvas
            aria-label={`${VIEW_OPTIONS.find((option) => option.id === activeView)?.label.slice(0, 2) ?? "正面"}可编辑轮廓`}
            className="mask-canvas"
            height={draft.height}
            onPointerCancel={finishStroke}
            onPointerDown={(event) => {
              drawing.current = true;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              paintFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (drawing.current) paintFromPointer(event);
            }}
            onPointerUp={finishStroke}
            ref={canvas}
            role="img"
            width={draft.width}
          />
        )}

        <div className="shape-sliders">
          {CORRECTION_OPTIONS.map((option) => (
            <label key={option.id}>
              <span>{option.label}</span>
              <input
                aria-label={option.label}
                max="1.2"
                min="0.8"
                onChange={(event) => onCorrectionsChange({
                  ...corrections,
                  [option.id]: clampCorrection(Number(event.currentTarget.value)),
                })}
                step="0.02"
                type="range"
                value={corrections[option.id]}
              />
              <output>{Math.round(corrections[option.id] * 100)}%</output>
            </label>
          ))}
        </div>

        <button className="shape-reset" onClick={onReset} type="button">
          恢复自动轮廓
        </button>
      </div>}
    </details>
  );
}
