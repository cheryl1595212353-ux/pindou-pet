import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  DOG_CLIPS,
  MAX_STAGE_DEPTH,
  MAX_STAGE_POSITION,
  MIN_STAGE_DEPTH,
  MIN_STAGE_POSITION,
  SLEEPING_AFTER_MS,
  WAITING_AFTER_MS,
  clampStagePosition,
  dogReducer,
  getDepthScale,
  getPropSide,
  type DogEvent,
  type MoveDirection,
  type PixelDogState,
  type StagePosition,
} from "./pixelDogModel";
import {
  DEFAULT_PET_ID,
  PETS,
  getPetById,
  type PetId,
} from "./petCatalog";
import {
  DEFAULT_SCENE_ID,
  SCENES,
  getSceneById,
  type SceneId,
} from "./sceneCatalog";

const MOVE_STEP = 1.25;
const MOVE_INTERVAL_MS = 45;
const MIN_PET_SIZE = 70;
const MAX_PET_SIZE = 125;
const PET_SIZE_STEP = 5;
const PETTING_DELAY_MS = 240;
const PETTING_DRAG_THRESHOLD = 7;
const INTERACTION_PROPS: Partial<
  Record<PixelDogState, { readonly label: string; readonly modifier: string }>
> = {
  "playing-ball": { label: "玩具球", modifier: "ball" },
  grooming: { label: "梳毛刷", modifier: "brush" },
  bathing: { label: "宠物浴盆", modifier: "bath" },
  dancing: { label: "跳舞节拍", modifier: "dance" },
  posing: { label: "拍照闪光", modifier: "camera" },
};
const INITIAL_STAGE_POSITION: StagePosition = { x: 50, y: 50 };
const MOVEMENT_KEYS: Readonly<Record<string, MoveDirection>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "forward",
  ArrowUp: "backward",
};
const MOVEMENT_DELTAS: Readonly<Record<MoveDirection, StagePosition>> = {
  left: { x: -MOVE_STEP, y: 0 },
  right: { x: MOVE_STEP, y: 0 },
  forward: { x: 0, y: MOVE_STEP },
  backward: { x: 0, y: -MOVE_STEP },
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

function useSpriteFrame(
  state: PixelDogState,
  reducedMotion: boolean,
  onComplete: () => void,
): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const clip = DOG_CLIPS[state];
    setFrame(0);

    if (reducedMotion) {
      if (!clip.loop) {
        const completionTimer = window.setTimeout(onComplete, 280);
        return () => window.clearTimeout(completionTimer);
      }
      return;
    }

    let currentFrame = 0;
    let timer = 0;
    const advance = () => {
      const nextFrame = currentFrame + 1;
      if (nextFrame >= clip.frameCount) {
        if (!clip.loop) {
          onComplete();
          return;
        }
        currentFrame = 0;
      } else {
        currentFrame = nextFrame;
      }
      setFrame(currentFrame);
      timer = window.setTimeout(advance, clip.durations[currentFrame]);
    };

    timer = window.setTimeout(advance, clip.durations[0]);
    return () => window.clearTimeout(timer);
  }, [onComplete, reducedMotion, state]);

  return frame;
}

