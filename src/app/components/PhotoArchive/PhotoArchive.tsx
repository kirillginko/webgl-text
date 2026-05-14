"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import styles from "./PhotoArchive.module.css";
import type { WarpRelease } from "@/app/types/warp";

// ── Data ──────────────────────────────────────────────────────────────────────

type Album = {
  id: string;
  idx: number;
  release: WarpRelease; // every card has a release — no HSL-only fallback
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalize artist names so casing variants ("Boards Of Canada" vs "Boards of Canada")
// are treated as the same artist.
function normalizeArtist(name: string): string {
  return name.trim().toLowerCase();
}

function albumHSL(idx: number): string {
  const h = (idx * 73) % 360;
  const s = 20 + ((idx * 37) % 40);
  const l = 28 + ((idx * 53) % 45);
  return `hsl(${h},${s}%,${l}%)`;
}

// Exponential lerp — frame-rate independent, asymptotically approaches target.
// Naturally eases out: fast initial movement, smooth arrival, no overshoot/jitter.
function lerp(a: number, b: number, dt: number, speed = 10) {
  return b + (a - b) * Math.exp(-dt * speed);
}

// BasicMaterial — no lighting calculations, 3-4× cheaper than StandardMaterial
const SIDE_MAT = new THREE.MeshBasicMaterial({ color: "#111" });

// Single shared loader
const TEXTURE_LOADER = new THREE.TextureLoader();

// Module-level texture store: url → fully-loaded THREE.Texture (or undefined while loading).
// Populated eagerly by PhotoArchive as soon as album data is available so all 400 downloads
// start immediately at full browser connection-pool throughput (6 concurrent), regardless
// of the progressive card-mounting animation pace.
const TEXTURE_STORE = new Map<string, THREE.Texture>();

const CARD_W = 1.45;
const CARD_H = 1.45;
const CARD_D = 0.045;
const SPACING = 0.105;

// Locked camera position (matches Canvas camera prop)
const CAM_POS = new THREE.Vector3(-7.76, 0.44, 12.94);

// Camera positions for each view mode
const STACK_CAM_POS = new THREE.Vector3(-7.76, 0.44, 12.94);
const CIRCLE_CAM_POS = new THREE.Vector3(0, 12, 28); // skewed 3/4 perspective over the ring

// Where the expanded card sits in world space — above the stack, centered
const SEL_WORLD = new THREE.Vector3(-1, 3.2, 3);
const SEL_SCALE = 2.45;

// Viewport-aligned quaternion for the expanded card (scene-level, no group).
// +Z = camera's backward direction (perpendicular to screen plane → no perspective warp).
// +Y = world up (no roll).
const FACE_CAM_QUAT = (() => {
  const forward = CAM_POS.clone().normalize(); // from scene toward camera
  const right = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), forward)
    .normalize();
  const up = new THREE.Vector3().crossVectors(forward, right);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, forward),
  );
})();

// World-space transform of the AlbumStack group — lets ExpandedCard compute
// any card's world position without needing a live group ref.
const STACK_GROUP_MATRIX = new THREE.Matrix4().compose(
  new THREE.Vector3(-5.5, 0, 1),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, -0.7, 0.05, "XYZ")),
  new THREE.Vector3(1, 1, 1),
);

// Stack group's world-space quaternion — used to lerp orientation during fly-out
const STACK_GROUP_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.15, -0.7, 0.05, "XYZ"),
);

// Ripple constants — how far the wave spreads and how high neighbours lift
const RIPPLE_RADIUS = 16; // cards on each side that feel the lift
const RIPPLE_LIFT = 3.2; // max Y rise at the wave peak
const RIPPLE_SPREAD = 8; // card-slots of lateral gap at distance 1

// ── Expand animation — computed in AlbumStack group LOCAL space ───────────────
// Each AlbumCard's visual mesh animates within its own group hierarchy.
// One mesh per card — no ExpandedCard duplicate ever exists.

const STACK_GROUP_MATRIX_INV = new THREE.Matrix4()
  .copy(STACK_GROUP_MATRIX)
  .invert();
// SEL_WORLD expressed in stack-group local space
const SEL_LOCAL_POS = SEL_WORLD.clone().applyMatrix4(STACK_GROUP_MATRIX_INV);
// FACE_CAM_QUAT in stack-group local space: q_local = STACK_GROUP_QUAT⁻¹ × q_world
const SEL_LOCAL_QUAT = new THREE.Quaternion()
  .copy(STACK_GROUP_QUAT)
  .invert()
  .multiply(FACE_CAM_QUAT);

// ── Circle-view expand — centered in front of the circle camera ───────────────
// Card appears large, centered, and face-on to the overhead camera.
const SEL_WORLD_CIRCLE = new THREE.Vector3(0, 5, 14);

