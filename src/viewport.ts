export interface ViewportState {
  panX: number;
  panY: number;
  scale: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.5;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** 以视口中的焦点缩放，并保持该焦点对应的画布坐标不变。 */
export function zoomViewportAt(state: ViewportState, focal: ViewportPoint, requestedScale: number): ViewportState {
  const scale = clampScale(requestedScale);
  const ratio = scale / state.scale;
  return {
    panX: focal.x - (focal.x - state.panX) * ratio,
    panY: focal.y - (focal.y - state.panY) * ratio,
    scale,
  };
}

/** 根据两指起止距离计算受限的捏合缩放比例。 */
export function pinchScale(startScale: number, startDistance: number, currentDistance: number): number {
  if (startDistance <= 0) return clampScale(startScale);
  return clampScale(startScale * (currentDistance / startDistance));
}
