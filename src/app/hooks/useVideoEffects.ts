import { useRef, useCallback } from "react";
import * as THREE from "three";
import { videoEffectVertexShader, videoEffectFragmentShader } from "../shaders/VideoEffectShaders";

export interface VideoEffectsConfig {
  /** Extended interaction area around the video plane */
  extendedArea?: number;
  /** Base pixel size for pixelation effect */
  basePixelSize?: number;
  /** Minimum pixel size for maximum pixelation */
  minPixelSize?: number;
  /** Maximum pixel size for minimum pixelation */
  maxPixelSize?: number;
  /** Number of trail positions to track */
  trailCount?: number;
  /** Threshold for mouse movement to trigger effects */
  movementThreshold?: number;
}

export interface TrailSystem {
  positions: THREE.Vector2[];
  strengths: number[];
  directions: THREE.Vector2[];
  index: number;
}

export const useVideoEffects = (config: VideoEffectsConfig = {}) => {
  const {
    extendedArea = 0.4,
    basePixelSize = 200.0,
    minPixelSize = 25.0,
    maxPixelSize = 150.0,
    trailCount = 60,
    movementThreshold = 0.08,
  } = config;

  const mousePosition = useRef({ x: 0, y: 0 });
  const mouseLastPosition = useRef({ x: 0, y: 0 });
  const deltas = useRef({ max: 0 });

  // Trail system for enhanced pixelation trailing
  const trailSystem = useRef<TrailSystem>({
    positions: new Array(trailCount).fill(0).map(() => new THREE.Vector2(0, 0)),
    strengths: new Array(trailCount).fill(0),
    directions: new Array(trailCount).fill(0).map(() => new THREE.Vector2(0, 0)),
    index: 0,
  });

  // Linear interpolation helper
  const lerp = useCallback((start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  }, []);

  // Create shader material with video texture
  const createShaderMaterial = useCallback((videoTexture: THREE.VideoTexture) => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: videoTexture },
        uTime: { value: 0 },
        uResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        uMousePosition: { value: new THREE.Vector2(0, 0) },
        uMouseMoveStrength: { value: 0 },
        uTrailPositions: {
          value: trailSystem.current.positions,
        },
        uTrailStrengths: { value: trailSystem.current.strengths },
        uTrailDirections: {
          value: trailSystem.current.directions,
        },
      },
      vertexShader: videoEffectVertexShader,
      fragmentShader: videoEffectFragmentShader,
      side: THREE.DoubleSide,
    });
  }, []);

  // Handle mouse movement
  const handleMouseMove = useCallback((event: MouseEvent, material: THREE.ShaderMaterial) => {
    mouseLastPosition.current.x = mousePosition.current.x;
    mouseLastPosition.current.y = mousePosition.current.y;

    const mouse = { x: event.clientX, y: event.clientY };

    // Lerp the mouse position for smoothness
    mousePosition.current.x = lerp(mousePosition.current.x, mouse.x, 0.3);
    mousePosition.current.y = lerp(mousePosition.current.y, mouse.y, 0.3);

    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // Convert screen coordinates to UV coordinates (0 to 1)
    const uvX = (mousePosition.current.x - rect.left) / rect.width;
    const uvY = (mousePosition.current.y - rect.top) / rect.height;

    // Check if the mouse is within the canvas bounds
    if (uvX >= 0 && uvX <= 1 && uvY >= 0 && uvY <= 1) {
      // Update shader uniforms
      material.uniforms.uMousePosition.value.set(uvX, uvY);

      // Calculate movement direction for trail
      const prevIndex = (trailSystem.current.index - 1 + trailCount) % trailCount;
      const prevPos = trailSystem.current.positions[prevIndex];
      const movementDir = new THREE.Vector2(uvX - prevPos.x, uvY - prevPos.y);

      if (movementDir.length() > 0.01) {
        movementDir.normalize();
      } else {
        movementDir.copy(trailSystem.current.directions[prevIndex]);
      }

      // Add current position to trail system
      trailSystem.current.positions[trailSystem.current.index].set(uvX, uvY);
      trailSystem.current.strengths[trailSystem.current.index] = 1.0;
      trailSystem.current.directions[trailSystem.current.index].copy(movementDir);
      trailSystem.current.index = (trailSystem.current.index + 1) % trailCount;

      // Calculate mouse movement strength
      if (mouseLastPosition.current.x !== 0 && mouseLastPosition.current.y !== 0) {
        let delta =
          Math.sqrt(
            Math.pow(mousePosition.current.x - mouseLastPosition.current.x, 2) +
              Math.pow(mousePosition.current.y - mouseLastPosition.current.y, 2)
          ) / 30;
        delta = Math.min(4, delta);

        // Lower the threshold and remove the penalty for slow movements
        if (delta > 0.01) {
          deltas.current.max = Math.max(delta, deltas.current.max);
        }
      }
    } else {
      // Rapidly decay effect when mouse is outside canvas
      deltas.current.max *= 0.7;
    }
  }, [lerp, trailCount]);

  // Animation loop for shader updates
  const updateShader = useCallback((material: THREE.ShaderMaterial) => {
    material.uniforms.uTime.value = performance.now() / 1000;

    // Aggressively decay mouse movement strength and snap to zero
    deltas.current.max *= 0.97; // Slower decay for a longer tail
    if (deltas.current.max < 0.01) {
      deltas.current.max = 0; // Snap to zero to completely stop effects
    }
    material.uniforms.uMouseMoveStrength.value = deltas.current.max;

    // Update trail system - decay trail strengths over time
    for (let i = 0; i < trailCount; i++) {
      // Use a much slower decay rate for a longer, more liquid trail
      const decayRate = deltas.current.max < 0.01 ? 0.95 : 0.98;
      trailSystem.current.strengths[i] *= decayRate;

      if (trailSystem.current.strengths[i] < 0.01) {
        trailSystem.current.strengths[i] = 0;
        // Reset trail position when strength hits zero
        trailSystem.current.positions[i].set(0, 0);
        trailSystem.current.directions[i].set(0, 0);
      }
    }

    // Update shader uniforms with trail data
    material.uniforms.uTrailPositions.value = trailSystem.current.positions;
    material.uniforms.uTrailStrengths.value = trailSystem.current.strengths;
    material.uniforms.uTrailDirections.value = trailSystem.current.directions;
  }, [trailCount]);

  // Setup video effects on a mesh
  const setupVideoEffects = useCallback((
    mesh: THREE.Mesh,
    videoElement: HTMLVideoElement
  ) => {
    // Create video texture
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.flipY = false;
    videoTexture.wrapS = THREE.ClampToEdgeWrapping;
    videoTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Create shader material
    const material = createShaderMaterial(videoTexture);
    mesh.material = material;

    // Setup mouse event listener
    const mouseMoveHandler = (event: MouseEvent) => {
      handleMouseMove(event, material);
    };

    window.addEventListener("mousemove", mouseMoveHandler);

    // Animation loop
    const animate = () => {
      updateShader(material);
      requestAnimationFrame(animate);
    };
    animate();

    // Return cleanup function
    return () => {
      window.removeEventListener("mousemove", mouseMoveHandler);
      material.dispose();
      videoTexture.dispose();
    };
  }, [createShaderMaterial, handleMouseMove, updateShader]);

  return {
    setupVideoEffects,
    createShaderMaterial,
    handleMouseMove,
    updateShader,
    trailSystem: trailSystem.current,
    mousePosition: mousePosition.current,
    deltas: deltas.current,
  };
};