export function PixelDogStudio() {
  const [state, dispatch] = useReducer(dogReducer, "idle");
  const [petId, setPetId] = useState<PetId>(DEFAULT_PET_ID);
  const [sceneId, setSceneId] = useState<SceneId>(DEFAULT_SCENE_ID);
  const [stagePosition, setStagePosition] = useState<StagePosition>(
    INITIAL_STAGE_POSITION,
  );
  const [petSize, setPetSize] = useState(100);
  const [activityVersion, setActivityVersion] = useState(0);
  const [assetFailed, setAssetFailed] = useState(false);
  const suppressClickRef = useRef(false);
  const pettingActiveRef = useRef(false);
  const pettingTimerRef = useRef(0);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const reducedMotion = usePrefersReducedMotion();

  const completeClip = useCallback(() => dispatch({ type: "complete" }), []);
  const frame = useSpriteFrame(state, reducedMotion, completeClip);
  const clip = DOG_CLIPS[state];
  const pet = getPetById(petId);
  const scene = getSceneById(sceneId);
  const interactionProp = INTERACTION_PROPS[state];
  const propSide = getPropSide(stagePosition.x);
  const horizontalProgress = (stagePosition.x - MIN_STAGE_POSITION)
    / (MAX_STAGE_POSITION - MIN_STAGE_POSITION);
  const depthProgress = (stagePosition.y - MIN_STAGE_DEPTH)
    / (MAX_STAGE_DEPTH - MIN_STAGE_DEPTH);
  const dogOuterScale = (petSize / 100) * getDepthScale(stagePosition.y);

  const interact = useCallback((event: DogEvent) => {
    setActivityVersion((version) => version + 1);
    dispatch(event);
  }, []);

  const wakeFromAmbientInput = useCallback(() => {
    setActivityVersion((version) => version + 1);
    dispatch({ type: "wake" });
  }, []);

  const startMoving = useCallback((direction: MoveDirection) => {
    const delta = MOVEMENT_DELTAS[direction];
    setStagePosition((position) => clampStagePosition({
      x: position.x + delta.x,
      y: position.y + delta.y,
    }));
    interact({ type: "move", direction });
  }, [interact]);

  const selectPet = (nextPetId: PetId) => {
    if (nextPetId === petId) return;
    setPetId(nextPetId);
    setAssetFailed(false);
    interact({ type: "wake" });
  };

  const selectScene = (nextSceneId: SceneId) => {
    setSceneId(nextSceneId);
    interact({ type: "wake" });
  };

  useEffect(() => {
    const waitingTimer = window.setTimeout(
      () => dispatch({ type: "wait" }),
      WAITING_AFTER_MS,
    );
    const sleepingTimer = window.setTimeout(
      () => dispatch({ type: "sleep" }),
      SLEEPING_AFTER_MS,
    );
    return () => {
      window.clearTimeout(waitingTimer);
      window.clearTimeout(sleepingTimer);
    };
  }, [activityVersion]);

  useEffect(() => {
    if (reducedMotion || !state.startsWith("moving-")) {
      return;
    }
    const direction = state.slice("moving-".length) as MoveDirection;
    const delta = MOVEMENT_DELTAS[direction];
    const movementTimer = window.setInterval(() => {
      setStagePosition((position) => clampStagePosition({
        x: position.x + delta.x,
        y: position.y + delta.y,
      }));
    }, MOVE_INTERVAL_MS);
    return () => window.clearInterval(movementTimer);
  }, [reducedMotion, state]);

  useEffect(
    () => () => window.clearTimeout(pettingTimerRef.current),
    [],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.repeat) return;
    const direction = MOVEMENT_KEYS[event.key];
    if (direction) {
      event.preventDefault();
      startMoving(direction);
      return;
    }
    wakeFromAmbientInput();
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLElement>) => {
    if (MOVEMENT_KEYS[event.key]) {
      event.preventDefault();
      interact({ type: "stop" });
    }
  };

  const beginPetting = () => {
    if (pettingActiveRef.current) return;
    window.clearTimeout(pettingTimerRef.current);
    pettingActiveRef.current = true;
    suppressClickRef.current = true;
    interact({ type: "pet-start" });
  };

  const startPetting = (event: PointerEvent<HTMLButtonElement>) => {
    suppressClickRef.current = false;
    pettingActiveRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pettingTimerRef.current = window.setTimeout(beginPetting, PETTING_DELAY_MS);
  };

  const continuePetting = (event: PointerEvent<HTMLButtonElement>) => {
    if (
      Math.abs(event.clientX - pointerStartRef.current.x) >= PETTING_DRAG_THRESHOLD
      || Math.abs(event.clientY - pointerStartRef.current.y) >= PETTING_DRAG_THRESHOLD
    ) {
      beginPetting();
    }
  };

  const stopPetting = (event: PointerEvent<HTMLButtonElement>) => {
    window.clearTimeout(pettingTimerRef.current);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pettingActiveRef.current) {
      pettingActiveRef.current = false;
      interact({ type: "pet-end" });
    }
  };

  const handleDogClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    interact({ type: "happy" });
  };

  const spriteStyle: CSSProperties = {
    backgroundImage: `url("${pet.spritesheetPath}")`,
    backgroundPosition: `${-frame * CELL_WIDTH}px ${-clip.row * CELL_HEIGHT}px`,
    backgroundSize: `${ATLAS_WIDTH}px ${ATLAS_HEIGHT}px`,
  };
  const sceneStyle = {
    "--dog-x-progress": horizontalProgress.toFixed(4),
    "--dog-depth-progress": depthProgress.toFixed(4),
    "--dog-bottom": `calc(26px + ${(1 - depthProgress) * 18}%)`,
    "--dog-safe-half-desktop": `${96 * 1.55 * dogOuterScale}px`,
    "--dog-safe-half-mobile": `${96 * 1.12 * dogOuterScale}px`,
    "--scene-background": `url("${scene.backgroundPath}")`,
  } as CSSProperties;
  const worldStyle = {
    "--dog-outer-scale": dogOuterScale.toFixed(4),
    "--bowl-x": `${pet.interactionAnchors.bowl.x}px`,
    "--bowl-y": `${pet.interactionAnchors.bowl.y}px`,
    "--ball-x": `${pet.interactionAnchors.ball.x}px`,
    "--ball-y": `${pet.interactionAnchors.ball.y}px`,
    "--shadow-width": `${pet.interactionAnchors.shadowWidth}px`,
    "--shadow-opacity": (0.16 + depthProgress * 0.12).toFixed(3),
  } as CSSProperties;

  return (
    <section className="pixel-dog-studio" aria-label="2D 互动像素宠物">
      <aside className="pixel-dog-intro">
        <p className="eyebrow">PIXEL PET · {pet.id.toUpperCase()}</p>
        <h1>和{pet.displayName}<br />一起玩</h1>
        <p>
          点击它打招呼，长按轻轻抚摸；用四个方向键带它散步，或者等它自己慢慢睡着。
        </p>

        <dl className="pixel-dog-facts">
          <div><dt>形象</dt><dd>{pet.breed} · 32 色像素</dd></div>
          <div><dt>状态</dt><dd>9 组互动动画</dd></div>
          <div><dt>输入</dt><dd>点击 · 长按 · 四方向键</dd></div>
        </dl>

        <div className="pixel-dog-selector-group" aria-label="选择宠物">
          <p>选择宠物</p>
          <div className="pixel-dog-pet-selector">
            {PETS.map((petOption) => (
              <button
                aria-label={`选择宠物：${petOption.displayName}·${petOption.breed}`}
                aria-pressed={petOption.id === petId}
                key={petOption.id}
                onClick={() => selectPet(petOption.id)}
                type="button"
              >
                <img alt="" src={petOption.basePath} />
                <strong>{petOption.displayName}</strong>
                <small>{petOption.breed}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="pixel-dog-selector-group" aria-label="选择场景">
          <p>选择场景</p>
          <div className="pixel-dog-scene-selector">
            {SCENES.map((sceneOption) => (
              <button
                aria-label={`切换场景：${sceneOption.displayName}`}
                aria-pressed={sceneOption.id === sceneId}
                key={sceneOption.id}
                onClick={() => selectScene(sceneOption.id)}
                type="button"
              >
                <img alt="" src={sceneOption.backgroundPath} />
                <strong>{sceneOption.displayName}</strong>
                <small>{sceneOption.description}</small>
              </button>
            ))}
          </div>
          <p aria-live="polite" className="pixel-dog-scene-feedback">
            当前场景：{scene.displayName}
          </p>
        </div>

        <p className="pixel-dog-tips">
          <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> 带{pet.displayName}在场景中散步。
        </p>
      </aside>

      <div
        aria-label={`${pet.displayName}的${scene.displayName}`}
        className="pixel-dog-room"
        data-pet={pet.id}
        data-scene={scene.id}
        data-state={state}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPointerDownCapture={wakeFromAmbientInput}
        role="region"
        tabIndex={0}
      >
        <div className="pixel-dog-room-bar" aria-hidden="true">
          <span>{pet.id.toUpperCase()}’S ROOM</span>
          <span>X {Math.round(stagePosition.x)} · Y {Math.round(stagePosition.y)}</span>
        </div>

        <div className="pixel-dog-scene" style={sceneStyle}>
          <div aria-hidden="true" className="pixel-dog-ambient" />

          <div
            className="pixel-dog-world"
            data-ball-side={propSide}
            data-state={state}
            style={worldStyle}
          >
            <div
              aria-live="polite"
              className="pixel-dog-state"
              role="status"
            >
              <span aria-hidden="true" />
              {pet.displayName}{clip.status}
            </div>

            <div className="pixel-dog-scale-layer">
              <div aria-hidden="true" className="pixel-dog-shadow" />

              {interactionProp && (
                <div
                  aria-label={interactionProp.label}
                  className={`pixel-dog-prop pixel-dog-prop--${interactionProp.modifier}`}
                  data-anchor={state === "playing-ball" ? "head-front" : undefined}
                  data-side={state === "playing-ball" ? propSide : undefined}
                  role="img"
                >
                  <span aria-hidden="true" />
                </div>
              )}

              {state === "feeding" && (
                <div
                  aria-label={`${pet.displayName}的食盆`}
                  className="pixel-dog-bowl"
                  data-anchor="mouth"
                  role="img"
                >
                  <span aria-hidden="true">•••</span>
                </div>
              )}

              <div className="pixel-dog-positioner">
                <img
                  alt=""
                  className="pixel-dog-asset-probe"
                  onError={() => setAssetFailed(true)}
                  src={pet.spritesheetPath}
                />
                {assetFailed ? (
                  <p className="pixel-dog-asset-error" role="alert">
                    {pet.displayName}的动画图集没有加载成功。
                  </p>
                ) : (
                  <button
                    aria-label={`抚摸或点击${pet.displayName}`}
                    className="pixel-dog-sprite"
                    data-action-facing={state === "playing-ball" ? propSide : undefined}
                    data-frame={frame}
                    data-state={state}
                    onClick={handleDogClick}
                    onPointerCancel={stopPetting}
                    onPointerDown={startPetting}
                    onPointerMove={continuePetting}
                    onPointerUp={stopPetting}
                    style={spriteStyle}
                    type="button"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pixel-dog-controls" aria-label={`${pet.displayName}互动操作`}>
          <div className="pixel-dog-move-controls">
            <button
              className="pixel-dog-move-controls__backward"
              aria-label="向后移动"
              onPointerCancel={() => interact({ type: "stop" })}
              onPointerDown={() => startMoving("backward")}
              onPointerLeave={() => interact({ type: "stop" })}
              onPointerUp={() => interact({ type: "stop" })}
              type="button"
            >
              ↑
            </button>
            <button
              className="pixel-dog-move-controls__left"
              aria-label="向左移动"
              onPointerCancel={() => interact({ type: "stop" })}
              onPointerDown={() => startMoving("left")}
              onPointerLeave={() => interact({ type: "stop" })}
              onPointerUp={() => interact({ type: "stop" })}
              type="button"
            >
              ←
            </button>
            <button
              className="pixel-dog-move-controls__forward"
              aria-label="向前移动"
              onPointerCancel={() => interact({ type: "stop" })}
              onPointerDown={() => startMoving("forward")}
              onPointerLeave={() => interact({ type: "stop" })}
              onPointerUp={() => interact({ type: "stop" })}
              type="button"
            >
              ↓
            </button>
            <button
              className="pixel-dog-move-controls__right"
              aria-label="向右移动"
              onPointerCancel={() => interact({ type: "stop" })}
              onPointerDown={() => startMoving("right")}
              onPointerLeave={() => interact({ type: "stop" })}
              onPointerUp={() => interact({ type: "stop" })}
              type="button"
            >
              →
            </button>
          </div>
          <label className="pixel-dog-size-control">
            <span>
              宠物大小
              <strong>{petSize}%</strong>
            </span>
            <input
              aria-label="宠物大小"
              max={MAX_PET_SIZE}
              min={MIN_PET_SIZE}
              onChange={(event) => {
                setPetSize(Number(event.currentTarget.value));
                wakeFromAmbientInput();
              }}
              step={PET_SIZE_STEP}
              type="range"
              value={petSize}
            />
          </label>
          <div className="pixel-dog-action-controls">
            <button onClick={() => interact({ type: "jump" })} type="button">
              跳跃
            </button>
            <button onClick={() => interact({ type: "feed" })} type="button">
              喂食
            </button>
            <button onClick={() => interact({ type: "play-ball" })} type="button">
              玩球
            </button>
            <button onClick={() => interact({ type: "groom" })} type="button">
              梳毛
            </button>
            <button onClick={() => interact({ type: "bathe" })} type="button">
              洗澡
            </button>
            <button onClick={() => interact({ type: "dance" })} type="button">
              跳舞
            </button>
            <button onClick={() => interact({ type: "pose" })} type="button">
              拍照
            </button>
            <button onClick={() => interact({ type: "wake" })} type="button">
              叫醒{pet.displayName}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