const FACE_CIRCLE_CAM_QUAT = (() => {
  // The card should face the circle camera: its +Z points toward CIRCLE_CAM_POS.
  const forward = CIRCLE_CAM_POS.clone().normalize(); // camera is at (0,12,28)
  const right = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), forward)
    .normalize();
  const up = new THREE.Vector3().crossVectors(forward, right);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, forward),
  );
})();

// SEL_WORLD_CIRCLE in stack-group local space
const SEL_LOCAL_POS_CIRCLE = SEL_WORLD_CIRCLE.clone().applyMatrix4(
  STACK_GROUP_MATRIX_INV,
);
// FACE_CIRCLE_CAM_QUAT in stack-group local space
const SEL_LOCAL_QUAT_CIRCLE = new THREE.Quaternion()
  .copy(STACK_GROUP_QUAT)
  .invert()
  .multiply(FACE_CIRCLE_CAM_QUAT);

// ── Circle view ───────────────────────────────────────────────────────────────
// Radius and slot count are computed dynamically from albums.length in AlbumStack
// and passed down as props, so every album always gets a ring slot.

// World Y (0,1,0) expressed in stack-group local space — used for vertical lifts
// in the ring (hover pop, ripple wave). Computed once at module level.
const CIRCLE_UP_LOCAL = new THREE.Vector3(0, 1, 0).applyQuaternion(
  new THREE.Quaternion()
    .copy(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.15, -0.7, 0.05, "XYZ"),
      ),
    )
    .invert(),
);

// ── AlbumCard ─────────────────────────────────────────────────────────────────

const RIPPLE_DECAY = 4.0; // exponential decay rate (higher = faster fade)
const RIPPLE_WINDOW = 1500; // ms after which ripple is considered gone

// ── Deal-in animation — calm sequential slide ─────────────────────────────────
// Cards are ALL mounted immediately (for fast texture loading) but each waits
// dealDelayMs before starting its slide-in, preserving the one-by-one feel.
const DEAL_BATCH = 2; // cards that share the same deal-start tick
const DEAL_INTERVAL = 12; // ms between ticks
const DEAL_SPEED = 3.2; // linear-t rate → each card slides in over ~0.31 s
// Every card slides from this fixed local offset to (0,0,0) — calm, consistent
const DEAL_OFFSET = new THREE.Vector3(-3.5, 1.2, 0);

