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

const CATEGORIES = [
  { name: "all", count: 2347 },
  { name: "topshots", count: 228 },
  { name: "union", count: 31 },
  { name: "houston", count: 81 },
  { name: "cricket", count: 27 },
  { name: "games", count: 74 },
  { name: "trump", count: 44 },
  { name: "politics", count: 44 },
  { name: "genious", count: 68 },
  { name: "economics", count: 18 },
  { name: "cleverland", count: 24 },
  { name: "france", count: 14 },
  { name: "Celtics", count: 18 },
  { name: "2018", count: 24 },
  { name: "tempa", count: 14 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const SIDE_MAT = new THREE.MeshStandardMaterial({
  color: "#111",
  roughness: 0.8,
});
const BACK_MAT = new THREE.MeshStandardMaterial({
  color: "#1a1a1a",
  roughness: 0.7,
});

const CARD_W = 1.45;
const CARD_H = 1.45;
const CARD_D = 0.045;
const SPACING = 0.105;

// Locked camera position (matches Canvas camera prop)
const CAM_POS = new THREE.Vector3(-7.76, 0.44, 12.94);

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

const STACK_GROUP_MATRIX_INV = new THREE.Matrix4().copy(STACK_GROUP_MATRIX).invert();
// SEL_WORLD expressed in stack-group local space
const SEL_LOCAL_POS = SEL_WORLD.clone().applyMatrix4(STACK_GROUP_MATRIX_INV);
// FACE_CAM_QUAT in stack-group local space: q_local = STACK_GROUP_QUAT⁻¹ × q_world
const SEL_LOCAL_QUAT = new THREE.Quaternion()
  .copy(STACK_GROUP_QUAT).invert()
  .multiply(FACE_CAM_QUAT);

// ── AlbumCard ─────────────────────────────────────────────────────────────────

const RIPPLE_DECAY = 4.0; // exponential decay rate (higher = faster fade)
const RIPPLE_WINDOW = 1500; // ms after which ripple is considered gone

function AlbumCard({
  album,
  basePos,
  mouseHoveredIdx,
  rippleTs,
  rippleCenterRef,
  isSelected,
  onOver,
  onOut,
  onClick,
}: {
  album: Album;
  basePos: [number, number, number];
  mouseHoveredIdx: number;
  rippleTs: React.RefObject<number>;
  rippleCenterRef: React.RefObject<number>;
  isSelected: boolean;
  onOver: () => void;
  onOut: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const hovered = mouseHoveredIdx === album.idx;

  const frontMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: albumHSL(album.idx),
        roughness: 0.5,
        metalness: 0.05,
      }),
    [album.idx],
  );

  useEffect(() => {
    const coverUrl = album.release.coverUrl;
    if (!coverUrl) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const texture = loader.load(
      coverUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        frontMat.map = tex;
        frontMat.color.set("#ffffff");
        frontMat.needsUpdate = true;
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
    () => [SIDE_MAT, SIDE_MAT, SIDE_MAT, SIDE_MAT, frontMat, BACK_MAT],
    [frontMat],
  );

  const identityQuat = useRef(new THREE.Quaternion());
  const animT = useRef(0);        // 0 = in stack, 1 = fully expanded
  const wasSelected = useRef(false);
  // Expanded target in BASE-group local space (SEL_LOCAL_POS minus this card's basePos offset)
  const expandedLocalPos = useMemo(
    () => new THREE.Vector3(
      SEL_LOCAL_POS.x - basePos[0],
      SEL_LOCAL_POS.y - basePos[1],
      SEL_LOCAL_POS.z - basePos[2],
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((_, dt) => {
    const m = meshRef.current;
    if (!m) return;

    // Snap to base on first select frame so fly-out always starts from stack
    if (isSelected && !wasSelected.current) {
      m.position.set(0, 0, 0);
      m.scale.setScalar(1);
      m.quaternion.copy(identityQuat.current);
      animT.current = 0;
    }
    wasSelected.current = isSelected;

    // ── Expand / collapse animation ─────────────────────────────────────────
    animT.current = lerp(animT.current, isSelected ? 1 : 0, dt, 5);

    if (isSelected || animT.current > 0.005) {
      // When collapsing while still hovering, land on the hover position not flat stack
      const restPos = (!isSelected && hovered)
        ? new THREE.Vector3(0, 1.1, 0.5)
        : new THREE.Vector3(0, 0, 0);
      const restScale = (!isSelected && hovered) ? 1.12 : 1;
      m.position.lerp(isSelected ? expandedLocalPos : restPos, Math.min(1, dt * 5));
      m.scale.setScalar(lerp(m.scale.x, isSelected ? SEL_SCALE : restScale, dt, 5));
      m.quaternion.slerpQuaternions(identityQuat.current, SEL_LOCAL_QUAT, animT.current);
      return;
    }

    // ── Normal stack behaviour ──────────────────────────────────────────────
    let tX = 0, tY = 0, tZ = 0, tS = 1;

    if (mouseHoveredIdx >= 0) {
      const dist = album.idx - mouseHoveredIdx;
      const absDist = Math.abs(dist);
      if (hovered) {
        tY += 1.1;
        tZ += 0.5;
        tS = 1.12;
      } else if (absDist <= RIPPLE_RADIUS) {
        const falloff = (Math.cos((absDist / RIPPLE_RADIUS) * Math.PI) + 1) * 0.5;
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
          const falloff = (Math.cos((absDist / RIPPLE_RADIUS) * Math.PI) + 1) * 0.5;
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
  });

  return (
    // Outer group sits at the fixed base position and never moves.
    // Pointer events are on this static invisible hit mesh so the cursor
    // never "falls off" just because the visual card lifted away.
    <group position={basePos}>
      {/* Static invisible hit zone — same footprint as the card, never moves */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          onOver();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "default";
          onOut();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={[CARD_W, CARD_H, CARD_D]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Visual card — free to move in useFrame; excluded from raycasting so
          it can't occlude neighbouring hit zones when lifted */}
      <mesh ref={meshRef} material={materials} raycast={() => {}}>
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
  onOver: (id: string) => void;
  onOut: () => void;
  onClick: (album: Album) => void;
}) {
  // Mouse-hovered index (-1 when no card is under the cursor)
  const mouseHoveredIdx = hoveredId ? parseInt(hoveredId.split("-")[1]) : -1;

  return (
    <group position={[-5.5, 0, 1]} rotation={[0.15, -0.7, 0.05]}>
      {albums.map((album, i) => (
        <AlbumCard
          key={album.id}
          album={album}
          basePos={[i * SPACING, 0, i * -SPACING]}
          mouseHoveredIdx={mouseHoveredIdx}
          rippleTs={rippleTs}
          rippleCenterRef={rippleCenterRef}
          isSelected={album.idx === selectedAlbumIdx}
          onOver={() => onOver(album.id)}
          onOut={onOut}
          onClick={() => onClick(album)}
        />
      ))}
    </group>
  );
}


// ── CameraZoom — smoothly lerps camera FOV each frame ────────────────────────

function CameraZoom({ fov }: { fov: number }) {
  const { camera } = useThree();
  const target = useRef(fov);
  target.current = fov;
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - target.current) > 0.01) {
      cam.fov = lerp(cam.fov, target.current, dt, 6);
      cam.updateProjectionMatrix();
    }
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
  onOver: (id: string) => void;
  onOut: () => void;
  onClick: (a: Album) => void;
  onClose: () => void;
}) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 8, 6]} intensity={1.5} />

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
        onOver={onOver}
        onOut={onOut}
        onClick={onClick}
      />

      <CameraZoom fov={fov} />
    </>
  );
}

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

  // Scroll helper: update offset, set ripple center, stamp timestamp
  const scrollWithRipple = useCallback((updater: (prev: number) => number) => {
    setScrollOffset((prev) => {
      const next = updater(prev);
      rippleCenterRef.current = next;
      rippleTs.current = performance.now();
      return next;
    });
  }, []);

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

  // When scrolling while an album is expanded, follow the scroll
  useEffect(() => {
    setSelectedAlbum((prev) =>
      prev !== null ? (albums[scrollOffset] ?? null) : null,
    );
  }, [scrollOffset, albums]);

  // Arrow-key navigation (depends on albums.length so placed after albums)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollWithRipple((prev) => Math.min(prev + 1, albums.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollWithRipple((prev) => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [albums.length, scrollWithRipple]);

  const current = new Date();
  const dateStr = current.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(current.getHours())}:${pad(current.getMinutes())}:${pad(current.getSeconds())}`;

  const handleClick = useCallback(
    (album: Album) => setSelectedAlbum((prev) => (prev?.id === album.id ? null : album)),
    []
  );
  const handleClose = useCallback(() => setSelectedAlbum(null), []);

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
          onOver={setHoveredId}
          onOut={() => setHoveredId(null)}
          onClick={handleClick}
          onClose={handleClose}
        />
      </Canvas>

      {/* Date / time — top left */}
      <div className={styles.dateTime}>
        <span>{dateStr}</span>
        <span>{timeStr}</span>
      </div>

      {/* "every : second" — top centre */}
      <div className={styles.subtitle}>every : second</div>

      {/* Category list — top right */}
      <nav className={styles.categories}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.name}
            className={`${styles.catBtn} ${
              activeCategory === cat.name ? styles.catActive : ""
            }`}
            onClick={() => setActiveCategory(cat.name)}
          >
            {cat.name}
            <sup className={styles.count}>{cat.count}</sup>
          </button>
        ))}
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
      {albums.length > 1 && (
        <div className={styles.scrubber}>
          <span className={styles.scrubberLabel}>
            {String(scrollOffset + 1).padStart(3, "0")} / {albums.length}
          </span>
          <div className={styles.scrubberTrack}>
            <input
              type="range"
              min={0}
              max={albums.length - 1}
              value={scrollOffset}
              className={styles.scrubberRange}
              onChange={(e) => scrollWithRipple(() => parseInt(e.target.value))}
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
