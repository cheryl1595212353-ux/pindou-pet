import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { CatAppearance } from "./appearances";
import type { CameraPreset } from "./camera";
import type { DetailMode } from "./detailMode";
import { LOW_FPS_THRESHOLD } from "./frameRate";
import { HIGH_DENSITY_VOXEL_COUNT } from "./highDensityGeometry";
import { VoxelCatScene, type FrameSample } from "./VoxelCatScene";
import type { PersonalizedVoxelModel } from "./visualHull";

export function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (context === null) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function SceneFailure() {
  return (
    <div className="webgl-failure" role="status">
      <strong>当前浏览器不支持 3D</strong>
      <span>请开启硬件加速或更换现代浏览器。</span>
    </div>
  );
}

class SceneErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <SceneFailure /> : this.props.children;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface VoxelCatStageProps {
  readonly appearance: CatAppearance;
  readonly cameraPreset: CameraPreset;
  readonly detailMode: DetailMode;
  readonly personalizedModel?: PersonalizedVoxelModel;
  readonly webglSupported?: boolean;
}

export function VoxelCatStage({
  appearance,
  cameraPreset,
  detailMode,
  personalizedModel,
  webglSupported,
}: VoxelCatStageProps) {
  const supported = useMemo(
    () => webglSupported ?? detectWebGLSupport(),
    [webglSupported],
  );
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [heartVisible, setHeartVisible] = useState(false);
  const [lowFps, setLowFps] = useState(false);
  const [detailFallback, setDetailFallback] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const handleHeartChange = useCallback((visible: boolean) => {
    setHeartVisible((current) => (current === visible ? current : visible));
  }, []);

  useEffect(() => {
    setLowFps(false);
    setDetailFallback(false);
  }, [appearance.id, detailMode]);

  const handleFrameSample = useCallback((sample: FrameSample) => {
    setLowFps(detailMode === "detailed" && sample.averageFps < LOW_FPS_THRESHOLD);
    if (stage.current === null) return;
    stage.current.dataset.averageFps = sample.averageFps.toFixed(1);
    stage.current.dataset.frameCount = String(sample.frames);
    stage.current.dataset.sampleSeconds = sample.elapsedSeconds.toFixed(1);
  }, [detailMode]);
  const handleDetailFallback = useCallback(() => setDetailFallback(true), []);

  if (!supported) return <SceneFailure />;

  const warning = detailFallback
    ? "精细模型加载失败，已显示性能模型"
    : lowFps
      ? "帧率较低，建议切换性能模式"
      : null;

  return (
    <div
      className="voxel-canvas-wrap"
      data-detail-mode={detailMode}
      data-model-cat={appearance.id}
      data-model-height={personalizedModel === undefined
        ? undefined
        : (personalizedModel.bounds.max[1] - personalizedModel.bounds.min[1]).toFixed(3)}
      data-model-length={personalizedModel === undefined
        ? undefined
        : (personalizedModel.bounds.max[0] - personalizedModel.bounds.min[0]).toFixed(3)}
      data-model-source={personalizedModel === undefined ? "fixed" : "three-view"}
      data-model-width={personalizedModel === undefined
        ? undefined
        : (personalizedModel.bounds.max[2] - personalizedModel.bounds.min[2]).toFixed(3)}
      data-tail-length={personalizedModel === undefined
        ? undefined
        : (personalizedModel.anchors.tailNextPivotX * 3).toFixed(3)}
      data-tail-color={personalizedModel?.tailSegment[0]?.color}
      data-voxel-count={personalizedModel === undefined
        ? detailMode === "detailed" ? HIGH_DENSITY_VOXEL_COUNT : 0
        : personalizedModel.main.length + personalizedModel.tailSegment.length * 3}
      ref={stage}
    >
      <SceneErrorBoundary>
        <VoxelCatScene
          appearance={appearance}
          cameraPreset={cameraPreset}
          detailMode={detailMode}
          personalizedModel={personalizedModel}
          reducedMotion={reducedMotion}
          onDetailFallback={handleDetailFallback}
          onHeartChange={handleHeartChange}
          onFrameSample={handleFrameSample}
        />
      </SceneErrorBoundary>
      {warning !== null && (
        <p className="voxel-performance-warning" role="status">
          {warning}
        </p>
      )}
      {heartVisible && (
        <div
          className={`voxel-hearts${reducedMotion ? " reduced" : ""}`}
          role="img"
          aria-label="宠物很开心"
        >
          <span>♥</span>
          <span>♥</span>
          <span>♥</span>
        </div>
      )}
    </div>
  );
}
