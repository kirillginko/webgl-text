"use client";

import { useState } from "react";
import PixelizedVideoGrid from "../components/PixelizedVideoGrid";

export default function PixelizedVideoDemo() {
  const [gridSize, setGridSize] = useState(20);
  const [pixelIntensity, setPixelIntensity] = useState(0.8);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Pixelized Video Grid Demo
        </h1>

        <div className="mb-8 space-y-4">
          <div className="flex flex-col space-y-2">
            <label htmlFor="gridSize" className="text-sm font-medium">
              Grid Size: {gridSize}
            </label>
            <input
              id="gridSize"
              type="range"
              min="5"
              max="50"
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex flex-col space-y-2">
            <label htmlFor="pixelIntensity" className="text-sm font-medium">
              Pixel Intensity: {pixelIntensity.toFixed(2)}
            </label>
            <input
              id="pixelIntensity"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={pixelIntensity}
              onChange={(e) => setPixelIntensity(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="aspect-video w-full max-w-4xl mx-auto">
          <PixelizedVideoGrid
            videoSrc="/sample-video.mp4"
            gridSize={gridSize}
            pixelIntensity={pixelIntensity}
            className="rounded-lg overflow-hidden"
          />
        </div>

        <div className="mt-8 text-center text-gray-400">
          <p className="mb-2">
            This component creates a pixelized grid effect over video content
            using Three.js shaders.
          </p>
          <p className="text-sm">
            Note: Make sure to place your video file in the{" "}
            <code className="bg-gray-800 px-2 py-1 rounded">public/</code>{" "}
            directory.
          </p>
        </div>
      </div>
    </main>
  );
}
