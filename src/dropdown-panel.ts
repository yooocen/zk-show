/**
 * 下拉面板几何：面板高度必须落在可用空间内，否则会被祖先滚动容器裁掉，
 * 末尾选项怎么滚都选不到。这里只做几何与展开，不关心选项内容。
 *
 * 两种宿主环境：
 *   - 视图内（`openDropdownPanel`）：面板绝对定位在 `.zk-show-root` 内，按该宿主的可用高度限高；
 *   - 弹窗内（`openFixedDropdownPanel`）：`.modal` / `.modal-content` 都是滚动容器且层级不定，
 *     面板改为相对视口固定定位，按视口可用高度限高并在必要时向上展开。
 */

/** 面板高度上限，与 styles.css 中下拉面板的 max-height 一致。 */
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

export interface FixedPlacement {
  /** true 表示面板翻到锚点上方展开。 */
  above: boolean;
  maxHeight: number;
}

/**
 * 视口内浮层（position: fixed）的展开方向与限高。
 *
 * 弹窗里的下拉被 `.modal-content`、`.modal` 这类滚动容器裁切，只要面板越过容器底边，
 * 越界部分既看不到滚动条也点不中。浮层相对视口定位后不再受祖先裁切，于是只需按视口算高度：
 *   - 下方放得下整个面板（`contentHeight`）→ 向下；
 *   - 下方放不下、且上方更宽敞 → 翻到上方，避免只剩一条缝要滚；
 *   - 上下都不够 → 向下并按保底高度截断（允许溢出视口）。
 * `contentHeight` 未知（非有限值或 ≤0）时退化为「下方够一个保底高度就向下」。
 */
export function fixedPanelPlacement(
  anchor: { top: number; bottom: number },
  viewportHeight: number,
  contentHeight = 0,
): FixedPlacement {
  const spaceBelow = viewportHeight - anchor.bottom - PANEL_GAP - PANEL_MARGIN;
  const spaceAbove = anchor.top - PANEL_GAP - PANEL_MARGIN;
  const fitsBelow = Number.isFinite(contentHeight) && contentHeight > 0
    ? contentHeight <= spaceBelow
    : spaceBelow >= PANEL_MIN_HEIGHT;
  if (fitsBelow || spaceAbove <= spaceBelow) {
    return { above: false, maxHeight: panelMaxHeight(spaceBelow) };
  }
  return { above: true, maxHeight: panelMaxHeight(spaceAbove) };
}

/**
 * 以浮层方式展开面板：先显示再量内容高度，据此定位到锚点下方（放不下且上方更宽敞时翻到上方），
 * 按视口限高，并把选中项滚入视野。与 `openDropdownPanel` 的区别是不依赖宿主容器，
 * 因此不会被弹窗滚动容器裁掉。
 */
export function openFixedDropdownPanel(panel: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const view = panel.ownerDocument?.defaultView ?? null;
  const viewportHeight = Number.isFinite(view?.innerHeight)
    ? (view?.innerHeight as number)
    : rect.bottom + PANEL_MAX_HEIGHT + PANEL_MARGIN;

  panel.style.position = "fixed";
  panel.style.left = `${Math.round(rect.left)}px`;
  panel.style.right = "auto";
  panel.style.width = `${Math.round(rect.width)}px`;
  // 先展开才能量到未截断的内容高度（scrollHeight 不受 max-height 限制）
  panel.classList.add("is-open");

  const placement = fixedPanelPlacement(rect, viewportHeight, panel.scrollHeight);
  panel.style.maxHeight = `${placement.maxHeight}px`;
  if (placement.above) {
    panel.style.top = "auto";
    panel.style.bottom = `${Math.round(viewportHeight - rect.top + PANEL_GAP)}px`;
  } else {
    panel.style.top = `${Math.round(rect.bottom + PANEL_GAP)}px`;
    panel.style.bottom = "auto";
  }
  panel.classList.toggle("is-above", placement.above);

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
