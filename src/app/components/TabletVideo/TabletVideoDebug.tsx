"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, Box } from "@react-three/drei";
import { Curtains, Plane, Vec2 } from "curtainsjs";
import { vertexShader, fragmentShader } from "./DisplacementShader.js";
import styles from "./TabletVideo.module.css";

interface TabletVideoDebugProps {
  videoSrc?: string;
  tabletPath?: string;
  className?: string;
  targetMeshId?: number; // Allow targeting by Three.js mesh ID (not array index)
  targetMeshName?: string; // Allow targeting by mesh name
}

function DebugTabletModel({
  videoSrc = "/willow.mp4",
  tabletPath = "/models/tablet.glb",
  targetMeshId,
  targetMeshName,
}: {
  videoSrc: string;
  tabletPath: string;
  targetMeshId?: number;
  targetMeshName?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const curtainsRef = useRef<Curtains | null>(null);
  const planeRef = useRef<Plane | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const mousePosition = useRef({ x: 0, y: 0 });
  const mouseLastPosition = useRef({ x: 0, y: 0 });
  const deltas = useRef({ max: 0 });

  // Load the tablet model
  const { scene } = useGLTF(tabletPath);

  // Initialize Curtains.js for displacement effect
  useEffect(() => {
    console.log("🎥 Initializing video element...");

    // Create a single video element for both Three.js and Curtains.js
    const video = document.createElement("video");
    video.src = videoSrc;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.style.display = "none";
    video.autoplay = true;
    document.body.appendChild(video);
    videoElementRef.current = video;

    // Function to initialize Curtains.js once video is ready
    const initializeCurtains = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log("🎥 Video dimensions not ready yet, waiting...");
        return;
      }

      console.log(
        "🎥 Video ready with dimensions:",
        video.videoWidth,
        "x",
        video.videoHeight
      );

      // Create a hidden container for Curtains.js
      const curtainsContainer = document.createElement("div");
      curtainsContainer.style.position = "absolute";
      curtainsContainer.style.top = "0";
      curtainsContainer.style.left = "0";
      curtainsContainer.style.width = "512px";
      curtainsContainer.style.height = "512px";
      curtainsContainer.style.visibility = "hidden";
      curtainsContainer.style.pointerEvents = "none";
      document.body.appendChild(curtainsContainer);

      // Initialize Curtains.js
      console.log("🎨 Initializing Curtains.js...");
      const curtains = new Curtains({
        container: curtainsContainer,
        watchScroll: false,
        pixelRatio: Math.min(1.5, window.devicePixelRatio),
      });

      curtainsRef.current = curtains;

      console.log("🎨 Curtains.js initialized:", curtains);

      // Create plane for displacement effect
      console.log("🎨 Creating Curtains.js plane...");
      const plane = new Plane(curtains, video, {
        vertexShader,
        fragmentShader,
        uniforms: {
          mousePosition: {
            name: "uMousePosition",
            type: "2f",
            value: [0, 0],
          },
          mouseStrength: {
            name: "uMouseMoveStrength",
            type: "1f",
            value: 0,
          },
          time: {
            name: "uTime",
            type: "1f",
            value: 0,
          },
          resolution: {
            name: "uResolution",
            type: "2f",
            value: [video.videoWidth, video.videoHeight],
          },
        },
      });

      planeRef.current = plane;
      console.log("🎨 Curtains.js plane created:", plane);

      // Linear interpolation helper
      const lerp = (start: number, end: number, factor: number) => {
        return start + (end - start) * factor;
      };

      // Handle mouse movement for displacement
      const handleMovement = (e: MouseEvent | TouchEvent) => {
        mouseLastPosition.current = { ...mousePosition.current };

        const mouse = { x: 0, y: 0 };

        if ("targetTouches" in e && e.targetTouches) {
          mouse.x = e.targetTouches[0].clientX;
          mouse.y = e.targetTouches[0].clientY;
        } else if ("clientX" in e) {
          mouse.x = e.clientX;
          mouse.y = e.clientY;
        }

        // Smooth mouse movement
        mousePosition.current = {
          x: lerp(mousePosition.current.x, mouse.x, 0.3),
          y: lerp(mousePosition.current.y, mouse.y, 0.3),
        };

        // Convert to plane coordinates
        const mouseToPlaneCoords = plane.mouseToPlaneCoords(
          new Vec2(mousePosition.current.x, mousePosition.current.y)
        );

        plane.uniforms.mousePosition.value = [
          mouseToPlaneCoords.x,
          mouseToPlaneCoords.y,
        ];

        // Calculate movement strength
        if (
          mouseLastPosition.current.x !== 0 &&
          mouseLastPosition.current.y !== 0
        ) {
          let delta =
            Math.sqrt(
              Math.pow(
                mousePosition.current.x - mouseLastPosition.current.x,
                2
              ) +
                Math.pow(
                  mousePosition.current.y - mouseLastPosition.current.y,
                  2
                )
            ) / 30;

          delta = Math.min(4, delta);

          if (delta >= deltas.current.max) {
            deltas.current.max = delta;
          }
        }
      };

      // Animation loop
      const animate = () => {
        plane.uniforms.time.value = performance.now() / 1000;
        deltas.current.max *= 0.95;
        plane.uniforms.mouseStrength.value = deltas.current.max;
        requestAnimationFrame(animate);
      };

      plane
        .onReady(() => {
          console.log("✅ Curtains displacement plane ready");
          console.log("✅ Plane canvas:", curtains.canvas);
          console.log("✅ Video element:", video);
          console.log(
            "✅ Video dimensions:",
            video.videoWidth,
            "x",
            video.videoHeight
          );
          console.log("✅ Video current time:", video.currentTime);
          console.log("✅ Video playing:", !video.paused);

          // Add mouse listeners to the window for global mouse tracking
          window.addEventListener("mousemove", handleMovement);
          window.addEventListener("touchmove", handleMovement, {
            passive: true,
          });

          animate();
        })
        .onError(() => {
          console.error("❌ Curtains displacement plane failed to initialize");
        });
    };

    // Video event listeners
    video.addEventListener("loadedmetadata", () => {
      console.log("🎥 Video metadata loaded");
      video
        .play()
        .then(() => {
          console.log("🎥 Video playing successfully");
          // Try to initialize Curtains after video starts playing
          setTimeout(initializeCurtains, 100);
        })
        .catch((error) => console.error("🎥 Video play failed:", error));
    });

    video.addEventListener("loadeddata", () => {
      console.log("🎥 Video data loaded");
      // Try to initialize Curtains when data is loaded
      setTimeout(initializeCurtains, 100);
    });

    video.addEventListener("canplay", () => {
      console.log("🎥 Video can start playing");
      initializeCurtains();
    });

    video.addEventListener("playing", () => {
      console.log("🎥 Video is playing");
      initializeCurtains();
    });

    video.addEventListener("error", (e) => console.error("🎥 Video error:", e));

    // Load the video
    video.load();

    // Cleanup function
    return () => {
      window.removeEventListener("mousemove", () => {});
      window.removeEventListener("touchmove", () => {});

      if (planeRef.current) {
        planeRef.current.remove();
      }
      if (curtainsRef.current) {
        curtainsRef.current.dispose();
      }
      if (videoElementRef.current) {
        document.body.removeChild(videoElementRef.current);
      }
    };
  }, [videoSrc]);

  // Apply the Curtains.js canvas as texture to the tablet screen
  useEffect(() => {
    if (groupRef.current && scene) {
      console.log("🖥️ Attempting to apply texture to tablet screen...");

      const clonedScene = groupRef.current.children.find(
        (child) =>
          child.type === "Group" ||
          child.type === "Scene" ||
          child.type === "Object3D"
      );

      if (!clonedScene) {
        console.log("❌ No cloned scene found");
        return;
      }

      const clonedMeshes: THREE.Mesh[] = [];
      clonedScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          clonedMeshes.push(child);
        }
      });

      console.log(`🖥️ Found ${clonedMeshes.length} meshes in cloned scene`);

      // Find target mesh (same logic as before)
      let targetClonedMesh: THREE.Mesh | null = null;

      if (targetMeshId !== undefined) {
        targetClonedMesh =
          clonedMeshes.find((mesh) => mesh.id === targetMeshId) || null;
        console.log(
          `🖥️ Looking for mesh ID ${targetMeshId}:`,
          targetClonedMesh ? "FOUND" : "NOT FOUND"
        );
      }

      if (!targetClonedMesh && clonedMeshes.length > 0) {
        // Auto-detect screen-like mesh
        console.log("🖥️ Auto-detecting screen mesh...");
        const screenCandidates = clonedMeshes.map((mesh) => {
          mesh.geometry.computeBoundingBox();
          const bbox = mesh.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const center = bbox.getCenter(new THREE.Vector3());

          const flatnessRatio =
            Math.min(size.x, size.y, size.z) / Math.max(size.x, size.y, size.z);
          const area = size.x * size.y;

          let score = 0;
          if (flatnessRatio < 0.05) score += 5;
          if (area > 0.1 && area < 5) score += 3;
          if (center.y > 0.05 && center.z > 0.05) score += 3;

          console.log(
            `🖥️ Mesh ${
              mesh.id
            } score: ${score} (flatness: ${flatnessRatio.toFixed(
              3
            )}, area: ${area.toFixed(3)})`
          );
          return { mesh, score };
        });

        screenCandidates.sort((a, b) => b.score - a.score);
        targetClonedMesh = screenCandidates[0]?.mesh || clonedMeshes[0];
        console.log(
          `🖥️ Auto-selected mesh ${targetClonedMesh?.id} with score ${screenCandidates[0]?.score}`
        );
      }

      if (targetClonedMesh) {
        console.log("🖥️ Applying texture to tablet screen");
        console.log("🖥️ Target mesh:", targetClonedMesh);

        // First, try to use Curtains.js canvas if available
        if (curtainsRef.current && curtainsRef.current.canvas) {
          console.log("🖥️ Using Curtains.js canvas texture");
          const curtainsCanvas = curtainsRef.current.canvas;
          const curtainsTexture = new THREE.CanvasTexture(curtainsCanvas);
          curtainsTexture.flipY = false;
          curtainsTexture.wrapS = THREE.ClampToEdgeWrapping;
          curtainsTexture.wrapT = THREE.ClampToEdgeWrapping;

          // Create material with the Curtains.js canvas
          const curtainsMaterial = new THREE.MeshBasicMaterial({
            map: curtainsTexture,
            side: THREE.DoubleSide,
          });

          targetClonedMesh.material = curtainsMaterial;
          console.log("🖥️ Curtains.js material applied to mesh");

          // Update texture on each frame
          const updateTexture = () => {
            curtainsTexture.needsUpdate = true;
            requestAnimationFrame(updateTexture);
          };
          updateTexture();
          console.log("🖥️ Curtains.js texture update loop started");
        }
        // Use Three.js displacement shader directly on the video texture
        else if (videoElementRef.current) {
          console.log("🖥️ Using Three.js displacement shader on video texture");
          const videoTexture = new THREE.VideoTexture(videoElementRef.current);
          videoTexture.flipY = false;
          videoTexture.wrapS = THREE.ClampToEdgeWrapping;
          videoTexture.wrapT = THREE.ClampToEdgeWrapping;

          // Create displacement shader material
          const displacementMaterial = new THREE.ShaderMaterial({
            uniforms: {
              uTexture: { value: videoTexture },
              uTime: { value: 0 },
              uResolution: {
                value: new THREE.Vector2(window.innerWidth, window.innerHeight),
              },
              uMousePosition: { value: new THREE.Vector2(0, 0) },
              uMouseMoveStrength: { value: 0 },
              uTrailPositions: {
                value: new Array(60).fill(0).map(() => new THREE.Vector2(0, 0)),
              },
              uTrailStrengths: { value: new Array(60).fill(0) },
              uTrailDirections: {
                value: new Array(60).fill(0).map(() => new THREE.Vector2(0, 0)),
              },
            },
            vertexShader: `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
            `,
            fragmentShader: `
  uniform sampler2D uTexture;
  uniform float uTime;
              uniform vec2 uMousePosition;
              uniform float uMouseMoveStrength;
              uniform vec2 uTrailPositions[60];
              uniform float uTrailStrengths[60];
              uniform vec2 uTrailDirections[60];
  
  varying vec2 vUv;

              void main() {
                vec2 uv = vUv;
                
                // --- VIRTUAL INTERACTION AREA ---
                // Define a "virtual" bounding box around the video plane (0.0 to 1.0)
                // This allows effects to start before the mouse is directly over the video
                float extendedArea = 0.4; // Increased from 0.2 for a larger area
                vec2 closestPoint = vec2(
                  clamp(uv.x, -extendedArea, 1.0 + extendedArea),
                  clamp(uv.y, -extendedArea, 1.0 + extendedArea)
                );
                float distanceFromMouse = distance(uMousePosition, closestPoint);

                // --- EXPONENTIAL FALLOFF ---
                float falloffDistance = 0.4 + extendedArea;
                float normalizedDistance =
                  clamp(distanceFromMouse / falloffDistance, 0.0, 1.0);
                float exponentialFalloff = pow(1.0 - normalizedDistance, 4.0);

                // Initialize displacement variables
                float displacement = 0.0;
                vec2 direction = vec2(0.0, 0.0);
                
                // Only calculate displacement effects when mouse is actively moving
                if (uMouseMoveStrength > 0.08) {
                  // Create much stronger flowing wave patterns with larger scale
                  vec2 flowOffset = vec2(
                    sin(uTime * 0.4) * 0.3,  // Reduced amplitude from 0.5 to 0.3
                    cos(uTime * 0.3) * 0.3
                  );
                  vec2 offsetPos = uMousePosition + flowOffset;
                  
                  // Calculate multiple distance fields with smaller offsets for tighter effect
                  float dist1 = distance(uv + vec2(0.15, 0.15), offsetPos);  // Reduced from 0.25 to 0.15
                  float dist2 = distance(uv + vec2(-0.15, -0.15), offsetPos);
                  float dist3 = distance(uv + vec2(-0.15, 0.15), offsetPos);
                  float dist4 = distance(uv + vec2(0.15, -0.15), offsetPos);
                  
                  // Create intense overlapping waves with tighter reach
                  float wave1 = sin(2.5 * (dist1 - (uTime / 20.0))) * smoothstep(0.4, 0.0, dist1);  // Reduced range from 0.8 to 0.4
                  float wave2 = cos(2.8 * (dist2 - (uTime / 15.0))) * smoothstep(0.4, 0.0, dist2);
                  float wave3 = sin(3.0 * (dist3 - (uTime / 10.0))) * smoothstep(0.4, 0.0, dist3);
                  float wave4 = cos(3.2 * (dist4 - (uTime / 5.0))) * smoothstep(0.4, 0.0, dist4);
                  
                  // Amplified noise pattern with smaller scale
                  float noise1 = sin(uv.x * 4.0 + uTime * 1.2 + uv.y * 3.0) * 0.5;  // Reduced from 0.9 to 0.5
                  float noise2 = cos(uv.y * 4.0 + uTime * 1.0 + uv.x * 3.0) * 0.5;
                  float noise3 = sin((uv.x + uv.y) * 5.0 + uTime * 1.1) * 0.5;
                  float organicNoise = (noise1 + noise2 + noise3) / 3.0;
                  
                  // Combine waves with reduced intensity
                  displacement = (wave1 + wave2 + wave3 + wave4) * 0.45;
                  displacement =
                    displacement *
                    (1.0 + organicNoise) *
                    uMouseMoveStrength *
                    1.5;
                  
                  // Create intense flowing displacement field with smaller scale
                  vec2 flow1 = vec2(
                    sin(uv.y * 2.0 + uTime * 1.0) * 0.8,  // Reduced from 1.5 to 0.8
                    cos(uv.x * 2.0 + uTime * 0.8) * 0.8
                  );
                  vec2 flow2 = vec2(
                    cos(uv.x * 1.8 - uTime * 0.6) * 0.8,
                    sin(uv.y * 1.8 - uTime * 0.8) * 0.8
                  );
                  
                  // Combine flows with tighter transition
                  float flowMix = smoothstep(0.4, 0.0, distanceFromMouse);  // Reduced range from 0.8 to 0.4
                  direction = normalize(mix(flow1, flow2, flowMix)) * 0.8;  // Reduced from 1.5 to 0.8
                }
                
                // Keep original UV for base video
                vec2 displacedUV = uv;
                
                // Apply displacement to UV coordinates when there's movement
                if (uMouseMoveStrength > 0.08) {
                    // Apply the displacement effect to UV coordinates with reduced effect
                    displacedUV += direction * displacement * 0.4;  // Reduced from 0.8 to 0.4
                }
                
                // BLOCKY PIXELATED TRAIL EFFECT
                // Add a strong pixelation effect on hover, separate from movement
                float hoverPixelation = exponentialFalloff * 0.6; // Base pixelation for hover

                // Calculate movement-based effect
                float movementEffect = exponentialFalloff * uMouseMoveStrength * 3.0;

                // Combine hover and movement effects
                float pixelationStrength = hoverPixelation + movementEffect;
                
                // Create trail decay over time and distance
                float trailDecay = exp(-distanceFromMouse * 4.0) * smoothstep(0.0, 0.1, uMouseMoveStrength);
                pixelationStrength = max(pixelationStrength, trailDecay * 0.8);
                
                // When hovering with minimal movement, boost pixelation to hide subtle ripples
                if (uMouseMoveStrength < 0.1 && exponentialFalloff > 0.1) {
                  pixelationStrength = max(pixelationStrength, exponentialFalloff * 0.9);
                }
                
                // Apply pixelation to the displaced UV coordinates
                vec2 pixelatedUV = displacedUV;  // Start with displaced coordinates
                
                // ENHANCED DIRECTIONAL TRAIL SYSTEM - Check all trail positions with directional extension
                float maxTrailEffect = 0.0;
                for (int i = 0; i < 60; i++) {
                  if (uTrailStrengths[i] > 0.01) {
                    vec2 trailPos = uTrailPositions[i];
                    vec2 trailDir = uTrailDirections[i];
                    
                    // Create directional trail extension
                    vec2 toPixel = uv - trailPos;
                    float distanceToTrail = length(toPixel);
                    
                    // Check if pixel is in the direction opposite to movement (behind the trail)
                    float directionAlignment = dot(normalize(toPixel), -trailDir);
                    
                    // Create extended trail effect in the direction the mouse came from
                    float directionalEffect = 0.0;
                    if (directionAlignment > 0.3 && distanceToTrail < 0.25) {
                      // Stronger effect for pixels behind the trail point
                      directionalEffect = smoothstep(0.25, 0.0, distanceToTrail) * 
                                        smoothstep(0.3, 0.8, directionAlignment) * 
                                        uTrailStrengths[i] * 0.8;
                    }
                    
                    // Regular circular trail effect
                    float circularEffect = smoothstep(0.12, 0.0, distanceToTrail) * uTrailStrengths[i];
                    
                    // Combine both effects
                    float trailEffect = max(directionalEffect, circularEffect);
                    maxTrailEffect = max(maxTrailEffect, trailEffect);
                  }
                }
                pixelationStrength = max(pixelationStrength, maxTrailEffect);
                
                // Base pixel size - smaller numbers = bigger pixels (more blocky)
                float basePixelSize = 200.0;
                float minPixelSize = 25.0; // Increased from 8.0 for smaller blocks
                float maxPixelSize = 150.0; // Less pixelated maximum
                
                // Calculate dynamic pixel size based on effect strength
                float pixelSize = basePixelSize - (pixelationStrength * (basePixelSize - minPixelSize));
                pixelSize = max(pixelSize, minPixelSize);
                
                // Apply main pixelation effect - always apply when mouse is nearby
                if (pixelationStrength > 0.01 || exponentialFalloff > 0.05) {
                  // Create main blocky pixel grid
                  vec2 pixelCoord = floor(displacedUV * pixelSize) / pixelSize;
                  pixelCoord += 0.5 / pixelSize; // Center the pixel
                  
                  // Mix based on pixelation strength with minimum effect
                  float actualPixelStrength = max(pixelationStrength, 0.3);
                  displacedUV = mix(displacedUV, pixelCoord, actualPixelStrength);
                }
                
                // ENHANCED MULTI-LAYERED TRAIL SYSTEM WITH PERSISTENT TRAILS
                vec2 trailUV1 = displacedUV;
                vec2 trailUV2 = displacedUV;
                vec2 trailUV3 = displacedUV;
                vec2 trailUV4 = displacedUV;
                
                // Create additional trail layers for each historical position
                vec2 persistentTrailUV = displacedUV;
                
                // Calculate falloff factors for layered effects with larger area
                float falloff1 =
                  pow(1.0 - clamp(distanceFromMouse / 0.8, 0.0, 1.0), 4.0);
                float falloff2 =
                  pow(1.0 - clamp(distanceFromMouse / 0.75, 0.0, 1.0), 4.0);
                float falloff3 =
                  pow(1.0 - clamp(distanceFromMouse / 0.7, 0.0, 1.0), 4.0);
                float falloff4 =
                  pow(1.0 - clamp(distanceFromMouse / 0.65, 0.0, 1.0), 4.0);

                // Check all trail positions for persistent directional pixelation
                for (int i = 0; i < 60; i++) {
                  if (uTrailStrengths[i] > 0.05) {
                    vec2 trailPos = uTrailPositions[i];
                    vec2 trailDir = uTrailDirections[i];
                    vec2 toPixel = uv - trailPos;
                    float trailDist = length(toPixel);
                    
                    // Check for directional trail extension
                    float dirAlignment = dot(normalize(toPixel), -trailDir);
                    
                    // Create extended directional pixelation
                    bool inDirectionalTrail = (dirAlignment > 0.2 && trailDist < 0.2);
                    bool inCircularTrail = (trailDist < 0.1);
                    
                    if (inDirectionalTrail || inCircularTrail) {
                      // Add a liquid-like dissolving effect to the tail
                      float dissolveFactor = 1.0 - uTrailStrengths[i];
                      float dissolveNoise =
                        (sin(uv.x * 30.0 + uTime * 2.0 + uv.y * 20.0) * 0.5 +
                         0.5) *
                        dissolveFactor;

                      // Create pixelation effect for this trail position
                      float trailPixelSize = mix(
                        12.0,
                        22.0,
                        uTrailStrengths[i]
                      ); // Smaller = more blocky
                      vec2 trailPixelCoord =
                        floor(
                          (displacedUV + dissolveNoise * 0.1) * trailPixelSize
                        ) /
                          trailPixelSize +
                        0.5 / trailPixelSize;

                      float trailBlend = 0.0;
                      if (inDirectionalTrail) {
                        // Stronger effect for directional trail
                        trailBlend = smoothstep(0.2, 0.0, trailDist) * 
                                   smoothstep(0.2, 0.7, dirAlignment) * 
                                   uTrailStrengths[i] * 0.9;
                      } else {
                        // Regular circular effect
                        trailBlend = smoothstep(0.1, 0.0, trailDist) * uTrailStrengths[i] * 0.7;
                      }
                      
                      persistentTrailUV = mix(persistentTrailUV, trailPixelCoord, trailBlend);
                    }
                  }
                }
                
                // Always create trails when mouse is nearby or pixelation is active
                if (
                  pixelationStrength > 0.05 ||
                  exponentialFalloff > 0.01 ||
                  maxTrailEffect > 0.1
                ) {
                  // Create different sized pixel grids for trail layers - much more aggressive
                  float trailSize1 = max(pixelSize * 0.15, 8.0); // Most blocky trail
                  float trailSize2 = max(pixelSize * 0.3, 10.0); // Medium blocky
                  float trailSize3 = max(pixelSize * 0.6, 14.0); // Less blocky
                  float trailSize4 = max(pixelSize * 0.9, 18.0); // Finest trail
                  
                  // Create trail coordinates with time-based offsets for organic movement
                  vec2 mouseDir = normalize(uMousePosition - vec2(0.5));
                  float trailOffset = uTime * 1.5;
                  
                  vec2 offset1 = mouseDir * sin(trailOffset * 1.2) * 0.04 + vec2(cos(trailOffset * 0.8) * 0.03, sin(trailOffset * 1.1) * 0.03);
                  vec2 offset2 = mouseDir * sin(trailOffset * 0.9) * 0.045 + vec2(sin(trailOffset * 1.3) * 0.035, cos(trailOffset * 0.7) * 0.035);
                  vec2 offset3 = mouseDir * sin(trailOffset * 1.5) * 0.05 + vec2(cos(trailOffset * 1.0) * 0.04, sin(trailOffset * 1.4) * 0.04);
                  vec2 offset4 = mouseDir * sin(trailOffset * 0.6) * 0.055 + vec2(sin(trailOffset * 0.9) * 0.045, cos(trailOffset * 1.2) * 0.045);
                  
                  // Calculate pixelated coordinates for each trail layer
                  vec2 trailCoord1 = floor((persistentTrailUV + offset1) * trailSize1) / trailSize1 + 0.5 / trailSize1;
                  vec2 trailCoord2 = floor((persistentTrailUV + offset2) * trailSize2) / trailSize2 + 0.5 / trailSize2;
                  vec2 trailCoord3 = floor((persistentTrailUV + offset3) * trailSize3) / trailSize3 + 0.5 / trailSize3;
                  vec2 trailCoord4 = floor((persistentTrailUV + offset4) * trailSize4) / trailSize4 + 0.5 / trailSize4;
                  
                  // Calculate individual trail strengths based on distance and time - much stronger
                  float baseTrailStrength = max(pixelationStrength, max(maxTrailEffect, 0.3));
                  float trail1Strength = falloff1 * baseTrailStrength * 1.0;
                  float trail2Strength = falloff2 * baseTrailStrength * 0.8;
                  float trail3Strength = falloff3 * baseTrailStrength * 0.6;
                  float trail4Strength = falloff4 * baseTrailStrength * 0.4;
                  
                  // Apply trail pixelation with minimum strength
                  trailUV1 = mix(persistentTrailUV, trailCoord1, max(trail1Strength, 0.25));
                  trailUV2 = mix(persistentTrailUV, trailCoord2, max(trail2Strength, 0.2));
                  trailUV3 = mix(persistentTrailUV, trailCoord3, max(trail3Strength, 0.15));
                  trailUV4 = mix(persistentTrailUV, trailCoord4, max(trail4Strength, 0.1));
                }
                
                // Sample the video texture with main pixelated UV
                vec4 color = texture2D(uTexture, displacedUV);
                
                // Create layered trail effect when mouse is active or trails are present
                if (
                  pixelationStrength > 0.02 ||
                  exponentialFalloff > 0.01 ||
                  maxTrailEffect > 0.05
                ) {
                  vec4 trailColor1 = texture2D(uTexture, trailUV1);
                  vec4 trailColor2 = texture2D(uTexture, trailUV2);
                  vec4 trailColor3 = texture2D(uTexture, trailUV3);
                  vec4 trailColor4 = texture2D(uTexture, trailUV4);
                  
                  // Calculate blend weights based on distance from mouse and trail effects
                  float baseBlend = max(pixelationStrength, max(maxTrailEffect, 0.25));
                  float blend1 = falloff1 * baseBlend * 0.7;
                  float blend2 = falloff2 * baseBlend * 0.6;
                  float blend3 = falloff3 * baseBlend * 0.5;
                  float blend4 = falloff4 * baseBlend * 0.4;
                  
                  // Add trail-specific blending for persistent effect
                  blend1 = max(blend1, maxTrailEffect * 0.6);
                  blend2 = max(blend2, maxTrailEffect * 0.5);
                  blend3 = max(blend3, maxTrailEffect * 0.4);
                  blend4 = max(blend4, maxTrailEffect * 0.3);
                  
                  // Ensure minimum blending for visibility
                  blend1 = max(blend1, 0.25);
                  blend2 = max(blend2, 0.2);
                  blend3 = max(blend3, 0.15);
                  blend4 = max(blend4, 0.1);
                  
                  // Blend trail layers with varying intensities
                  color = mix(color, trailColor1, blend1);
                  color = mix(color, trailColor2, blend2);
                  color = mix(color, trailColor3, blend3);
                  color = mix(color, trailColor4, blend4);
                }
                
                // Chromatic aberration only during active movement to hide artifacts
                if (uMouseMoveStrength > 0.1) {
                  float colorDisp = displacement * 0.25;  // Increased color separation
                  
                  // Add stronger variation to the color separation direction
                  vec2 colorNoiseR = vec2(sin(uTime * 2.5 + uv.y * 35.0), cos(uTime * 2.8 + uv.x * 30.0)) * 0.35;  // Increased color noise
                  vec2 colorNoiseB = vec2(cos(uTime * 2.2 + uv.x * 25.0), sin(uTime * 3.0 + uv.y * 40.0)) * 0.35;
                  
                  // Sample colors with enhanced organic offset using pixelated UV
                  vec4 colorR = texture2D(uTexture, displacedUV + (direction + colorNoiseR) * colorDisp);
                  vec4 colorB = texture2D(uTexture, displacedUV - (direction + colorNoiseB) * colorDisp);
                  
                  // Calculate smooth falloff for color mixing with stronger effect
                  float distanceStrength = exp(-distanceFromMouse * 1.2);  // Adjusted falloff
                  float chromaStrength = distanceStrength * uMouseMoveStrength * 1.5;  // Increased strength
                  color.r = mix(color.r, colorR.r, chromaStrength);
                  color.b = mix(color.b, colorB.b, chromaStrength);
                }
                
                // Enhanced contrast and saturation when heavily pixelated for trail visibility
                if (pixelationStrength > 0.15) {
                  // Boost contrast and saturation for blocky trail effect
                  color.rgb = mix(color.rgb, color.rgb * 1.15, pixelationStrength * 0.4);
                  
                  // Add slight color shift for trail distinctiveness
                  color.rgb *= mix(vec3(1.0), vec3(1.05, 0.98, 1.02), pixelationStrength * 0.3);
                }
                
                gl_FragColor = color;
              }
            `,
            side: THREE.DoubleSide,
          });

          targetClonedMesh.material = displacementMaterial;
          console.log("🖥️ Displacement shader material applied to mesh");

          // Mouse tracking for displacement effect (like Curtains.js example)
          const mousePosition = { x: 0, y: 0 };
          const mouseLastPosition = { x: 0, y: 0 };
          const deltas = { max: 0 };

          // Trail system for enhanced pixelation trailing
          const trailPositions: THREE.Vector2[] = new Array(60)
            .fill(0)
            .map(() => new THREE.Vector2(0, 0));
          const trailStrengths: number[] = new Array(60).fill(0);
          const trailDirections: THREE.Vector2[] = new Array(60)
            .fill(0)
            .map(() => new THREE.Vector2(0, 0));
          let trailIndex = 0;

          // Linear interpolation function
          const lerp = (start: number, end: number, factor: number) => {
            return start + (end - start) * factor;
          };

          const handleMouseMove = (event: MouseEvent) => {
            mouseLastPosition.x = mousePosition.x;
            mouseLastPosition.y = mousePosition.y;

            const mouse = { x: event.clientX, y: event.clientY };

            // Lerp the mouse position for smoothness
            mousePosition.x = lerp(mousePosition.x, mouse.x, 0.3);
            mousePosition.y = lerp(mousePosition.y, mouse.y, 0.3);

            const canvas = document.querySelector("canvas");
            if (canvas) {
              const rect = canvas.getBoundingClientRect();

              // Convert screen coordinates to UV coordinates (0 to 1)
              const uvX = (mousePosition.x - rect.left) / rect.width;
              const uvY = (mousePosition.y - rect.top) / rect.height;

              // Check if the mouse is within the canvas bounds
              if (uvX >= 0 && uvX <= 1 && uvY >= 0 && uvY <= 1) {
                // Update shader uniforms
                displacementMaterial.uniforms.uMousePosition.value.set(
                  uvX,
                  uvY
                );

                // Calculate movement direction for trail
                const prevIndex = (trailIndex - 1 + 60) % 60;
                const prevPos = trailPositions[prevIndex];
                const movementDir = new THREE.Vector2(
                  uvX - prevPos.x,
                  uvY - prevPos.y
                );

                if (movementDir.length() > 0.01) {
                  movementDir.normalize();
                } else {
                  movementDir.copy(trailDirections[prevIndex]);
                }

                // Add current position to trail system
                trailPositions[trailIndex].set(uvX, uvY);
                trailStrengths[trailIndex] = 1.0;
                trailDirections[trailIndex].copy(movementDir);
                trailIndex = (trailIndex + 1) % 60;

                // Calculate mouse movement strength
                if (mouseLastPosition.x !== 0 && mouseLastPosition.y !== 0) {
                  let delta =
                    Math.sqrt(
                      Math.pow(mousePosition.x - mouseLastPosition.x, 2) +
                        Math.pow(mousePosition.y - mouseLastPosition.y, 2)
                    ) / 30;
                  delta = Math.min(4, delta);

                  // Lower the threshold and remove the penalty for slow movements
                  if (delta > 0.01) {
                    deltas.max = Math.max(delta, deltas.max);
                  }
                }
              } else {
                // Rapidly decay effect when mouse is outside canvas
                deltas.max *= 0.7;
              }
            }
          };

          // Animation loop for shader
          const animate = () => {
            displacementMaterial.uniforms.uTime.value =
              performance.now() / 1000;

            // Aggressively decay mouse movement strength and snap to zero
            deltas.max *= 0.97; // Slower decay for a longer tail
            if (deltas.max < 0.01) {
              deltas.max = 0; // Snap to zero to completely stop effects
            }
            displacementMaterial.uniforms.uMouseMoveStrength.value = deltas.max;

            // Update trail system - decay trail strengths over time
            for (let i = 0; i < 60; i++) {
              // Use a much slower decay rate for a longer, more liquid trail
              const decayRate = deltas.max < 0.01 ? 0.95 : 0.98;
              trailStrengths[i] *= decayRate;

              if (trailStrengths[i] < 0.01) {
                trailStrengths[i] = 0;
                // Reset trail position when strength hits zero
                trailPositions[i].set(0, 0);
                trailDirections[i].set(0, 0);
              }
            }

            // Update shader uniforms with trail data
            displacementMaterial.uniforms.uTrailPositions.value =
              trailPositions;
            displacementMaterial.uniforms.uTrailStrengths.value =
              trailStrengths;

            requestAnimationFrame(animate);
          };

          // Add mouse listener
          window.addEventListener("mousemove", handleMouseMove);
          animate();

          console.log(
            "🖥️ Three.js displacement effect initialized with mouse tracking"
          );
        } else {
          console.error("❌ No video source available for texture");
        }
      } else {
        console.error("❌ No target mesh found for texture application");
      }
    }
  }, [groupRef.current, scene, targetMeshId]);

  useEffect(() => {
    console.log("=== TABLET DEBUG INFO ===");
    console.log("Model path:", tabletPath);
    console.log("Video path:", videoSrc);
    console.log("Scene loaded:", !!scene);
    console.log("Target mesh ID:", targetMeshId);
    console.log("Target mesh name:", targetMeshName);

    if (scene) {
      console.log("Scene object:", scene);
      console.log("Scene children:", scene.children);

      const allMeshes: THREE.Mesh[] = [];

      // Collect all meshes and display comprehensive information
      console.log("🔍 ANALYZING ALL MESHES:");
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          allMeshes.push(child);
        }
      });

      // Display all meshes with their indices and properties
      allMeshes.forEach((mesh, index) => {
        // Calculate mesh properties
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox!;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = bbox.getCenter(new THREE.Vector3());

        // Calculate flatness ratio (how flat the surface is)
        const flatnessRatio =
          Math.min(size.x, size.y, size.z) / Math.max(size.x, size.y, size.z);
        const area = size.x * size.y; // Approximate surface area

        console.log(`📦 MESH ${index}:`);
        console.log(`  Name: "${mesh.name || "unnamed"}"`);
        console.log(`  ID: ${mesh.id}`);
        console.log(`  UUID: ${mesh.uuid}`);
        console.log(
          `  Dimensions: ${size.x.toFixed(3)} x ${size.y.toFixed(
            3
          )} x ${size.z.toFixed(3)}`
        );
        console.log(
          `  Flatness: ${flatnessRatio.toFixed(3)} (closer to 0 = flatter)`
        );
        console.log(`  Area: ${area.toFixed(3)}`);
        console.log(
          `  Center: ${center.x.toFixed(3)}, ${center.y.toFixed(
            3
          )}, ${center.z.toFixed(3)}`
        );
        console.log(`  Vertices: ${mesh.geometry.attributes.position.count}`);
        console.log(
          `  Material: ${(mesh.material as THREE.Material)?.constructor.name}`
        );

        // Check if this looks like a screen (flat and rectangular)
        const isFlat = flatnessRatio < 0.1;
        const isReasonableSize = area > 0.01 && area < 10;
        const aspectRatio = Math.max(size.x, size.y) / Math.min(size.x, size.y);
        const isScreenLike =
          isFlat && isReasonableSize && aspectRatio > 1.2 && aspectRatio < 3;

        if (isScreenLike) {
          console.log(
            `  ️ LOOKS LIKE A SCREEN! (flat=${isFlat}, size=${isReasonableSize}, aspect=${aspectRatio.toFixed(
              2
            )})`
          );
        }

        console.log(`  ---`);
      });

      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log("Model size:", size);
      console.log("Model center:", center);
    }
  }, [scene, tabletPath, videoSrc]);

  if (!scene) {
    return (
      <group ref={groupRef}>
        <Box args={[1, 1, 1]} position={[0, 0, 0]}>
          <meshBasicMaterial color="red" />
        </Box>
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      <primitive
        object={scene.clone()}
        scale={[0.6, 0.6, 0.6]}
        position={[0, -0.2, 0]}
        rotation={[0.1, Math.PI, 0]}
      />
    </group>
  );
}

