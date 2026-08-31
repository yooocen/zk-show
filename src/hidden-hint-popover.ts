import type { HiddenHintKind } from "./focus-projection";

export type HintPopoverState = string | null;
export type LinkPopoverState = string | null;
export type PopoverSide = "left" | "right";
export type PopoverVertical = "above" | "below";

const LABELS: Record<HiddenHintKind, string> = {
  continuation: "连续内容",
  offTopic: "题外分支",
  sourceTail: "来源后续",
  fold: "折叠祖先",
};

export function toggleHint(current: HintPopoverState, nextId: string): HintPopoverState {
  return current === nextId ? null : nextId;
}

export function closeHint(_: HintPopoverState): null {
  return null;
}

export function toggleLink(current: LinkPopoverState, nextCode: string): LinkPopoverState {
  return current === nextCode ? null : nextCode;
}

export function hintDescription(marker: Pick<{ kind: HiddenHintKind; sourceId: string }, "kind" | "sourceId">): string {
  return `${marker.sourceId} 的${LABELS[marker.kind]}提示`;
}

export function popoverPosition(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  popover: { width: number; height: number },
  gap = 14,
): { left: number; top: number; side: PopoverSide; vertical: PopoverVertical } {
  const margin = 8;
  const side: PopoverSide = point.x + gap + popover.width <= viewport.width - margin ? "right" : "left";
  const vertical: PopoverVertical = point.y + gap + popover.height <= viewport.height - margin ? "below" : "above";
  const rawLeft = side === "right" ? point.x + gap : point.x - gap - popover.width;
  const rawTop = vertical === "below" ? point.y + gap : point.y - gap - popover.height;
  return {
    left: Math.max(margin, Math.min(rawLeft, viewport.width - popover.width - margin)),
    top: Math.max(margin, Math.min(rawTop, viewport.height - popover.height - margin)),
    side,
    vertical,
  };
}
