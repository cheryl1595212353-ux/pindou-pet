import { useMemo, useState } from "react";

import {
  CAT_APPEARANCES,
  DEFAULT_CAT_ID,
  getCatAppearance,
  type CatId,
} from "./voxel/appearances";
import type { CameraPreset } from "./voxel/camera";
import { DEFAULT_DETAIL_MODE, type DetailMode } from "./voxel/detailMode";
import { VoxelCatStage } from "./voxel/VoxelCatStage";

const VIEW_PRESETS: ReadonlyArray<{ id: CameraPreset; label: string }> = [
  { id: "front", label: "正面" },
  { id: "side", label: "侧面" },
  { id: "top", label: "俯视" },
];

export function PixelPetStudio() {
  const [selectedCatId, setSelectedCatId] = useState<CatId>(DEFAULT_CAT_ID);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("front");
  const [detailMode, setDetailMode] = useState<DetailMode>(DEFAULT_DETAIL_MODE);
  const { appearance, didFallback } = useMemo(
    () => getCatAppearance(selectedCatId),
    [selectedCatId],
  );

  return (
    <section className="studio" aria-label="3D 像素宠物工作台">
      <aside className="studio-controls">
        <p className="eyebrow">Voxel Pet Lab · 即时体验版</p>
        <h1>把宠物变成<br /><span className="title-line">3D 方块伙伴</span></h1>
        <p className="studio-intro">
          先从五只测试猫里选一只。拖动、缩放或切换视角，看看这种《我的世界》式互动是不是你想要的方向。
        </p>

        <div className="library-heading">
          <strong>选择测试猫</strong>
          <span>5 只 / 15 张参考图</span>
        </div>
        <div className="cat-library" aria-label="内置测试猫库">
          {CAT_APPEARANCES.map((cat) => (
            <button
              aria-label={`测试猫：${cat.name}，${cat.detail}`}
              aria-pressed={selectedCatId === cat.id}
              className="cat-option"
              key={cat.id}
              onClick={() => setSelectedCatId(cat.id)}
              type="button"
            >
              <img alt="" src={`/demo-cats/${cat.id}/front.png`} />
              <span>
                <strong>{cat.name}</strong>
                <small>{cat.detail}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="angle-switcher" aria-label="3D 视角">
          {VIEW_PRESETS.map((preset) => (
            <button
              aria-label={`${preset.label}视角`}
              aria-pressed={cameraPreset === preset.id}
              key={preset.id}
              onClick={() => setCameraPreset(preset.id)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="detail-switcher" aria-label="模型精细度">
          <button
            aria-pressed={detailMode === "detailed"}
            onClick={() => setDetailMode("detailed")}
            type="button"
          >
            精细模式
          </button>
          <button
            aria-pressed={detailMode === "performance"}
            onClick={() => setDetailMode("performance")}
            type="button"
          >
            性能模式
          </button>
        </div>

        {didFallback && (
          <p className="appearance-warning" role="status">
            外观配置无效，已使用默认三花。
          </p>
        )}

        <div className="interaction-guide" aria-label="3D 操作说明">
          <span>拖动</span><strong>旋转 360°</strong>
          <span>滚轮 / 双指</span><strong>缩放远近</strong>
          <span>点击猫咪</span><strong>跳跃互动</strong>
        </div>
      </aside>

      <div className="studio-stage voxel-stage-shell">
        <div className="stage-toolbar">
          <span>VOXEL ROOM / 3D</span>
          <span className="status ready">可以互动</span>
        </div>
        <VoxelCatStage
          appearance={appearance}
          cameraPreset={cameraPreset}
          detailMode={detailMode}
        />
        <p className="interaction-hint">拖动看全身，点击和它打招呼</p>
      </div>
    </section>
  );
}