function DebugScene({
  videoSrc,
  tabletPath,
  targetMeshId,
  targetMeshName,
}: {
  videoSrc: string;
  tabletPath: string;
  targetMeshId?: number;
  targetMeshName?: string;
}) {
  return (
    <>
      <ambientLight intensity={2.0} />
      <directionalLight
        position={[0, 2, 5]}
        intensity={1.5}
        castShadow={false}
      />
      <directionalLight
        position={[0, 2, -5]}
        intensity={1.5}
        castShadow={false}
      />
      <directionalLight
        position={[0, -2, -5]}
        intensity={1.5}
        castShadow={false}
      />
      <directionalLight
        position={[0, 5, 0]}
        intensity={1.0}
        castShadow={false}
      />
      <directionalLight
        position={[0, -5, 0]}
        intensity={1.0}
        castShadow={false}
      />
      <pointLight position={[5, 0, -2]} intensity={1.0} color="#ffffff" />
      <pointLight position={[-5, 0, -2]} intensity={1.0} color="#ffffff" />
      <pointLight position={[0, 0, -5]} intensity={1.0} color="#ffffff" />
      <pointLight position={[0, -2, -3]} intensity={1.0} color="#ffffff" />
      <DebugTabletModel
        videoSrc={videoSrc}
        tabletPath={tabletPath}
        targetMeshId={targetMeshId}
        targetMeshName={targetMeshName}
      />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={10}
        enablePan={false}
        maxPolarAngle={Math.PI / 1.8}
        minPolarAngle={Math.PI / 3}
        enableZoom={true}
        zoomSpeed={1}
        target={[0, -0.2, 0]}
      />
    </>
  );
}

export default function TabletVideoDebug({
  videoSrc = "/willow.mp4",
  tabletPath = "/models/tablet.glb",
  className = "",
  targetMeshId,
  targetMeshName,
}: TabletVideoDebugProps) {
  return (
    <div className={styles.wrapper}>
      <div className={`${styles.container} ${className}`}>
        <Canvas
          className={styles.canvas}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          camera={{
            position: [0, 0, 5],
            fov: 40,
            near: 0.1,
            far: 1000,
          }}
        >
          <color attach="background" args={["#000"]} />
          <DebugScene
            videoSrc={videoSrc}
            tabletPath={tabletPath}
            targetMeshId={targetMeshId}
            targetMeshName={targetMeshName}
          />
        </Canvas>
      </div>
    </div>
  );
}

// Preload the tablet model
useGLTF.preload("/models/tablet.glb");
