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
  SPRITESHEET_PATH,
  WAITING_AFTER_MS,
  clampStagePosition,
  dogReducer,
  type DogEvent,
  type PixelDogState,
} from "./pixelDogModel";

const MOVE_STEP = 1.25;
const MOVE_INTERVAL_MS = 45;
const PETTING_DELAY_MS = 240;
const PETTING_DRAG_THRESHOLD = 7;

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

  const interact = useCallback((event: DogEvent) => {
    setActivityVersion((version) => version + 1);
    dispatch(event);
  }, []);

  const wakeFromAmbientInput = useCallback(() => {
    setActivityVersion((version) => version + 1);
    dispatch({ type: "wake" });
  }, []);

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
    backgroundImage: `url("${SPRITESHEET_PATH}")`,
    backgroundPosition: `${-frame * CELL_WIDTH}px ${-clip.row * CELL_HEIGHT}px`,
    backgroundSize: `${ATLAS_WIDTH}px ${ATLAS_HEIGHT}px`,
  };
  const positionStyle = {
    "--dog-position": `${stagePosition}%`,
  } as CSSProperties;

  return (
    <section className="pixel-dog-studio" aria-label="2D 互动像素宠物">
      <aside className="pixel-dog-intro">
        <p className="eyebrow">PIXEL PET · DOUBAO</p>
        <h1>和豆包<br />一起玩</h1>
        <p>
          点击它打招呼，长按轻轻抚摸；用方向键带它散步，或者等它自己慢慢睡着。
        </p>

        <dl className="pixel-dog-facts">
          <div><dt>形象</dt><dd>红柴犬 · 32 色像素</dd></div>
          <div><dt>状态</dt><dd>9 组互动动画</dd></div>
          <div><dt>输入</dt><dd>点击 · 长按 · 方向键</dd></div>
        </dl>

        <div className="pixel-dog-state" aria-live="polite" role="status">
          <span aria-hidden="true" />
          {clip.label}
        </div>
      </aside>

      <div
        aria-label="豆包的互动房间"
        className="pixel-dog-room"
        data-state={state}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPointerDownCapture={wakeFromAmbientInput}
        role="region"
        tabIndex={0}
      >
        <div className="pixel-dog-room-bar" aria-hidden="true">
          <span>DOUBAO’S ROOM</span>
          <span>{Math.round(stagePosition)} / 100</span>
        </div>

        <div className="pixel-dog-scene">
          <div className="pixel-dog-window" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="pixel-dog-shelf" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>

          {state === "feeding" && (
            <div
              aria-label="豆包的食盆"
              className="pixel-dog-bowl"
              role="img"
              style={positionStyle}
            >
              <span aria-hidden="true">•••</span>
            </div>
          )}

          <div className="pixel-dog-positioner" style={positionStyle}>
            <img
              alt=""
              className="pixel-dog-asset-probe"
              onError={() => setAssetFailed(true)}
              src={SPRITESHEET_PATH}
            />
            {assetFailed ? (
              <p className="pixel-dog-asset-error" role="alert">
                豆包的动画图集没有加载成功。
              </p>
            ) : (
              <button
                aria-label="抚摸或点击豆包"
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

        <div className="pixel-dog-controls" aria-label="豆包互动操作">
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
          <button onClick={() => interact({ type: "jump" })} type="button">
            跳跃
          </button>
          <button onClick={() => interact({ type: "feed" })} type="button">
            喂食
          </button>
          <button onClick={() => interact({ type: "wake" })} type="button">
            叫醒豆包
          </button>
        </div>
      </div>
    </section>
  );
}
