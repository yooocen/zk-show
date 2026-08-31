/** 将焦点投影交给通用图布局管线，并输出现有 DOM/SVG 渲染入口所需的数据。 */
import type { ViewResult } from "./model";
import { compileLayoutGraph } from "./layout/compiler";
import { findLayoutConflicts } from "./layout/clearance";
import { normalizeLayout } from "./layout/normalize";
import { routeEdges } from "./layout/router";
import { solveLayout } from "./layout/solver";
import type { ProjectionCard } from "./focus-projection";
import { collectHiddenHintMarkers, type HiddenHintMarker } from "./hidden-hint-markers";
import { hasInlineLinks, linkIndicatorState } from "./inline-links";

export interface PlacedCard extends ProjectionCard {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EdgeKind = "link" | "vbar" | "cont" | "poly";

export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: EdgeKind;
  dashed?: boolean;
  sourceId?: string;
  targetId?: string;
  groupId?: string;
  points?: Array<{ x: number; y: number }>;
}

export interface Layout {
  cards: PlacedCard[];
  edges: Edge[];
  markers: HiddenHintMarker[];
  width: number;
  height: number;
}

export function cardSections(card: Pick<PlacedCard, "code" | "title" | "links">): {
  header: { code: string; hasLinkIndicator: boolean };
  body: { title: string };
} {
  return {
    header: { code: card.code, hasLinkIndicator: hasInlineLinks(card.links) },
    body: { title: card.title },
  };
}

export function layoutView(view: ViewResult): Layout {
  const graph = compileLayoutGraph(view);
  const solved = solveLayout(graph);
  const initial = routeEdges(solved);
  const routed = findLayoutConflicts(initial).length === 0
    ? initial
    : routeEdges(solved, { forceOuterChannels: true });
  const normalized = normalizeLayout(routed);
  const layout: Layout = {
    cards: normalized.nodes.map((node) => ({
      ...node.card,
      x: node.x,
      y: node.y,
      w: node.width,
      h: node.height,
    })),
    edges: normalized.edges,
    markers: [],
    width: normalized.width,
    height: normalized.height,
  };
  layout.markers = collectHiddenHintMarkers(view, layout);
  return layout;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 把布局渲染进容器（清空假设由调用方完成）。 */
export function renderLayout(layout: Layout, container: HTMLElement): void {
  container.style.width = `${layout.width}px`;
  container.style.height = `${layout.height}px`;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "zk-show-lines");
  svg.setAttribute("width", String(layout.width));
  svg.setAttribute("height", String(layout.height));
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);

  for (const edge of layout.edges) {
    if (edge.kind === "poly" && edge.points && edge.points.length > 0) {
      const poly = document.createElementNS(SVG_NS, "polyline");
      poly.setAttribute("class", `zk-show-edge zk-show-${edge.kind}`);
      poly.setAttribute("points", edge.points.map((point) => `${point.x},${point.y}`).join(" "));
      if (edge.dashed) poly.setAttribute("stroke-dasharray", "4 3");
      svg.appendChild(poly);
      continue;
    }
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", `zk-show-edge zk-show-${edge.kind}`);
    line.setAttribute("x1", String(edge.x1));
    line.setAttribute("y1", String(edge.y1));
    line.setAttribute("x2", String(edge.x2));
    line.setAttribute("y2", String(edge.y2));
    if (edge.dashed) line.setAttribute("stroke-dasharray", "4 3");
    svg.appendChild(line);
  }

  for (const marker of layout.markers) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", `zk-show-hint-marker${marker.dashed ? " dashed" : ""}`);
    group.setAttribute("data-hint-id", marker.id);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("transform", `translate(${marker.x} ${marker.y})`);
    const hit = document.createElementNS(SVG_NS, "circle");
    hit.setAttribute("class", "zk-show-hint-hit");
    hit.setAttribute("r", "12");
    const pulse = document.createElementNS(SVG_NS, "circle");
    pulse.setAttribute("class", "zk-show-hint-pulse");
    pulse.setAttribute("r", "8");
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "zk-show-hint-dot");
    dot.setAttribute("r", "4");
    group.appendChild(hit);
    group.appendChild(pulse);
    group.appendChild(dot);
    svg.appendChild(group);
  }
  container.appendChild(svg);

  for (const card of layout.cards) {
    const className = `zk-show-card${card.isCurrent ? " is-current" : ""}${card.isGhost ? " is-ghost" : ""}${hasInlineLinks(card.links) ? " has-inline-links" : ""}`;
    const element = container.createDiv({ cls: className });
    element.style.left = `${card.x}px`;
    element.style.top = `${card.y}px`;
    element.style.width = `${card.w}px`;
    element.style.height = `${card.h}px`;
    if (card.path) element.setAttribute("data-path", card.path);
    element.setAttribute("data-code", card.code);
    const sections = cardSections(card);
    const header = element.createDiv({ cls: "zk-show-card-header" });
    if (sections.header.hasLinkIndicator) {
      const indicator = header.createEl("button", {
        cls: `zk-show-link-indicator ${linkIndicatorState(false)}`,
        attr: {
          type: "button",
          "data-link-indicator": "true",
          "data-code": card.code,
        },
      });
      indicator.setAttribute("aria-haspopup", "dialog");
    }
    header.createDiv({ cls: "zk-show-code", text: sections.header.code });
    element.createDiv({ cls: "zk-show-card-divider" });
    const body = element.createDiv({ cls: "zk-show-card-body" });
    body.createDiv({ cls: "zk-show-title", text: sections.body.title });
  }
}
