# Tablet Video Component Usage Guide

## Overview

The `TabletVideo` components allow you to superimpose a video on top of a 3D tablet model using Three.js and React Three Drei. Two versions are available:

1. **TabletVideo** - Attempts to automatically detect and apply video to the tablet's screen mesh
2. **TabletVideoAdvanced** - Creates a separate video plane positioned above the tablet model (recommended)

## Basic Usage

```tsx
import { TabletVideoAdvanced } from "./components/TabletVideo";

export default function MyPage() {
  return (
    <TabletVideoAdvanced
      videoSrc="/your-video.mp4"
      tabletPath="/models/tablet.glb"
    />
  );
}
```

## Props

### TabletVideoAdvanced Props

| Prop            | Type                       | Default                | Description                              |
| --------------- | -------------------------- | ---------------------- | ---------------------------------------- |
| `videoSrc`      | `string`                   | `"/willow.mp4"`        | Path to the video file                   |
| `tabletPath`    | `string`                   | `"/models/tablet.glb"` | Path to the tablet 3D model              |
| `className`     | `string`                   | `""`                   | Additional CSS classes                   |
| `videoScale`    | `[number, number]`         | `[2.8, 2.1]`           | Scale of the video plane [width, height] |
| `videoPosition` | `[number, number, number]` | `[0, 0.1, 0.01]`       | Position of video plane [x, y, z]        |
| `videoRotation` | `[number, number, number]` | `[0.1, 0, 0]`          | Rotation of video plane [x, y, z]        |

## Customization

### Adjusting Video Position

To properly align the video with your tablet's screen, you may need to adjust these props:

```tsx
<TabletVideoAdvanced
  videoScale={[3.0, 2.2]} // Make video larger/smaller
  videoPosition={[0, 0.2, 0.02]} // Move video up/down, forward/back
  videoRotation={[0.15, 0, 0]} // Tilt video to match screen angle
/>
```

### Video Requirements

- **Format**: MP4 recommended for best browser compatibility
- **Size**: Keep under 50MB for good performance
- **Resolution**: 1920x1080 or lower for optimal performance
- The video will automatically loop and start muted

### Model Requirements

- **Format**: GLB (preferred) or GLTF
- **Size**: Optimize your model to keep under 5MB
- **Materials**: The component will override materials, so basic materials are fine

## Features

- **Interactive Controls**: Mouse/touch controls for rotating and zooming
- **Automatic Animation**: Gentle floating and rotation animation
- **Responsive**: Adapts to different screen sizes
- **Performance Optimized**: Uses hardware acceleration and efficient rendering

## Troubleshooting

### Video not showing

1. Check that the video file exists in the `public` folder
2. Ensure the video format is supported (MP4 is recommended)
3. Adjust `videoPosition` to move the video plane closer to the camera

### Video not aligned with screen

1. Adjust `videoScale` to match your tablet's screen proportions
2. Modify `videoPosition` to center the video on the screen
3. Use `videoRotation` to match the tablet's screen angle

### Model not loading

1. Verify the GLB file exists in the `public/models` folder
2. Check browser console for loading errors
3. Ensure the model file is not corrupted

### Performance issues

1. Reduce video resolution
2. Optimize the 3D model (reduce polygon count)
3. Lower the canvas resolution in the component

## Advanced Customization

You can extend the component by modifying the lighting, materials, or adding post-processing effects. The component uses React Three Fiber, so you can add any Three.js features.

Example with custom lighting:

```tsx
// You can modify the Scene component in TabletVideoAdvanced.tsx
// to add custom lighting or effects
```

## Dependencies

The component requires these packages (already included in your project):

- `@react-three/fiber`
- `@react-three/drei`
- `three`
- `react`

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

WebGL 2.0 support is required for optimal performance.