function AlbumCard({
  album,
  basePos,
  mouseHoveredIdx,
  mouseHoveredFilteredIdx,
  rippleTs,
  rippleCenterRef,
  isSelected,
  circularView,
  circularSlot,
  circularRadius,
  totalCircularSlots,
  dealDelayMs,
  filteredIdx,
  onOver,
  onOut,
  onClick,
}: {
  album: Album;
  basePos: [number, number, number];
  mouseHoveredIdx: number;
  /** filteredIdx of the currently hovered card (-1 if none) — used for compact-stack ripple */
  mouseHoveredFilteredIdx: number;
  rippleTs: React.RefObject<number>;
  rippleCenterRef: React.RefObject<number>;
  isSelected: boolean;
  circularView: boolean;
  /** Index in the ring (0 … totalCircularSlots-1) — every album always gets a slot */
  circularSlot: number;
  /** World-space radius of the album ring */
  circularRadius: number;
  /** Total number of albums in the ring (= albums.length) */
  totalCircularSlots: number;
  /** Milliseconds after mount before this card starts its deal animation */
  dealDelayMs: number;
  /**
   * Position in the current filter's compact stack (0, 1, 2 …), or -1 if this
   * card is filtered out.  Equals album.idx when no filter is active ("all").
   */
  filteredIdx: number;
  onOver: () => void;
  onOut: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const hovered = mouseHoveredIdx === album.idx;

  const frontMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: albumHSL(album.idx) }),
    [album.idx],
  );

  useEffect(() => {
    const coverUrl = album.release.coverUrl;
    if (!coverUrl) return;

    const apply = (tex: THREE.Texture) => {
      frontMat.map = tex;
      frontMat.color.set("#ffffff");
      frontMat.needsUpdate = true;
    };

    // Fast path: texture already in store (preloaded before this card mounted)
    const stored = TEXTURE_STORE.get(coverUrl);
    if (stored) {
      apply(stored);
      return;
    }

    // Slow path: still in flight — load it; browser HTTP cache makes this a fast
    // cache-hit once the preloader's request for the same URL has landed.
    let cancelled = false;
    const texture = TEXTURE_LOADER.load(
      coverUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        TEXTURE_STORE.set(coverUrl, tex);
        apply(tex);
      },
      undefined,
      () => {},
    );
    return () => {
      cancelled = true;
      texture.dispose();
      if (frontMat.map === texture) {
        frontMat.map = null;
        frontMat.color.set(albumHSL(album.idx));
        frontMat.needsUpdate = true;
      }
    };
  }, [album.release?.coverUrl, album.idx, frontMat]);

  const materials = useMemo(
    () => [SIDE_MAT, SIDE_MAT, SIDE_MAT, SIDE_MAT, frontMat, frontMat],
    [frontMat],
  );

  const identityQuat = useRef(new THREE.Quaternion());
  const animT = useRef(0); // 0 = in stack, 1 = fully expanded
  const wasSelected = useRef(false);
  // Stack ↔ circle transition progress: 0 = fully in stack, 1 = fully in ring
  const circularT = useRef(0);
  const transitionTs = useRef(0); // seconds — when this card is scheduled to start moving
  const prevCircView = useRef(false);
  // Deal-in animation: 0 = in the deck, 1 = dealt (one-shot on mount)
  const dealT = useRef(0);
  // Absolute ms timestamp when this card's deal animation should start.
  // Captured once on mount so it never changes even if dealDelayMs prop drifts.
  const dealStartAbsMs = useRef(performance.now() + dealDelayMs);

  // Expanded target in BASE-group local space (SEL_LOCAL_POS minus this card's basePos offset)
  const expandedLocalPos = useMemo(
    () =>
      new THREE.Vector3(
        SEL_LOCAL_POS.x - basePos[0],
        SEL_LOCAL_POS.y - basePos[1],
        SEL_LOCAL_POS.z - basePos[2],
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Circle-view expanded target — scaled with circularRadius so the selected card
  // always appears comfortably in front of the (dynamic) circle camera.
  const expandedLocalPosCircle = useMemo(() => {
    const selWorld = new THREE.Vector3(
      0,
      circularRadius * 0.25,
      circularRadius * 0.7,
    );
    const selLocal = selWorld.clone().applyMatrix4(STACK_GROUP_MATRIX_INV);
    return new THREE.Vector3(
      selLocal.x - basePos[0],
      selLocal.y - basePos[1],
      selLocal.z - basePos[2],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circularRadius]);

  // Circular layout — position and orientation in BASE-group local space.
  const circularLocalPos = useMemo(() => {
    const theta = (2 * Math.PI * circularSlot) / totalCircularSlots;
    const worldPos = new THREE.Vector3(
      circularRadius * Math.cos(theta),
      8,
      circularRadius * Math.sin(theta),
    );
    const stackLocal = worldPos.clone().applyMatrix4(STACK_GROUP_MATRIX_INV);
    return new THREE.Vector3(
      stackLocal.x - basePos[0],
      stackLocal.y - basePos[1],
      stackLocal.z - basePos[2],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circularSlot, circularRadius, totalCircularSlots]);

  const circularLocalQuat = useMemo(() => {
    const theta = (2 * Math.PI * circularSlot) / totalCircularSlots;
    // Card faces outward: +Z of mesh points away from ring center
    const forward = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const right = new THREE.Vector3(Math.sin(theta), 0, -Math.cos(theta));
    const up = new THREE.Vector3(0, 1, 0);
    const worldQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, forward),
    );
    return new THREE.Quaternion()
      .copy(STACK_GROUP_QUAT)
      .invert()
      .multiply(worldQuat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circularSlot, totalCircularSlots]);

  // Hover position: circularLocalPos + 1.4 units along world-up in local space.
  const circularHoverPos = useMemo(() => {
    return circularLocalPos.clone().addScaledVector(CIRCLE_UP_LOCAL, 1.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circularSlot, circularLocalPos]);

  useFrame((_, dt) => {
    const m = meshRef.current;
    if (!m) return;

    // ── Deal-in animation (calm slide, runs once per card) ───────────────────
    if (dealT.current < 1) {
      if (circularView) {
        dealT.current = 1;
        m.visible = true;
        // fall through to circular logic
      } else {
        if (performance.now() < dealStartAbsMs.current) {
          m.visible = false;
          return;
        }
        m.visible = true;
        dealT.current = Math.min(1, dealT.current + dt * DEAL_SPEED);
        const t = dealT.current;
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        m.position.x = DEAL_OFFSET.x * (1 - e);
        m.position.y = DEAL_OFFSET.y * (1 - e);
        m.position.z = DEAL_OFFSET.z * (1 - e);
        m.scale.setScalar(e);
        return;
      }
    }

    // ── Settled-card early exit ───────────────────────────────────────────────
    if (
      !isSelected &&
      !wasSelected.current &&
      !circularView &&
      circularT.current < 0.002 &&
      !hovered &&
      Math.abs(m.scale.x) < 0.002 &&
      filteredIdx < 0
    ) {
      m.visible = false;
      return; // filtered out and invisible
    }
    const rippleAge = (performance.now() - rippleTs.current) / 1000;
    if (
      !isSelected &&
      !wasSelected.current &&
      !circularView &&
      circularT.current < 0.002 &&
      !hovered &&
      rippleAge > RIPPLE_WINDOW / 1000 &&
      Math.abs(m.position.x - (filteredIdx - album.idx) * SPACING) < 0.002 &&
      Math.abs(m.position.y) < 0.002 &&
      Math.abs(m.scale.x - 1) < 0.002
    ) {
      return; // fully settled at filter position, no active ripple
    }

    // ── Animate circularT: progress of the stack ↔ circle transition ────────
    const nowSec = performance.now() / 1000;
    if (prevCircView.current !== circularView) {
      prevCircView.current = circularView;
      const stagger = circularView
        ? (circularSlot / Math.max(1, totalCircularSlots)) * 1.5
        : 0;
      transitionTs.current = nowSec + stagger;
    }
    if (nowSec >= transitionTs.current) {
      circularT.current = lerp(
        circularT.current,
        circularView ? 1 : 0,
        dt,
        3.5,
      );
    }
    const ct = circularT.current;

    // ── First-select snap ──────────────────────────────────────────────────
    if (isSelected && !wasSelected.current) {
      if (ct < 0.1) {
        m.position.set(0, 0, 0);
        m.scale.setScalar(1);
        m.quaternion.copy(identityQuat.current);
      }
      animT.current = 0;
    }
    wasSelected.current = isSelected;

    // ── Expand / collapse animation (takes priority over everything) ────────
    animT.current = lerp(animT.current, isSelected ? 1 : 0, dt, 5);

    if (isSelected || animT.current > 0.005) {
      const inRing = ct > 0.5 && circularSlot >= 0;
      const restPos =
        !isSelected && hovered
          ? inRing
            ? circularHoverPos
            : new THREE.Vector3(0, 1.1, 0.5)
          : inRing
            ? circularLocalPos
            : new THREE.Vector3(0, 0, 0);
      const restScale = !isSelected && hovered ? 1.12 : 1;
      const restQuat = inRing ? circularLocalQuat : identityQuat.current;
      const targetPos = isSelected
        ? inRing
          ? expandedLocalPosCircle
          : expandedLocalPos
        : restPos;
      const targetQuat = inRing ? SEL_LOCAL_QUAT_CIRCLE : SEL_LOCAL_QUAT;
      m.position.lerp(targetPos, Math.min(1, dt * 5));
      m.scale.setScalar(
        lerp(m.scale.x, isSelected ? SEL_SCALE : restScale, dt, 5),
      );
      m.quaternion.slerpQuaternions(restQuat, targetQuat, animT.current);
      return;
    }

    // ── Fully in stack mode (ct ~= 0) ──────────────────────────────────────
    if (ct < 0.002) {
      m.visible = true;

      // Filtered-out: slide scale to 0 then hide so raycasting skips it
      if (filteredIdx < 0) {
        const ns = lerp(m.scale.x, 0, dt, 8);
        m.scale.setScalar(ns);
        if (ns < 0.01) m.visible = false;
        return;
      }

      // Filter offset: compact the visible cards toward their filteredIdx positions.
      const filterDelta = filteredIdx - album.idx;
      const filterOffsetX = filterDelta * SPACING;
      const filterOffsetZ = -filterDelta * SPACING;

      let tX = filterOffsetX,
        tY = 0,
        tZ = filterOffsetZ,
        tS = 1;
      if (mouseHoveredIdx >= 0) {
        // Use compact filteredIdx positions for distance so the ripple spread works
        // correctly in filtered mode (original indices can be far apart).
        const dist = filteredIdx - mouseHoveredFilteredIdx;
        const absDist = Math.abs(dist);
        if (hovered) {
          tY += 1.1;
          tS = 1.12;
        } else if (absDist <= RIPPLE_RADIUS) {
          const falloff =
            (Math.cos((absDist / RIPPLE_RADIUS) * Math.PI) + 1) * 0.5;
          const spread = Math.sign(dist) * RIPPLE_SPREAD * falloff;
          tX += spread * SPACING;
          tZ -= spread * SPACING;
        }
      } else {
        const age = (performance.now() - rippleTs.current) / 1000;
        if (age < RIPPLE_WINDOW / 1000) {
          const strength = Math.exp(-age * RIPPLE_DECAY);
          const dist = album.idx - rippleCenterRef.current;
          const absDist = Math.abs(dist);
          if (absDist <= RIPPLE_RADIUS && strength > 0.005) {
            const falloff =
              (Math.cos((absDist / RIPPLE_RADIUS) * Math.PI) + 1) * 0.5;
            tY += RIPPLE_LIFT * falloff * strength;
            const spread = Math.sign(dist) * RIPPLE_SPREAD * falloff * strength;
            tX += spread * SPACING;
            tZ -= spread * SPACING;
          }
        }
      }
      m.position.x = lerp(m.position.x, tX, dt, 12);
      m.position.y = lerp(m.position.y, tY, dt, 12);
      m.position.z = lerp(m.position.z, tZ, dt, 12);
      const s = lerp(m.scale.x, tS, dt, 12);
      m.scale.set(s, s, s);
      m.quaternion.slerp(identityQuat.current, Math.min(1, dt * 5));
      return;
    }

    // ── Transitioning or settled in circle mode ─────────────────────────────
    if (circularSlot >= 0) {
      let lift = 0,
        tScale = 1;
      if (ct > 0.9) {
        if (hovered) {
          lift = 1.4;
          tScale = 1.2;
        } else {
          const age = (performance.now() - rippleTs.current) / 1000;
          if (age < RIPPLE_WINDOW / 1000) {
            const strength = Math.exp(-age * RIPPLE_DECAY);
            const dist = album.idx - rippleCenterRef.current;
            const absDist = Math.abs(dist);
            if (absDist <= RIPPLE_RADIUS && strength > 0.005) {
              const falloff =
                (Math.cos((absDist / RIPPLE_RADIUS) * Math.PI) + 1) * 0.5;
              lift = RIPPLE_LIFT * falloff * strength;
            }
          }
        }
      }

      const tX = circularLocalPos.x * ct + CIRCLE_UP_LOCAL.x * lift;
      const tY = circularLocalPos.y * ct + CIRCLE_UP_LOCAL.y * lift;
      const tZ = circularLocalPos.z * ct + CIRCLE_UP_LOCAL.z * lift;
      m.position.x = lerp(m.position.x, tX, dt, 8);
      m.position.y = lerp(m.position.y, tY, dt, 8);
      m.position.z = lerp(m.position.z, tZ, dt, 8);
      m.scale.setScalar(lerp(m.scale.x, tScale, dt, 8));
      m.quaternion.slerpQuaternions(
        identityQuat.current,
        circularLocalQuat,
        ct,
      );
    }
  });

  const pointerHandlers = {
    onPointerOver(e: { stopPropagation(): void }) {
      e.stopPropagation();
      if (filteredIdx < 0) return;
      document.body.style.cursor = "pointer";
      onOver();
    },
    onPointerOut(e: { stopPropagation(): void }) {
      e.stopPropagation();
      if (filteredIdx < 0) return;
      document.body.style.cursor = "default";
      onOut();
    },
    onClick(e: { stopPropagation(): void }) {
      e.stopPropagation();
      // Guard: ignore clicks on filtered-out cards (should already be hidden, but
      // belt-and-suspenders in case of a one-frame race between React and R3F)
      if (filteredIdx < 0) return;
      onClick();
    },
  };

  return (
    <group position={basePos}>
      <mesh ref={meshRef} material={materials} {...pointerHandlers}>
        <boxGeometry args={[CARD_W, CARD_H, CARD_D]} />
      </mesh>
    </group>
  );
}

// ── AlbumStack ────────────────────────────────────────────────────────────────

function AlbumStack({
  albums,
  hoveredId,
  scrollOffset,
  rippleTs,
  rippleCenterRef,
  selectedAlbumIdx,
  circularView,
  circularRadius,
  activeArtist,
  onOver,
  onOut,
  onClick,
}: {
  albums: Album[];
  hoveredId: string | null;
  scrollOffset: number;
  rippleTs: React.RefObject<number>;
  rippleCenterRef: React.RefObject<number>;
  selectedAlbumIdx: number;
  circularView: boolean;
  /** World-space radius of the album ring */
  circularRadius: number;
  /** "all" = no filter; otherwise the artist name to isolate */
  activeArtist: string;
  onOver: (id: string) => void;
  onOut: () => void;
  onClick: (album: Album) => void;
}) {
  // Mouse-hovered index (-1 when no card is under the cursor)
  const mouseHoveredIdx = hoveredId ? parseInt(hoveredId.split("-")[1]) : -1;

  // Compute each card's position in the filtered compact stack.
  // filteredIdxMap: album.id → filteredIdx (≥0 = visible, -1 = hidden).
  // "all" = identity mapping so every card stays at its natural position.
  const filteredIdxMap = useMemo(() => {
    const map = new Map<string, number>();
    if (activeArtist === "all") {
      albums.forEach((a) => map.set(a.id, a.idx));
    } else {
      let compactIdx = 0;
      albums.forEach((a) => {
        if (
          normalizeArtist(a.release.artist) === normalizeArtist(activeArtist)
        ) {
          map.set(a.id, compactIdx++);
        } else {
          map.set(a.id, -1);
        }
      });
    }
    return map;
  }, [albums, activeArtist]);

  // Compact position of the hovered card in the current filter (-1 if none)
  const mouseHoveredFilteredIdx = hoveredId
    ? (filteredIdxMap.get(hoveredId) ?? -1)
    : -1;

  return (
    <group position={[-5.5, 0, 1]} rotation={[0.15, -0.7, 0.05]}>
      {albums.map((album, i) => (
        <AlbumCard
          key={album.id}
          album={album}
          basePos={[i * SPACING, 0, i * -SPACING]}
          mouseHoveredIdx={mouseHoveredIdx}
          mouseHoveredFilteredIdx={mouseHoveredFilteredIdx}
          rippleTs={rippleTs}
          rippleCenterRef={rippleCenterRef}
          isSelected={album.idx === selectedAlbumIdx}
          circularView={circularView}
          circularSlot={i}
          circularRadius={circularRadius}
          totalCircularSlots={albums.length}
          dealDelayMs={Math.floor(i / DEAL_BATCH) * DEAL_INTERVAL}
          filteredIdx={filteredIdxMap.get(album.id) ?? album.idx}
          onOver={() => onOver(album.id)}
          onOut={onOut}
          onClick={() => onClick(album)}
        />
      ))}
    </group>
  );
}

// ── CameraController — lerps FOV, position, and lookAt each frame ────────────

function CameraController({
  fov,
  circularView,
  circCamPos,
}: {
  fov: number;
  circularView: boolean;
  circCamPos: THREE.Vector3;
}) {
  const { camera } = useThree();

  const targetFovRef = useRef(fov);
  targetFovRef.current = fov;

  // Target camera position — updated whenever the view mode flips
  const targetPos = useRef(STACK_CAM_POS.clone());
  // We lerp a "currentLookAt" vector and call camera.lookAt() each frame
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (circularView) {
      targetPos.current.copy(circCamPos);
    } else {
      targetPos.current.copy(STACK_CAM_POS);
    }
  }, [circularView, circCamPos]);

  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;

    // FOV (slider-driven)
    if (Math.abs(cam.fov - targetFovRef.current) > 0.01) {
      cam.fov = lerp(cam.fov, targetFovRef.current, dt, 6);
      cam.updateProjectionMatrix();
    }

    // Position — cinematic speed so the flight feels deliberate
    const speed = 2.2;
    const t = 1 - Math.exp(-dt * speed);
    cam.position.lerp(targetPos.current, t);

    // LookAt — lerp separately so it sweeps smoothly
    currentLookAt.current.lerp(targetLookAt.current, t);
    cam.lookAt(currentLookAt.current);
  });

  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function Scene({
  albums,
  hoveredId,
  selectedAlbum,
  scrollOffset,
  rippleTs,
  rippleCenterRef,
  fov,
  circularView,
  circularRadius,
  circCamPos,
  activeArtist,
  onOver,
  onOut,
  onClick,
  onClose,
}: {
  albums: Album[];
  hoveredId: string | null;
  selectedAlbum: Album | null;
  scrollOffset: number;
  rippleTs: React.RefObject<number>;
  rippleCenterRef: React.RefObject<number>;
  fov: number;
  circularView: boolean;
  circularRadius: number;
  circCamPos: THREE.Vector3;
  activeArtist: string;
  onOver: (id: string) => void;
  onOut: () => void;
  onClick: (a: Album) => void;
  onClose: () => void;
}) {
  return (
    <>
      <mesh position={[0, 0, -3]} onClick={onClose}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <AlbumStack
        albums={albums}
        hoveredId={hoveredId}
        scrollOffset={scrollOffset}
        rippleTs={rippleTs}
        rippleCenterRef={rippleCenterRef}
        selectedAlbumIdx={selectedAlbum?.idx ?? -1}
        circularView={circularView}
        circularRadius={circularRadius}
        activeArtist={activeArtist}
        onOver={onOver}
        onOut={onOut}
        onClick={onClick}
      />

      <CameraController
        fov={fov}
        circularView={circularView}
        circCamPos={circCamPos}
      />
    </>
  );
}

