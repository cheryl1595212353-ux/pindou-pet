import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { CatAppearance } from "./appearances";
import type { CameraPreset } from "./camera";
import { VoxelCatScene } from "./VoxelCatScene";

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
  readonly webglSupported?: boolean;
}

export function VoxelCatStage({
  appearance,
  cameraPreset,
  webglSupported,
}: VoxelCatStageProps) {
  const supported = useMemo(
    () => webglSupported ?? detectWebGLSupport(),
    [webglSupported],
  );
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [heartVisible, setHeartVisible] = useState(false);

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

  if (!supported) return <SceneFailure />;

  return (
    <div className="voxel-canvas-wrap">
      <SceneErrorBoundary>
        <VoxelCatScene
          appearance={appearance}
          cameraPreset={cameraPreset}
          reducedMotion={reducedMotion}
          onHeartChange={handleHeartChange}
        />
      </SceneErrorBoundary>
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
