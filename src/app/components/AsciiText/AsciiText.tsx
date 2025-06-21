"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { vertexShader, fragmentShader } from "../shaders/AsciiShaders";
import styles from "./AsciiText.module.css";

// Add Math.map utility like in original
declare global {
  interface Math {
    map(
      n: number,
      start: number,
      stop: number,
      start2: number,
      stop2: number
    ): number;
  }
}

Math.map = (
  n: number,
  start: number,
  stop: number,
  start2: number,
  stop2: number
) => {
  return ((n - start) / (stop - start)) * (stop2 - start2) + start2;
};

interface AsciiTextProps {
  text: string;
  fontSize?: number;
  fontFamily?: string;
}

class CanvasText {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private fontSize: number;
  private fontFamily: string;
  private text: string;
  private color: string;

  constructor(
    text: string,
    fontSize: number = 200,
    fontFamily: string = "Arial, Helvetica, sans-serif"
  ) {
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d")!;
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
    this.text = text;
    this.color = "#fdf9f3";
  }

  get texture() {
    return this.canvas;
  }

  private get width() {
    this.context.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    return Math.ceil(this.context.measureText(this.text).width);
  }

  private get metrics() {
    this.context.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    return this.context.measureText(this.text);
  }

  private get height() {
    return Math.ceil(
      (this.metrics.actualBoundingBoxAscent +
        this.metrics.actualBoundingBoxDescent) *
        1.42
    );
  }

  resize() {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  render() {
    // Clear canvas (transparent background like original)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw text
    this.context.fillStyle = this.color;
    this.context.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    this.context.fillText(
      this.text,
      0,
      this.metrics.actualBoundingBoxAscent * 1.2
    );
  }
}

class AsciiFilter {
  public domElement: HTMLDivElement;
  private pre: HTMLPreElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private fontSize: number;
  private fontFamily: string;
  private charset: string;
  private invert: boolean;
  private mouse: { x: number; y: number };
  private center: { x: number; y: number };
  private deg: number;
  private width: number;
  private height: number;
  private cols: number;
  private rows: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    options: { fontSize?: number; fontFamily?: string } = {}
  ) {
    this.renderer = renderer;
    this.fontSize = options.fontSize || 14;
    this.fontFamily =
      options.fontFamily || "'Courier New', Consolas, monospace";
    this.charset =
      " .'`^\",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
    this.invert = true;
    this.mouse = { x: 0, y: 0 };
    this.center = { x: 0, y: 0 };
    this.deg = 0;
    this.width = 0;
    this.height = 0;
    this.cols = 0;
    this.rows = 0;

    this.domElement = document.createElement("div");
    this.pre = document.createElement("pre");
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d")!;

    this.setup();
  }

  private setup() {
    this.domElement.className = styles.container;
    this.pre.className = styles.pre;
    this.canvas.className = styles.canvas;

    this.pre.style.fontSize = `${this.fontSize}px`;

    this.domElement.appendChild(this.pre);
    this.domElement.appendChild(this.canvas);

    this.context.imageSmoothingEnabled = false;
  }

  get charWidth() {
    this.context.font = `${this.fontSize}px ${this.fontFamily}`;
    return this.context.measureText("A").width;
  }

  reset() {
    this.cols = Math.floor(
      this.width / (this.fontSize * (this.charWidth / this.fontSize))
    );
    this.rows = Math.floor(this.height / this.fontSize);

    this.canvas.width = this.cols;
    this.canvas.height = this.rows;

    this.pre.style.fontFamily = this.fontFamily;
    this.pre.style.fontSize = this.fontSize + "px";
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.reset();

    this.center = { x: width / 2, y: height / 2 };
    this.mouse = { x: width / 2, y: height / 2 };
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.render(scene, camera);

    const w = this.canvas.width;
    const h = this.canvas.height;

    this.context.clearRect(0, 0, w, h);
    this.context.drawImage(this.renderer.domElement, 0, 0, w, h);

    this.asciify(w, h);
    this.hue();
  }

