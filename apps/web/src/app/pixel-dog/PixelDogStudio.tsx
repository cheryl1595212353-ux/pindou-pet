import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
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
  MOOD_PRESENTATIONS,
  createPetReply,
  type PetReply,
} from "./petChatModel";
import {
  CHAT_HISTORY_LIMIT,
  requestPetChatReply,
  type ChatTurn,
} from "./petChatAgent";
import {
  DEFAULT_SCENE_ID,
  SCENES,
  getSceneById,
  type SceneId,
} from "./sceneCatalog";

const MOVE_STEP = 1.25;
const MOVE_INTERVAL_MS = 45;
const SCENE_BOTTOM_PADDING_PX = 26;
const DEFAULT_DOG_BASE_SCALE = 1.55;
const BACK_DEPTH_SCALE = 0.9;
const MIN_PET_SIZE = 70;
const MAX_PET_SIZE = 125;
const PET_SIZE_STEP = 5;
const PETTING_DELAY_MS = 240;
const PETTING_DRAG_THRESHOLD = 7;
const MOOD_BURST_MS = 3_200;
const TYPEWRITER_STEP_MS = 28;
const CHAT_REPLY_TIMEOUT_MS = 20_000;
const INTERACTION_PROPS: Partial<
  Record<PixelDogState, { readonly label: string; readonly modifier: string }>
