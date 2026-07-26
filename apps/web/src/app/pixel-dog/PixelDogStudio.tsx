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
  SLEEPING_AFTER_MS,
  WAITING_AFTER_MS,
  clampStagePosition,
  dogReducer,
  getPropSide,
  type DogEvent,
  type PixelDogState,
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
  const [stagePosition, setStagePosition] = useState(50);
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
  const propSide = getPropSide(stagePosition);

  const interact = useCallback((event: DogEvent) => {
    setActivityVersion((version) => version + 1);
    dispatch(event);
  }, []);

  const wakeFromAmbientInput = useCallback(() => {
    setActivityVersion((version) => version + 1);
    dispatch({ type: "wake" });
  }, []);

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
    if (
      reducedMotion
      || (state !== "moving-left" && state !== "moving-right")
    ) {
      return;
    }
    const direction = state === "moving-left" ? -1 : 1;
    const movementTimer = window.setInterval(() => {
      setStagePosition((position) => clampStagePosition(position + direction * MOVE_STEP));
    }, MOVE_INTERVAL_MS);
    return () => window.clearInterval(movementTimer);
  }, [reducedMotion, state]);

  useEffect(
    () => () => window.clearTimeout(pettingTimerRef.current),
    [],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.repeat) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      interact({
        type: "move",
        direction: event.key === "ArrowLeft" ? "left" : "right",
      });
      return;
    }
    wakeFromAmbientInput();
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
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
    "--dog-ratio": (stagePosition / 100).toFixed(4),
    "--scene-background": `url("${scene.backgroundPath}")`,
  } as CSSProperties;

  return (
    <section className="pixel-dog-studio" aria-label="2D 互动像素宠物">
      <aside className="pixel-dog-intro">
        <p className="eyebrow">PIXEL PET · {pet.id.toUpperCase()}</p>
        <h1>和{pet.displayName}<br />一起玩</h1>
        <p>
          点击它打招呼，长按轻轻抚摸；用方向键带它散步，或者等它自己慢慢睡着。
        </p>

        <dl className="pixel-dog-facts">
          <div><dt>形象</dt><dd>{pet.breed} · 32 色像素</dd></div>
          <div><dt>状态</dt><dd>9 组互动动画</dd></div>
          <div><dt>输入</dt><dd>点击 · 长按 · 方向键</dd></div>
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
          <kbd>←</kbd> <kbd>→</kbd> 带{pet.displayName}散步，点击它打招呼，长按可以抚摸它。
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
          <span>{Math.round(stagePosition)} / 100</span>
        </div>

        <div className="pixel-dog-scene" style={sceneStyle}>
          <div className="pixel-dog-sunpatch" aria-hidden="true" />
          <div className="pixel-dog-window" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="pixel-dog-frames" aria-hidden="true">
            <i />
            <i />
          </div>
          <div className="pixel-dog-shelf" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="pixel-dog-plant" aria-hidden="true" />
          <div className="pixel-dog-rug" aria-hidden="true" />

          <div
            aria-live="polite"
            className="pixel-dog-state"
            role="status"
          >
            <span aria-hidden="true" />
            {pet.displayName}{clip.status}
          </div>

          {interactionProp && (
            <div
              aria-label={interactionProp.label}
              className={`pixel-dog-prop pixel-dog-prop--${interactionProp.modifier}`}
              role="img"
            >
              <span aria-hidden="true" />
            </div>
          )}

          {state === "feeding" && (
            <div
              aria-label={`${pet.displayName}的食盆`}
              className="pixel-dog-bowl"
              data-side={propSide}
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

        <div className="pixel-dog-controls" aria-label={`${pet.displayName}互动操作`}>
          <div className="pixel-dog-move-controls">
            <button
              aria-label="向左移动"
              onPointerDown={() => interact({ type: "move", direction: "left" })}
              onPointerLeave={() => interact({ type: "stop" })}
              onPointerUp={() => interact({ type: "stop" })}
              type="button"
            >
              ←
            </button>
            <button
              aria-label="向右移动"
              onPointerDown={() => interact({ type: "move", direction: "right" })}
              onPointerLeave={() => interact({ type: "stop" })}
              onPointerUp={() => interact({ type: "stop" })}
              type="button"
            >
              →
            </button>
          </div>
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
