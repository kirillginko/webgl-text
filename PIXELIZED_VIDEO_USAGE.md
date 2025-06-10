# PixelizedVideoGrid Component

A React component that creates a pixelized grid effect over video content using Three.js shaders, similar to the mosaic effect shown in surveillance or artistic video installations.

## Features

- Real-time video playback with shader-based pixelization
- Adjustable grid size and pixel intensity
- Smooth animated color shifts across grid cells
- Responsive design
- TypeScript support

## Usage

```tsx
import PixelizedVideoGrid from "./components/PixelizedVideoGrid";

function MyComponent() {
  return (
    <div className="w-full h-screen">
      <PixelizedVideoGrid
        videoSrc="/path/to/your/video.mp4"
        gridSize={20}
        pixelIntensity={0.8}
        className="rounded-lg"
      />
    </div>
  );
}
```

## Props

| Prop             | Type     | Default | Description                                  |
| ---------------- | -------- | ------- | -------------------------------------------- |
| `videoSrc`       | `string` | -       | Path to the video file (required)            |
| `gridSize`       | `number` | `20`    | Number of grid cells across the width/height |
| `pixelIntensity` | `number` | `0.8`   | Intensity of the pixelization effect (0-1)   |
| `className`      | `string` | `""`    | Additional CSS classes                       |

## Setup Requirements

1. Make sure your video file is placed in the `public/` directory
2. The component requires Three.js dependencies that are already included in this project:
   - `three`
   - `@react-three/fiber`
   - `@react-three/drei`

## Video Format Recommendations

- Use MP4 format for best browser compatibility
- Ensure the video has appropriate CORS headers if loading from external sources
- For autoplay to work, the video should be muted (handled automatically by the component)

## Shader Details

The component uses custom GLSL shaders to create:

- Grid-based pixelation effect
- Animated color shifts using sine waves
- Border effects around grid cells
- Smooth interpolation between original and pixelated video

## Demo

Visit `/pixelized-video` to see the component in action with adjustable controls.
