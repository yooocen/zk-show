/**
 * 下拉面板几何：面板高度必须落在宿主视图的可用空间内，否则面板会被
 * `.zk-show-root { overflow: hidden }` 裁掉，末尾选项怎么滚都选不到。
 * 这里只做几何与展开，不关心选项内容。
 */

/** 面板高度上限，与 styles.css 中 .zk-show-topic-switch-panel 的 max-height 一致。 */
export const PANEL_MAX_HEIGHT = 280;
/** 视图极矮时的保底高度（约一个半条目）；再矮只能允许面板溢出。 */
export const PANEL_MIN_HEIGHT = 64;
/** 面板与触发按钮之间的间隙，与 styles.css 的 top: calc(100% + 4px) 一致。 */
export const PANEL_GAP = 4;
/** 面板底部与宿主底部之间保留的间距。 */
export const PANEL_MARGIN = 8;
/** 下拉展开期间挂在宿主上的类，用于放开纵向触摸滚动。 */
export const HOST_OPEN_CLASS = "zk-show-dropdown-open";

/** 可用空间充足时取上限，不足时贴合可用空间，极矮视图保底；非有限值回退上限。 */
export function panelMaxHeight(spaceBelow: number): number {
  if (!Number.isFinite(spaceBelow)) return PANEL_MAX_HEIGHT;
  return Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, Math.floor(spaceBelow)));
}

/**
 * 把选中项滚入面板可视区。只改面板自身的 scrollTop（offsetTop 相对定位祖先即面板），
 * 不用 scrollIntoView，避免顺带滚动 Obsidian 的视图容器。
 */
export function scrollItemIntoView(panel: HTMLElement, item: HTMLElement): void {
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (top < panel.scrollTop) {
    panel.scrollTop = top;
    return;
  }
  if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
}

/** 展开面板：按宿主可用空间限制高度 → 显示 → 标记宿主放触摸滚动 → 选中项滚入视野。 */
export function openDropdownPanel(panel: HTMLElement, anchor: HTMLElement, host: HTMLElement | null): void {
  panel.style.maxHeight = `${panelMaxHeight(availableHeightBelow(anchor, host))}px`;
  panel.classList.add("is-open");
  host?.classList.add(HOST_OPEN_CLASS);
  const selected = panel.querySelector<HTMLElement>(".is-selected");
  if (!selected) {
    panel.scrollTop = 0;
    return;
  }
  scrollItemIntoView(panel, selected);
}

/** 面板可用的竖直空间；宿主取不到时返回非有限值，由 panelMaxHeight 回退到上限。 */
function availableHeightBelow(anchor: HTMLElement, host: HTMLElement | null): number {
  if (!host) return Number.POSITIVE_INFINITY;
  const hostRect = host.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  return hostRect.bottom - anchorRect.bottom - PANEL_GAP - PANEL_MARGIN;
}