// ── Artist list color palette ─────────────────────────────────────────────────
const ARTIST_PALETTE = [
  "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6bff",
  "#ff9f43", "#48dbfb", "#ff6b81", "#a29bfe", "#fd79a8",
  "#00cec9", "#fdcb6e", "#e17055", "#74b9ff", "#55efc4",
  "#fab1a0", "#81ecec", "#dfe6e9", "#b2bec3", "#636e72",
];

// ── Root Component ────────────────────────────────────────────────────────────

export default function PhotoArchive({
  initialReleases = [],
}: {
  initialReleases?: WarpRelease[];
}) {
  const START = useMemo(() => new Date(2018, 4, 28, 8, 45, 0), []);
  const [elapsed, setElapsed] = useState(0);
  const [activeCategory, setActiveCategory] = useState("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  // rippleTs: timestamp of the last ripple trigger (scroll or mouse-leave).
  // rippleCenterRef: index of the card at the wave origin.
  // AlbumCard reads both each frame — no boolean flip, wave eases out naturally.
  const rippleTs = useRef(0);
  const rippleCenterRef = useRef(0);
  // fov 80 = wide/see-all, fov 20 = tight/zoomed-in
  const [fov, setFov] = useState(80);
  // circularView: when true, all cards animate into a world-space ring
  const [circularView, setCircularView] = useState(false);

  // Scroll helper: update offset, set ripple center, stamp timestamp.
  // Takes an optional albums-slice so arrow keys / scrubber can pass the
  // filtered set and we ripple at the right album.idx.
  const scrollWithRipple = useCallback(
    (updater: (prev: number) => number, slice?: Album[]) => {
      setScrollOffset((prev) => {
        const next = updater(prev);
        // Ripple at the actual album index, not the scrubber offset
        rippleCenterRef.current = slice ? (slice[next]?.idx ?? next) : next;
        rippleTs.current = performance.now();
        return next;
      });
    },
    [],
  );

  // Clock
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // One card per release — data arrives as a server-side prop, no fetch needed
  const albums = useMemo<Album[]>(
    () =>
      initialReleases.map((release, i) => ({
        id: `album-${i}`,
        idx: i,
        release,
      })),
    [initialReleases],
  );

  // Artist list for the top-right panel: each unique artist + their album count,
  // sorted descending so the most-represented artists appear first.
  // Groups by normalized name so casing variants count together; displays the
  // most-common spelling of each name.
  const artistList = useMemo(() => {
    // normalized key → { canonical display name, count }
    const groups = new Map<string, { name: string; count: number }>();
    initialReleases.forEach((r) => {
      const key = normalizeArtist(r.artist);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { name: r.artist, count: 1 });
      } else {
        existing.count++;
        // keep whichever casing appears more often (simple heuristic: first seen)
      }
    });
    return [
      { name: "all", count: initialReleases.length },
      ...Array.from(groups.values()).sort((a, b) => b.count - a.count),
    ];
  }, [initialReleases]);

  // Preload every cover texture immediately via the shared TEXTURE_LOADER so all
  // ~400 downloads queue up right away at full browser connection-pool throughput.
  // Results land in TEXTURE_STORE; AlbumCard reads from there and skips the load
  // entirely if the texture is already ready, making progressive mounting instant
  // for any cards that mount after the texture has arrived.
  useEffect(() => {
    albums.forEach((album) => {
      const url = album.release.coverUrl;
      if (!url || TEXTURE_STORE.has(url)) return;
      TEXTURE_LOADER.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          TEXTURE_STORE.set(url, tex);
        },
        undefined,
        () => {},
      );
    });
  }, [albums]);

  // Subset of albums matching the active artist filter (or all albums).
  // This is what the scrubber, arrow keys, and selected-album tracking operate on.
  const filteredAlbums = useMemo(
    () =>
      activeCategory === "all"
        ? albums
        : albums.filter(
            (a) =>
              normalizeArtist(a.release.artist) ===
              normalizeArtist(activeCategory),
          ),
    [albums, activeCategory],
  );

  // Reset scroll position when the filter changes so we always start at the
  // beginning of the new set and don't land on an out-of-range index.
  useEffect(() => {
    setScrollOffset(0);
    setSelectedAlbum(null);
    setHoveredId(null);
    document.body.style.cursor = "default";
  }, [activeCategory]);

  // When scrolling while an album is expanded, follow the scroll within the
  // filtered set.  In circular view the scrubber drives the ripple wave only.
  useEffect(() => {
    if (circularView) return;
    setSelectedAlbum((prev) =>
      prev !== null ? (filteredAlbums[scrollOffset] ?? null) : null,
    );
  }, [scrollOffset, filteredAlbums, circularView]);

  // Arrow-key navigation within the active filtered set
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollWithRipple(
          (prev) => Math.min(prev + 1, filteredAlbums.length - 1),
          filteredAlbums,
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollWithRipple((prev) => Math.max(prev - 1, 0), filteredAlbums);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredAlbums, scrollWithRipple]);

  const current = new Date();
  const dateStr = current.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(current.getHours())}:${pad(current.getMinutes())}:${pad(current.getSeconds())}`;

  const handleClick = useCallback((album: Album) => {
    setSelectedAlbum((prev) => (prev?.id === album.id ? null : album));
    setHoveredId(null);
    document.body.style.cursor = "default";
  }, []);
  const handleClose = useCallback(() => {
    setSelectedAlbum(null);
    setHoveredId(null);
    document.body.style.cursor = "default";
  }, []);

  // CARD_W / (2π) ≈ 0.231 gives touching cards; 0.25 adds a small visible gap.
  const circularRadius = useMemo(
    () => Math.max(20, albums.length * 0.25),
    [albums],
  );
  // Low Y + forward Z puts the camera at near-eye-level, looking at the ring from the front.
  // Y=8 offset on the ring itself keeps it sitting up in frame rather than at ground level.
  const circCamPos = useMemo(
    () => new THREE.Vector3(0, circularRadius * 0.15 + 8, circularRadius * 1.5),
    [circularRadius],
  );

  return (
    <div className={styles.container}>
      <Canvas
        className={styles.canvas}
        camera={{ position: [-7.76, 0.44, 12.94], fov: 38 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#f2f1ec"]} />
        <Scene
          albums={albums}
          hoveredId={hoveredId}
          selectedAlbum={selectedAlbum}
          scrollOffset={scrollOffset}
          rippleTs={rippleTs}
          rippleCenterRef={rippleCenterRef}
          fov={fov}
          circularView={circularView}
          circularRadius={circularRadius}
          circCamPos={circCamPos}
          activeArtist={activeCategory}
          onOver={setHoveredId}
          onOut={() => setHoveredId(null)}
          onClick={handleClick}
          onClose={handleClose}
        />
      </Canvas>

      {/* Date / time — top left */}
      <div className={styles.dateTime}>
        <span>{dateStr}</span>
        <span suppressHydrationWarning>{timeStr}</span>
      </div>

      {/* "every : second" — top centre */}
      <div className={styles.subtitle}>Nowhere : Now</div>

      {/* Artist list — top right */}
      <nav className={styles.categories}>
        {artistList.map((cat, i) => {
          const color = i === 0 ? "#888" : ARTIST_PALETTE[(i - 1) % ARTIST_PALETTE.length];
          return (
            <button
              key={cat.name}
              className={`${styles.catBtn} ${activeCategory === cat.name ? styles.catActive : ""}`}
              style={{ "--cat-color": color } as React.CSSProperties}
              onClick={() => setActiveCategory(cat.name)}
            >
              <span className={styles.catDot} />
              <span className={styles.catLabel}>
                {cat.name}<sup className={styles.count}>{cat.count}</sup>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Zoom slider — left centre */}
      <div className={styles.zoomSlider}>
        <span className={styles.zoomLabel}>+</span>
        <div className={styles.zoomTrack}>
          <input
            type="range"
            min={20}
            max={80}
            step={1}
            value={80 - fov + 20}
            className={styles.zoomRange}
            onChange={(e) => setFov(80 - parseInt(e.target.value) + 20)}
            aria-label="zoom"
          />
        </div>
        <span className={styles.zoomLabel}>−</span>
      </div>

      {/* Bottom-right toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} aria-label="grid">
          <GridIcon />
        </button>
        <button className={styles.toolBtn} aria-label="list">
          <ListIcon />
        </button>
        <button className={styles.toolBtn} aria-label="expand">
          <ExpandIcon />
        </button>
        <button
          className={`${styles.toolBtn} ${circularView ? styles.toolBtnActive : ""}`}
          aria-label="circle view"
          onClick={() => setCircularView((v) => !v)}
          title="Toggle circular view"
        >
          <CircleViewIcon />
        </button>
      </div>

      {/* Album count badge */}
      {albums.length > 0 && (
        <div className={styles.countBadge}>{albums.length} releases</div>
      )}

      {/* Prompt to run scraper if no data exists */}
      {albums.length === 0 && (
        <div className={styles.loadingBadge}>
          no data — run: node scripts/fetch-warp-data.mjs
        </div>
      )}

      {/* Scrubber — bottom centre */}
      {filteredAlbums.length > 1 && (
        <div className={styles.scrubber}>
          <span className={styles.scrubberLabel}>
            {String(scrollOffset + 1).padStart(3, "0")} /{" "}
            {filteredAlbums.length}
          </span>
          <div className={styles.scrubberTrack}>
            <input
              type="range"
              min={0}
              max={filteredAlbums.length - 1}
              value={scrollOffset}
              className={styles.scrubberRange}
              onChange={(e) =>
                scrollWithRipple(() => parseInt(e.target.value), filteredAlbums)
              }
              aria-label="scroll albums"
            />
          </div>
          <span className={styles.scrubberHint}>← →</span>
        </div>
      )}

      {/* Selected album metadata — shown below the 3-D card */}
      {selectedAlbum && (
        <div className={styles.selectedMeta}>
          <span className={styles.metaTime}>Today, {timeStr}</span>
          <span className={styles.metaLocation}>
            {selectedAlbum.release.artist}
          </span>
          <span className={styles.metaCredit}>
            {selectedAlbum.release.title}
          </span>
          {selectedAlbum.release.date && (
            <span className={styles.metaDate}>
              {selectedAlbum.release.date}
            </span>
          )}
          <div className={styles.metaActions}>
            <button className={styles.metaBtn}>↗ read more</button>
            <button className={styles.metaBtn}>⊡ save this picture</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="0" y="0" width="6" height="6" />
      <rect x="8" y="0" width="6" height="6" />
      <rect x="0" y="8" width="6" height="6" />
      <rect x="8" y="8" width="6" height="6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="0" y="0" width="14" height="3" />
      <rect x="0" y="5.5" width="14" height="3" />
      <rect x="0" y="11" width="14" height="3" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <polyline points="9,1 13,1 13,5" />
      <line x1="13" y1="1" x2="8" y2="6" />
      <polyline points="5,13 1,13 1,9" />
      <line x1="1" y1="13" x2="6" y2="8" />
    </svg>
  );
}

function CircleViewIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      {/* Outer ring */}
      <circle cx="7" cy="7" r="5.8" />
      {/* Small squares around the ring representing albums */}
      <rect
        x="5.5"
        y="0.2"
        width="3"
        height="1.8"
        rx="0.4"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="5.5"
        y="12"
        width="3"
        height="1.8"
        rx="0.4"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="0.2"
        y="5.5"
        width="1.8"
        height="3"
        rx="0.4"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="12"
        y="5.5"
        width="1.8"
        height="3"
        rx="0.4"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