> = {
  "playing-ball": { label: "玩具球", modifier: "ball" },
  grooming: { label: "梳毛刷", modifier: "brush" },
  bathing: { label: "淋浴花洒", modifier: "shower" },
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
    const loopStart = clip.loop ? (clip.loopStart ?? 0) : 0;
    // Reduced motion parks looping clips on their settled frame (e.g. the
    // curled-up asleep pose instead of the start of the lie-down).
    setFrame(reducedMotion ? loopStart : 0);

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
        currentFrame = loopStart;
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

function useTypewriterText(text: string, reducedMotion: boolean): string {
  const [visibleText, setVisibleText] = useState(reducedMotion ? text : "");

  useEffect(() => {
    if (!text || reducedMotion) {
      setVisibleText(text);
      return;
    }

    let visibleLength = 0;
    let timer = 0;
    setVisibleText("");
    const revealNextCharacter = () => {
      visibleLength += 1;
      setVisibleText(text.slice(0, visibleLength));
      if (visibleLength < text.length) {
        timer = window.setTimeout(revealNextCharacter, TYPEWRITER_STEP_MS);
      }
    };
    timer = window.setTimeout(revealNextCharacter, TYPEWRITER_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, text]);

  return visibleText;
}

export function PixelDogStudio() {
  const [state, dispatch] = useReducer(dogReducer, "idle");
  const [petId, setPetId] = useState<PetId>(DEFAULT_PET_ID);
  const [sceneId, setSceneId] = useState<SceneId>(DEFAULT_SCENE_ID);
  const [stagePosition, setStagePosition] = useState<StagePosition>(
    INITIAL_STAGE_POSITION,
  );
  const [walkTarget, setWalkTarget] = useState<StagePosition | null>(null);
  const [petSize, setPetSize] = useState(100);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [moodBurstVisible, setMoodBurstVisible] = useState(false);
  const [moodBurstId, setMoodBurstId] = useState(0);
  const [chatReply, setChatReply] = useState<PetReply>(() => createPetReply({
    message: "你好",
    pet: getPetById(DEFAULT_PET_ID),
    scene: getSceneById(DEFAULT_SCENE_ID),
    state: "idle",
  }));
  const [openPicker, setOpenPicker] = useState<"pet" | "scene" | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const [assetFailed, setAssetFailed] = useState(false);
  const [chatPending, setChatPending] = useState(false);
  const suppressClickRef = useRef(false);
  const pettingActiveRef = useRef(false);
  const pettingTimerRef = useRef(0);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const stagePositionRef = useRef(stagePosition);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatToggleRef = useRef<HTMLButtonElement>(null);
  const petPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const scenePickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pinnedPickerRef = useRef<"pet" | "scene" | null>(null);
  const openPickerRef = useRef<"pet" | "scene" | null>(null);
  const pickerPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pickerCooldownUntilRef = useRef(0);
  const chatHistoryRef = useRef<Map<PetId, ChatTurn[]>>(new Map());
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatRequestIdRef = useRef(0);
  const moodBurstTimerRef = useRef(0);
  const pickersRef = useRef<HTMLDivElement>(null);
  const pickerDismissedAtRef = useRef(0);
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
  const moodPresentation = MOOD_PRESENTATIONS[chatReply.mood];
  const typedReply = useTypewriterText(
    chatOpen && !chatPending ? chatReply.text : "",
    reducedMotion,
  );

  const interact = useCallback((event: DogEvent) => {
    setWalkTarget(null);
    setActivityVersion((version) => version + 1);
    dispatch(event);
  }, []);

  const handleSceneClick = (event: MouseEvent<HTMLDivElement>) => {
    const { currentTarget, target } = event;
    if (!(target instanceof Element)) return;
    if (Date.now() - pickerDismissedAtRef.current < 350) return;
    if (
      target.closest("[data-chat-control], .pixel-dog-world, button, input, a")
    ) {
      return;
    }
    const rect = currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    // Invert the --dog-bottom mapping so the shadow lands exactly on the
    // clicked pixel: bottom = padding + chatReserved + (1-depthProgress)*roam,
    // where roam is the scene height left after the bottom padding, any
    // reserved dialogue area, and the pet's own back-row height.
    const sceneStyles = window.getComputedStyle(currentTarget);
    const baseScale = Number.parseFloat(
      sceneStyles.getPropertyValue("--dog-base-scale"),
    ) || DEFAULT_DOG_BASE_SCALE;
    const chatReserved = Number.parseFloat(
      sceneStyles.getPropertyValue("--chat-reserved"),
    ) || 0;
    const sizeScale = petSize / 100;
    const roamPx = rect.height
      - SCENE_BOTTOM_PADDING_PX
      - chatReserved
      - CELL_HEIGHT * baseScale * BACK_DEPTH_SCALE * sizeScale;
    const minBottom = SCENE_BOTTOM_PADDING_PX + chatReserved;
    const clickedBottom = rect.height - (event.clientY - rect.top);
    const destinationBottom = Math.min(
      minBottom + Math.max(roamPx, 0),
      Math.max(minBottom, clickedBottom),
    );
    const destinationDepthProgress = roamPx > 0
      ? 1 - (destinationBottom - minBottom) / roamPx
      : 1;
    const destinationY = MIN_STAGE_DEPTH
      + destinationDepthProgress * (MAX_STAGE_DEPTH - MIN_STAGE_DEPTH);
    // Invert --dog-left likewise: left = safeHalf + (width-2*safeHalf)*xProgress.
    const safeHalfPx = 96 * baseScale * sizeScale * getDepthScale(destinationY);
    const horizontalSpan = rect.width - safeHalfPx * 2;
    const destinationProgress = horizontalSpan > 0
      ? Math.min(
        1,
        Math.max(
          0,
          ((event.clientX - rect.left) - safeHalfPx) / horizontalSpan,
        ),
      )
      : 0.5;
    const destination = clampStagePosition({
      x: MIN_STAGE_POSITION
        + destinationProgress * (MAX_STAGE_POSITION - MIN_STAGE_POSITION),
      y: destinationY,
    });
    setActivityVersion((version) => version + 1);
    if (reducedMotion) {
      stagePositionRef.current = destination;
      setStagePosition(destination);
      return;
    }
    setWalkTarget(destination);
  };

  const triggerMoodBurst = useCallback(() => {
    window.clearTimeout(moodBurstTimerRef.current);
    setMoodBurstId((id) => id + 1);
    setMoodBurstVisible(true);
    moodBurstTimerRef.current = window.setTimeout(
      () => setMoodBurstVisible(false),
      MOOD_BURST_MS,
    );
  }, []);

  const wakeFromAmbientInput = useCallback(() => {
    setActivityVersion((version) => version + 1);
    dispatch({ type: "wake" });
  }, []);

  const handleRoomPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.target instanceof Element
      && event.target.closest("[data-chat-control]")
    ) {
      return;
    }
    wakeFromAmbientInput();
  };

  const startMoving = useCallback((direction: MoveDirection) => {
    const delta = MOVEMENT_DELTAS[direction];
    setStagePosition((position) => clampStagePosition({
      x: position.x + delta.x,
      y: position.y + delta.y,
    }));
    interact({ type: "move", direction });
  }, [interact]);

  const selectPet = (nextPetId: PetId) => {
    dismissPicker({ cooldown: true });
    if (nextPetId === petId) return;
    const nextPet = getPetById(nextPetId);
    // Invalidate any in-flight reply so the previous pet's answer never
    // lands in the newly selected pet's dialogue.
    chatRequestIdRef.current += 1;
    chatAbortRef.current?.abort();
    setChatPending(false);
    setPetId(nextPetId);
    setAssetFailed(false);
    if (chatOpen) {
      setChatReply(createPetReply({
        message: "你好",
        pet: nextPet,
        scene,
        state,
      }));
      setChatInput("");
      setLastUserMessage(null);
      triggerMoodBurst();
    }
    interact({ type: "wake" });
  };

  const selectScene = (nextSceneId: SceneId) => {
    dismissPicker({ cooldown: true });
    setSceneId(nextSceneId);
    interact({ type: "wake" });
  };

  // Hover only previews when nothing is pinned: a pinned panel stays open
  // until an explicit click, selection, Escape, or outside press, so casually
  // brushing the other trigger can never silently drop the pin. A preview
  // closes the moment the pointer leaves sideways or downward, but leaving
  // upward — back toward the trigger tab — keeps it open.
  const previewPicker = (picker: "pet" | "scene", event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    if (pinnedPickerRef.current) return;
    // Skip the instant re-preview that fires when the closing panel uncovers
    // the trigger sitting under the cursor right after a selection.
    if (Date.now() < pickerCooldownUntilRef.current) return;
    pickerPointerRef.current = { x: event.clientX, y: event.clientY };
    setOpenPicker(picker);
  };

  const trackPickerPointer = (event: PointerEvent<HTMLDivElement>) => {
    pickerPointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const unpreviewPicker = (
    picker: "pet" | "scene",
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (pinnedPickerRef.current) return;
    if (openPickerRef.current !== picker) return;
    const previous = pickerPointerRef.current;
    pickerPointerRef.current = null;
    // Moving back up toward the trigger tab is not an exit.
    if (previous && event.clientY < previous.y) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY <= rect.top + 2) return;
    setOpenPicker(null);
  };

  const togglePicker = (picker: "pet" | "scene") => {
    pickerPointerRef.current = null;
    if (pinnedPickerRef.current === picker) {
      pinnedPickerRef.current = null;
      setOpenPicker(null);
    } else {
      pinnedPickerRef.current = picker;
      setOpenPicker(picker);
    }
    wakeFromAmbientInput();
  };

  function dismissPicker({ cooldown = false }: { cooldown?: boolean } = {}) {
    pinnedPickerRef.current = null;
    if (cooldown) pickerCooldownUntilRef.current = Date.now() + 500;
    pickerPointerRef.current = null;
    setOpenPicker(null);
  }

  const handlePickerKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    picker: "pet" | "scene",
  ) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    dismissPicker();
    (picker === "pet" ? petPickerTriggerRef : scenePickerTriggerRef)
      .current?.focus();
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
    stagePositionRef.current = stagePosition;
  }, [stagePosition]);

  useEffect(() => {
    openPickerRef.current = openPicker;
  }, [openPicker]);

  useEffect(() => {
    if (reducedMotion || !walkTarget) return;
    let activeDirection: MoveDirection | null = null;
    const walkTimer = window.setInterval(() => {
      const position = stagePositionRef.current;
      const deltaX = walkTarget.x - position.x;
      const deltaY = walkTarget.y - position.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance <= MOVE_STEP) {
        stagePositionRef.current = walkTarget;
        setStagePosition(walkTarget);
        setWalkTarget(null);
        dispatch({ type: "stop" });
        return;
      }
      const nextPosition = clampStagePosition({
        x: position.x + (deltaX / distance) * MOVE_STEP,
        y: position.y + (deltaY / distance) * MOVE_STEP,
      });
      stagePositionRef.current = nextPosition;
      setStagePosition(nextPosition);
      // Any meaningful horizontal drift runs sideways (matching the drift
      // direction); forward/backward is reserved for near-pure vertical
      // walks, since those clips reuse the lateral run rows.
      const nextDirection: MoveDirection = Math.abs(deltaX) >= MOVE_STEP * 0.6
        ? (deltaX > 0 ? "right" : "left")
        : (deltaY > 0 ? "forward" : "backward");
      if (nextDirection !== activeDirection) {
        activeDirection = nextDirection;
        dispatch({ type: "move", direction: nextDirection });
      }
    }, MOVE_INTERVAL_MS);
    return () => window.clearInterval(walkTimer);
  }, [reducedMotion, walkTarget]);

  useEffect(() => {
    if (reducedMotion || walkTarget || !state.startsWith("moving-")) {
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
  }, [reducedMotion, state, walkTarget]);

  useEffect(() => () => {
    window.clearTimeout(pettingTimerRef.current);
    window.clearTimeout(moodBurstTimerRef.current);
    chatRequestIdRef.current += 1;
    chatAbortRef.current?.abort();
  }, []);

  // Any open panel behaves like a small menu: pressing anywhere outside the
  // picker area dismisses it, so it can never get stuck open.
  useEffect(() => {
    const handleOutsidePointerDown = (event: globalThis.PointerEvent) => {
      if (!pinnedPickerRef.current && !openPickerRef.current) return;
      if (
        event.target instanceof Node
        && pickersRef.current?.contains(event.target)
      ) {
        return;
      }
      pinnedPickerRef.current = null;
      setOpenPicker(null);
      // The press that dismisses the panel is consumed by the dismissal; it
      // must not also walk the pet or trigger whatever lies underneath.
      pickerDismissedAtRef.current = Date.now();
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  useEffect(() => {
    if (chatOpen) {
      chatInputRef.current?.focus();
    }
  }, [chatOpen, petId]);

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

  const openChat = () => {
    setChatReply(createPetReply({
      message: "你好",
      pet,
      scene,
      state,
    }));
    setLastUserMessage(null);
    setChatOpen(true);
    triggerMoodBurst();
    interact({ type: "wake" });
  };

  const closeChat = () => {
    chatToggleRef.current?.focus();
    setChatOpen(false);
  };

  const submitChatMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatPending) return;
    // The local generator always provides the mood and an instant fallback;
    // DeepSeek then rewrites the text in character when it is reachable.
    const localReply = createPetReply({ message, pet, scene, state });
    const history = chatHistoryRef.current.get(pet.id) ?? [];
    setLastUserMessage(message);
    setChatInput("");
    setChatPending(true);
    interact({ type: "wake" });

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const requestId = ++chatRequestIdRef.current;
    const timeout = window.setTimeout(
      () => controller.abort(),
      CHAT_REPLY_TIMEOUT_MS,
    );

    let reply = localReply;
    try {
      const aiText = await requestPetChatReply({
        message,
        pet,
        scene,
        state,
        history,
        signal: controller.signal,
      });
      reply = { ...localReply, text: aiText };
    } catch {
      // DeepSeek unavailable (no key, offline, timeout) → keep the local reply.
    } finally {
      window.clearTimeout(timeout);
    }
    if (requestId !== chatRequestIdRef.current) return;

    const nextHistory: ChatTurn[] = [
      ...history,
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: reply.text },
    ].slice(-CHAT_HISTORY_LIMIT);
    chatHistoryRef.current.set(pet.id, nextHistory);
    setChatReply(reply);
    setChatPending(false);
    triggerMoodBurst();
  };

  const sendChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitChatMessage();
  };

  const handleChatInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      closeChat();
      return;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitChatMessage();
    }
  };

  const spriteStyle: CSSProperties = {
    backgroundImage: `url("${pet.spritesheetPath}")`,
    backgroundPosition: `${-frame * CELL_WIDTH}px ${-clip.row * CELL_HEIGHT}px`,
    backgroundSize: `${ATLAS_WIDTH}px ${ATLAS_HEIGHT}px`,
  };
  const sceneStyle = {
    "--dog-x-progress": horizontalProgress.toFixed(4),
    "--dog-depth-progress": depthProgress.toFixed(4),
    "--dog-size-scale": (petSize / 100).toFixed(3),
    // Roam the whole scene height: the band tops out where the pet's head
    // touches the scene ceiling (using the smaller back-row scale), so a
    // clicked spot can never push the sprite out of frame. max() keeps the
    // feet at the padding line when the scene is too short to roam.
    "--dog-bottom": `max(${SCENE_BOTTOM_PADDING_PX}px + var(--chat-reserved, 0px), calc(${SCENE_BOTTOM_PADDING_PX}px + var(--chat-reserved, 0px) + ${(1 - depthProgress).toFixed(4)} * (100% - ${SCENE_BOTTOM_PADDING_PX}px - var(--chat-reserved, 0px) - ${CELL_HEIGHT}px * var(--dog-base-scale, ${DEFAULT_DOG_BASE_SCALE}) * ${BACK_DEPTH_SCALE} * var(--dog-size-scale, 1))))`,
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
    "--shadow-sleep-lift": `${pet.interactionAnchors.shadowSleepLift}px`,
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

        <div className="pixel-dog-pickers" ref={pickersRef}>
          <div
            className="pixel-dog-picker"
            data-open={openPicker === "pet" ? "true" : undefined}
            onKeyDown={(event) => handlePickerKeyDown(event, "pet")}
            onPointerEnter={(event) => previewPicker("pet", event)}
            onPointerLeave={(event) => unpreviewPicker("pet", event)}
            onPointerMove={trackPickerPointer}
          >
            <button
              aria-expanded={openPicker === "pet"}
              aria-haspopup="dialog"
              aria-label={`更换宠物（当前：${pet.displayName}·${pet.breed}）`}
              className="pixel-dog-picker__trigger"
              onClick={() => togglePicker("pet")}
              ref={petPickerTriggerRef}
              type="button"
            >
              <img alt="" src={pet.basePath} />
              <span>
                <small>宠物</small>
                <strong>{pet.displayName}</strong>
              </span>
              <i aria-hidden="true">▾</i>
            </button>
            {openPicker === "pet" && (
              <div
                aria-label="选择宠物"
                className="pixel-dog-picker__panel"
                role="dialog"
              >
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
            )}
          </div>

          <div
            className="pixel-dog-picker"
            data-open={openPicker === "scene" ? "true" : undefined}
            onKeyDown={(event) => handlePickerKeyDown(event, "scene")}
            onPointerEnter={(event) => previewPicker("scene", event)}
            onPointerLeave={(event) => unpreviewPicker("scene", event)}
            onPointerMove={trackPickerPointer}
          >
            <button
              aria-expanded={openPicker === "scene"}
              aria-haspopup="dialog"
              aria-label={`更换场景（当前：${scene.displayName}）`}
              className="pixel-dog-picker__trigger"
              onClick={() => togglePicker("scene")}
              ref={scenePickerTriggerRef}
              type="button"
            >
              <img alt="" src={scene.backgroundPath} />
              <span>
                <small>场景</small>
                <strong>{scene.displayName}</strong>
              </span>
              <i aria-hidden="true">▾</i>
            </button>
            {openPicker === "scene" && (
              <div
                aria-label="选择场景"
                className="pixel-dog-picker__panel"
                role="dialog"
              >
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
              </div>
            )}
          </div>
        </div>
        <p aria-live="polite" className="pixel-dog-scene-feedback">
          当前场景：{scene.displayName}
        </p>

        <p className="pixel-dog-tips">
          <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> 带{pet.displayName}散步，或点击场景让它自己走过去。
        </p>
      </aside>

      <div className="pixel-dog-stage">
        <div
          aria-label={`${pet.displayName}的${scene.displayName}`}
          className="pixel-dog-room"
          data-chat-open={chatOpen}
          data-pet={pet.id}
          data-scene={scene.id}
          data-state={state}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPointerDownCapture={handleRoomPointerDownCapture}
          role="region"
          tabIndex={0}
        >
          <div className="pixel-dog-room-bar" aria-hidden="true">
            <span>{pet.id.toUpperCase()}’S ROOM</span>
            <span>X {Math.round(stagePosition.x)} · Y {Math.round(stagePosition.y)}</span>
          </div>

          <div className="pixel-dog-scene" onClick={handleSceneClick} style={sceneStyle}>
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

              {state === "bathing" && (
                <div aria-hidden="true" className="pixel-dog-shower-rain" />
              )}

              {moodBurstVisible && (
                <div
                  aria-label={`${pet.displayName}的${moodPresentation.label}情绪`}
                  className="pixel-dog-mood-burst"
                  data-mood={chatReply.mood}
                  key={moodBurstId}
                  role="img"
                >
                  <span className="pixel-dog-mood-burst__emoticon">
                    {moodPresentation.emoticon}
                  </span>
                  {moodPresentation.tokens.map((token, index) => (
                    <span
                      className="pixel-dog-mood-burst__token"
                      data-token={index + 1}
                      key={`${token}-${index}`}
                    >
                      {token}
                    </span>
                  ))}
                </div>
              )}

              {interactionProp && (
                <div
                  aria-label={interactionProp.label}
                  className={`pixel-dog-prop pixel-dog-prop--${interactionProp.modifier}`}
                  data-anchor={state === "playing-ball" ? "head-front" : undefined}
                  data-side={state === "playing-ball" ? propSide : undefined}
                  role="img"
                >
                  {interactionProp.modifier === "shower" ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="pixel-dog-prop--shower__pipe"
                      />
                      <span
                        aria-hidden="true"
                        className="pixel-dog-prop--shower__head"
                      />
                      <span
                        aria-hidden="true"
                        className="pixel-dog-prop--shower__drops"
                      />
                      <span
                        aria-hidden="true"
                        className="pixel-dog-prop--shower__bubbles"
                      />
                      <span
                        aria-hidden="true"
                        className="pixel-dog-prop--shower__splash"
                      />
                    </>
                  ) : (
                    <span aria-hidden="true" />
                  )}
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

          <p
            aria-label={`${pet.displayName}的完整回复`}
            aria-live="polite"
            className="pixel-dog-visually-hidden"
          >
            {chatOpen
              ? (chatPending ? `${pet.displayName}正在思考回复` : chatReply.text)
              : ""}
          </p>

          {chatOpen && (
            <section
              aria-label={`和${pet.displayName}聊天`}
              className="pixel-dog-dialogue"
              data-chat-control=""
              data-mood={chatReply.mood}
            >
              <header>
                <strong>{pet.displayName}</strong>
                <span>{moodPresentation.label}</span>
                <span aria-label={`${pet.displayName}的颜文字`}>
                  {moodPresentation.emoticon}
                </span>
                <button
                  aria-label="关闭对话"
                  onClick={closeChat}
                  type="button"
                >
                  ×
                </button>
              </header>
              <p className="pixel-dog-dialogue__profile">
                {pet.persona.ageLabel} · {pet.breed} · 最爱{pet.persona.favoriteFood}
              </p>
              {lastUserMessage && (
                <p className="pixel-dog-dialogue__user">
                  你：{lastUserMessage}
                </p>
              )}
              <p
                aria-hidden="true"
                className="pixel-dog-dialogue__typed-reply"
                data-pending={chatPending || undefined}
              >
                {chatPending ? `${pet.displayName}正在想` : typedReply}
                <span className="pixel-dog-dialogue__cursor" />
              </p>
              <form onSubmit={sendChatMessage}>
                <input
                  aria-label={`对${pet.displayName}说点什么`}
                  disabled={chatPending}
                  maxLength={80}
                  onChange={(event) => setChatInput(event.currentTarget.value)}
                  onKeyDown={handleChatInputKeyDown}
                  onKeyUp={(event) => event.stopPropagation()}
                  placeholder={chatPending ? "等它回复完再说……" : "说点什么……"}
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                />
                <button
                  aria-label={`发送给${pet.displayName}`}
                  disabled={chatPending || !chatInput.trim()}
                  type="submit"
                >
                  发送
                </button>
              </form>
            </section>
          )}
          </div>
        </div>

        <div className="pixel-dog-controls" aria-label={`${pet.displayName}互动操作`}>
          <div className="pixel-dog-move-controls">
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
            <button
              aria-expanded={chatOpen}
              data-chat-control=""
              onClick={chatOpen ? closeChat : openChat}
              ref={chatToggleRef}
              type="button"
            >
              和{pet.displayName}聊天
            </button>
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
