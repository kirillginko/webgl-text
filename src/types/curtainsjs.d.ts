declare module 'curtainsjs' {
  export class Curtains {
    canvas: HTMLCanvasElement;
    constructor(options: any);
    onError(callback: () => void): Curtains;
    onContextLost(callback: () => void): Curtains;
    dispose(): void;
  }

  export class Plane {
    uniforms: any;
    constructor(curtains: Curtains, element: HTMLElement, options: any);
    onReady(callback: () => void): Plane;
    onError(callback: () => void): Plane;
    mouseToPlaneCoords(coords: Vec2): Vec2;
    remove(): void;
  }

  export class Vec2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }
} 