export type Viewport = { x: number; y: number; scale: number };
export type Point = { x: number; y: number };
export const MIN_SCALE = 0.025;
export const MAX_SCALE = 3;

export function zoomAt(view: Viewport, factor: number, point: Point): Viewport {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

export function fitView(width: number, height: number, graphWidth: number, graphHeight: number): Viewport {
  const scale = Math.max(MIN_SCALE, Math.min(1, (width - 32) / graphWidth, (height - 32) / graphHeight));
  return { scale, x: (width - graphWidth * scale) / 2, y: (height - graphHeight * scale) / 2 };
}