  private asciify(w: number, h: number) {
    const imgData = this.context.getImageData(0, 0, w, h).data;
    let str = "";

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = x * 4 + y * 4 * w;
        const [r, g, b, a] = [
          imgData[i],
          imgData[i + 1],
          imgData[i + 2],
          imgData[i + 3],
        ];
        let gray = (0.3 * r + 0.6 * g + 0.1 * b) / 255;

        if (a === 0) gray = 0.9;

        let char = Math.floor((1 - gray) * (this.charset.length - 1));
        if (this.invert) char = this.charset.length - char - 1;

        str += this.charset[char];
      }
      str += "\n";
    }

    this.pre.textContent = str;
  }

  private hue() {
    const dx = this.mouse.x - this.center.x;
    const dy = this.mouse.y - this.center.y;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    this.deg += (deg - this.deg) * 0.075;
    this.domElement.style.filter = `hue-rotate(${this.deg.toFixed(1)}deg)`;
  }

  private applyHolographicEffect(text: string): string {
    const lines = text.split("\n");
    let result = "";

    for (let y = 0; y < lines.length; y++) {
      const line = lines[y];
      for (let x = 0; x < line.length; x++) {
        const char = line[x];
        if (char !== " ") {
          // Calculate hue based on position and time with more dynamic movement
          const time = Date.now() * 0.001;
          const hue =
            (time * 50 + x * 12 + y * 6 + Math.sin(time + x * 0.1) * 30) % 360;

          // Check if it's an edge character for chromatic aberration
          const isEdge = this.isEdgeCharacter(lines, x, y);

          if (isEdge) {
            // Apply chromatic aberration to edge characters with stronger effect
            const redHue = (hue + 0) % 360;
            const greenHue = (hue + 120) % 360;
            const blueHue = (hue + 240) % 360;
            result += `<span style="color: hsl(${hue}, 90%, 70%); text-shadow: 
              -2px 0 hsl(${redHue}, 100%, 50%), 
              0px 0 hsl(${greenHue}, 100%, 50%), 
              2px 0 hsl(${blueHue}, 100%, 50%);">${char}</span>`;
          } else {
            // Regular holographic color with higher saturation
            result += `<span style="color: hsl(${hue}, 85%, 75%);">${char}</span>`;
          }
        } else {
          result += char;
        }
      }
      if (y < lines.length - 1) result += "\n";
    }

    return result;
  }

  private isEdgeCharacter(lines: string[], x: number, y: number): boolean {
    const char = lines[y]?.[x];
    if (!char || char === " ") return false;

    // Check if any adjacent character is empty (making this an edge)
    const adjacent = [
      lines[y - 1]?.[x] === " " || !lines[y - 1]?.[x],
      lines[y + 1]?.[x] === " " || !lines[y + 1]?.[x],
      lines[y]?.[x - 1] === " " || !lines[y]?.[x - 1],
      lines[y]?.[x + 1] === " " || !lines[y]?.[x + 1],
    ];

    return adjacent.some((isEmpty) => isEmpty);
  }

  onMouseMove(x: number, y: number) {
    this.mouse.x = x;
    this.mouse.y = y;
  }
}

export default function AsciiText({
  text,
  fontSize = 200,
  fontFamily = "Arial",
}: AsciiTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.z = 35;

    // Renderer setup - match original
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
    });
    renderer.setPixelRatio(1);
    const filter = new AsciiFilter(renderer, {
      fontSize: 12,
      fontFamily: "IBM Plex Mono",
    });
    container.appendChild(filter.domElement);

    // Text setup
    const canvasText = new CanvasText(text, 200, fontFamily);
    canvasText.resize();
    const texture = new THREE.CanvasTexture(canvasText.texture);
    texture.minFilter = THREE.NearestFilter;

    // Mesh setup - increase subdivisions for better wave effects
    const geometry = new THREE.PlaneGeometry(40, 10, 64, 64);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        mouse: { value: 1.0 },
        uTexture: { value: texture },
      },
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, 0);
    scene.add(mesh);

    // Initial sizing
    filter.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Animation - match original exactly
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const time = performance.now() * 0.001;
      canvasText.render();
      texture.needsUpdate = true;

      material.uniforms.mouse.value = 1.0;
      material.uniforms.uTime.value = time;
      camera.lookAt(scene.position);

      filter.render(scene, camera);
    };

    animate();

    // Mouse movement - match original exactly
    const handleMouseMove = (e: MouseEvent) => {
      // Update rotation like original
      const x = Math.map(e.clientY, 0, height, 0.5, -0.5);
      const y = Math.map(e.clientX, 0, width, -0.5, 0.5);

      mesh.rotation.x += (x - mesh.rotation.x) * 0.05;
      mesh.rotation.y += (y - mesh.rotation.y) * 0.05;

      // Update ASCII filter mouse position with device pixel ratio
      const PX_RATIO = window.devicePixelRatio || 1;
      filter.onMouseMove(e.clientX * PX_RATIO, e.clientY * PX_RATIO);
    };

    window.addEventListener("mousemove", handleMouseMove);

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
      container.removeChild(filter.domElement);
    };
  }, [isClient, text, fontSize, fontFamily]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100vh",
        background: "black",
        position: "relative",
        overflow: "hidden",
      }}
    />
  );
}
