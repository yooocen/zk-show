import { FileView, ItemView, Plugin, TFile, WorkspaceLeaf, type HoverPopover } from "obsidian";
import { computeView, ThreadIndex, type ZRecord } from "./model";
import { layoutView, renderLayout, type Layout } from "./renderer";
import { closeHint, hintDescription, popoverPosition, toggleHint } from "./hidden-hint-popover";
import { normalizeZettelkastenNo } from "./parser";
import { pinchScale, zoomViewportAt, type ViewportPoint, type ViewportState } from "./viewport";
import { linkIndicatorState, scanInlineLinks, type InlineLink } from "./inline-links";
import { shouldPreviewLinkOnPointer } from "./hover-link";
import { ZkNoFormModal } from "./zkno-form-modal";
import { indexFingerprint } from "./index-fingerprint";
import { collectRootTopics } from "./topic-graph";
import { TopicSwitch } from "./topic-switch";

export const VIEW_TYPE_ZK_SHOW = "zk-show-view";

export default class ZkShowPlugin extends Plugin {
  index = new ThreadIndex([]);
  private view: ZkShowView | null = null;
  private rebuildTimer: number | null = null;
  private lastFingerprint = "";

  onload(): void {
    const records = this.collectRecords();
    this.lastFingerprint = indexFingerprint(records);
    this.index = new ThreadIndex(records);
    this.registerHoverLinkSource("zk-show", {
      display: "ZK Show 卡片关系图",
      defaultMod: true,
    });

    this.registerView(VIEW_TYPE_ZK_SHOW, (leaf) => {
      this.view = new ZkShowView(leaf, this);
      return this.view;
    });

    this.addRibbonIcon("git-branch", "ZK Show 卡片关系图", () => this.activateView());
    this.addCommand({
      id: "open-zk-show",
      name: "打开卡片关系图",
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "assign-zkno",
      name: "为当前笔记设置/推断 zettelkastenNo",
      callback: () => new ZkNoFormModal(this.app, this.index).open(),
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => this.view?.onActiveLeafChange(leaf)));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRebuild()));
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleRebuild()));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ZK_SHOW);
  }

  async activateView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_ZK_SHOW)[0];
    if (!leaf) {
      leaf = (this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true)) as WorkspaceLeaf;
      await leaf.setViewState({ type: VIEW_TYPE_ZK_SHOW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  scheduleRebuild(): void {
    if (this.rebuildTimer) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      const records = this.collectRecords();
      const fp = indexFingerprint(records);
      // 图谱依赖的数据（路径、编码、标题、双链）没有实际变化时跳过重建。
      // 覆盖「编辑后立即撤销回到原状」「resolved 事件空触发」等场景，
      // 避免不必要的图谱刷新与视口（缩放）重置。
      if (fp === this.lastFingerprint) return;
      this.lastFingerprint = fp;
      this.index = new ThreadIndex(records);
      this.view?.refresh();
    }, 300);
  }

  private collectRecords(): ZRecord[] {
    const records: ZRecord[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(f);
      const no = cache?.frontmatter?.zettelkastenNo;
      if (no !== undefined && no !== null) {
        const links = scanInlineLinks([...(cache?.links ?? []), ...(cache?.embeds ?? [])], f.path, (link, sourcePath) => {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
        return target ? { path: target.path, title: target.extension === "md" ? target.basename : target.name } : null;
        });
        records.push({ path: f.path, basename: f.basename, no, links });
      }
    }
    return records;
  }
}

class ZkShowView extends ItemView {
  private readonly plugin: ZkShowPlugin;
  private rootEl!: HTMLElement;
  private canvasEl!: HTMLElement;
  private topicSwitch: TopicSwitch | null = null;
  private panX = 0;
  private panY = 0;
  private scale = 1;
  private dragActive = false;
  private dragMoved = false;
  private pointerDownTarget: Element | null = null;
  private lastTapTime = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragBaseX = 0;
  private dragBaseY = 0;
  private readonly activePointers = new Map<number, ViewportPoint>();
  private pinchStartScale = 1;
  private pinchStartDistance = 0;
  private pinchStartMidpoint: ViewportPoint = { x: 0, y: 0 };
  private pinchBasePanX = 0;
  private pinchBasePanY = 0;
  private focusCode: string | null = null;
  private focusExpectedPath: string | null = null;
  private focusPinnedUntil = 0;
  private currentLayout: Layout | null = null;
  private openHintId: string | null = null;
  private hintPopoverEl: HTMLElement | null = null;
  private hintMarkerEl: Element | null = null;
  private openLinkCode: string | null = null;
  private linkPopoverEl: HTMLElement | null = null;
  private linkIndicatorEl: Element | null = null;
  private linkHoverTimer: number | null = null;
  hoverPopover: HoverPopover | null = null;
  private linkPreviewTarget: HTMLElement | null = null;
  private linkPreviewPath: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private allowResizeCenter = false;
  private diagEl: HTMLElement | null = null;

  /** 诊断：在画面上方叠加一个半透明面板显示日志，方便触摸端用户拷贝。 */
  private diag(msg: string): void {
    if (!this.diagEl) {
      this.diagEl = this.rootEl.createDiv({ cls: "zk-show-diagnostic" });
    }
    const line = this.diagEl.createDiv({ text: msg });
    while (this.diagEl.children.length > 12) {
      this.diagEl.removeChild(this.diagEl.firstChild!);
    }
  }

  onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
    // 以事件携带的 leaf 视图文件为准：过渡期 getActiveFile() 可能返回旧文件或 null，
    // 而事件触发时 leaf.view.file 已就绪，能可靠区分导航自身的 openFile 与用户主动切换。
    const activeFile = (leaf?.view instanceof FileView ? leaf.view.file : null) ?? this.app.workspace.getActiveFile();
    const activePath = activeFile?.path ?? null;
    const pinned = this.focusCode !== null && this.focusExpectedPath !== null && Date.now() < this.focusPinnedUntil;
    if (pinned) {
      // 导航自身的 openFile 已生效：到达目标文件，解除钉住并跳过重复刷新
      if (activePath === this.focusExpectedPath) {
        this.focusExpectedPath = null;
        return;
      }
      // 过渡中尚未拿到有效文件：跳过，等待正确的 leaf-change
      if (activePath === null) return;
      // 用户主动切换到其他文件：解除钉住、继续刷新
      this.focusExpectedPath = null;
    }
    this.refresh();
  }

  constructor(leaf: WorkspaceLeaf, plugin: ZkShowPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_ZK_SHOW;
  }

  getDisplayText(): string {
    return "ZK Show 卡片关系图";
  }

  getIcon(): string {
    return "git-branch";
  }

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl.createDiv({ cls: "zk-show-root" });
    this.rootEl.addEventListener("pointerdown", this.onPointerDown);
    this.rootEl.addEventListener("pointermove", this.onPointerMove);
    this.rootEl.addEventListener("pointerup", this.onPointerEnd);
    this.rootEl.addEventListener("pointercancel", this.onPointerEnd);
    this.rootEl.addEventListener("wheel", this.onWheel, { passive: false });
    this.rootEl.addEventListener("keydown", this.onKeyDown);
    this.rootEl.addEventListener("pointerover", this.onLinkPointerOver);
    this.rootEl.addEventListener("pointerout", this.onLinkPointerOut);
    // 阻止原生拖拽（SVG role=button 元素按下拖动会触发 dragstart 吞掉 pointermove）
    this.rootEl.addEventListener("dragstart", (ev) => ev.preventDefault());
    this.resizeObserver = new ResizeObserver(() => {
      if (this.allowResizeCenter && this.activePointers.size === 0) this.centerCanvas();
    });
    this.resizeObserver.observe(this.rootEl);
    this.refresh();
  }

  async onClose(): Promise<void> {
    if (this.linkHoverTimer !== null) {
      window.clearTimeout(this.linkHoverTimer);
      this.linkHoverTimer = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.activePointers.clear();
    this.endInteraction();
    this.closeHintPopover();
    this.closeLinkPopover();
    this.topicSwitch?.destroy();
    this.topicSwitch = null;
    this.hoverPopover = null;
    this.linkPreviewTarget = null;
    this.linkPreviewPath = null;
    this.rootEl?.remove();
  }

  private resetViewport(): void {
    this.scale = 1;
    this.centerCanvas();
  }

  /** 把正在查看的卡片居中到可见区（无当前卡时退回画布居中） */
  private centerCanvas(): void {
    const root = this.rootEl;
    if (!root || !this.canvasEl) return;
    if (root.clientWidth === 0 || root.clientHeight === 0) return;
    const cur = this.canvasEl.querySelector<HTMLElement>(".zk-show-card.is-current");
    if (cur) {
      const cxp = cur.offsetLeft + cur.offsetWidth / 2;
      const cyp = cur.offsetTop + cur.offsetHeight / 2;
      this.panX = Math.round(root.clientWidth / 2 - cxp * this.scale);
      this.panY = Math.round(root.clientHeight / 2 - cyp * this.scale);
    } else {
      const cw = this.canvasEl.offsetWidth;
      const ch = this.canvasEl.offsetHeight;
      this.panX = Math.round((root.clientWidth - cw * this.scale) / 2);
      this.panY = Math.round((root.clientHeight - ch * this.scale) / 2);
    }
    this.applyViewport();
    this.allowResizeCenter = false;
  }

  private viewport(): ViewportState {
    return { panX: this.panX, panY: this.panY, scale: this.scale };
  }

  private setViewport(viewport: ViewportState): void {
    this.panX = viewport.panX;
    this.panY = viewport.panY;
    this.scale = viewport.scale;
    this.applyViewport();
  }

  private applyViewport(): void {
    this.canvasEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  private pointFromPointer(ev: PointerEvent): ViewportPoint {
    const rect = this.rootEl.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  private beginPan(point: ViewportPoint): void {
    this.closeHintPopover();
    this.closeLinkPopover();
    this.dragActive = true;
    this.dragMoved = false;
    this.dragStartX = point.x;
    this.dragStartY = point.y;
    this.dragBaseX = this.panX;
    this.dragBaseY = this.panY;
  }

  private firstTwoPointers(): [ViewportPoint, ViewportPoint] | null {
    const points = [...this.activePointers.values()];
    return points.length >= 2 ? [points[0], points[1]] : null;
  }

  private beginPinch(): void {
    const pair = this.firstTwoPointers();
    if (!pair) return;
    const [first, second] = pair;
    this.dragActive = false;
    this.dragMoved = true;
    this.closeHintPopover();
    this.pinchStartScale = this.scale;
    this.pinchStartDistance = Math.hypot(second.x - first.x, second.y - first.y);
    this.pinchStartMidpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    this.pinchBasePanX = this.panX;
    this.pinchBasePanY = this.panY;
    this.rootEl.classList.add("is-panning");
  }

  private static dragThreshold(pointerType: string): number {
    // 触摸轻触手指有微小位移（slop），阈值放宽避免误判为拖动
    return pointerType === "touch" ? 10 : 3;
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (ev.target instanceof Element && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch")) return;
    this.activePointers.set(ev.pointerId, this.pointFromPointer(ev));
    this.pointerDownTarget = ev.target instanceof Element ? ev.target : null;
    // 诊断：记录灯泡/指示器点击的事件类型
    if (ev.pointerType === "touch" && this.pointerDownTarget?.closest(".zk-show-hint-marker, .zk-show-link-indicator")) {
      this.diag(`down: target=${this.pointerDownTarget.className} type=${ev.pointerType} id=${ev.pointerId}`);
    }
    ev.preventDefault();
    try {
      this.rootEl.setPointerCapture(ev.pointerId);
    } catch {
      if (this.pointerDownTarget instanceof Element) this.pointerDownTarget.setPointerCapture(ev.pointerId);
    }
    if (this.pointerDownTarget?.closest(".zk-show-link-indicator")) {
      this.dragActive = false;
      this.dragMoved = false;
      return;
    }
    if (this.activePointers.size === 1) {
      this.beginPan(this.pointFromPointer(ev));
    } else if (this.activePointers.size === 2) {
      this.beginPinch();
    }
  };

  private onPointerMove = (ev: PointerEvent): void => {
    if (ev.target instanceof Element && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch")) return;
    if (!this.activePointers.has(ev.pointerId)) return;
    ev.preventDefault();
    this.activePointers.set(ev.pointerId, this.pointFromPointer(ev));

    if (this.activePointers.size >= 2) {
      const pair = this.firstTwoPointers();
      if (!pair) return;
      const [first, second] = pair;
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const nextScale = pinchScale(this.pinchStartScale, this.pinchStartDistance, distance);
      const zoomed = zoomViewportAt(
        { panX: this.pinchBasePanX, panY: this.pinchBasePanY, scale: this.pinchStartScale },
        this.pinchStartMidpoint,
        nextScale
      );
      this.setViewport({
        ...zoomed,
        panX: zoomed.panX + midpoint.x - this.pinchStartMidpoint.x,
        panY: zoomed.panY + midpoint.y - this.pinchStartMidpoint.y,
      });
      return;
    }

    if (!this.dragActive) return;
    const point = this.pointFromPointer(ev);
    const dx = point.x - this.dragStartX;
    const dy = point.y - this.dragStartY;
    const threshold = ZkShowView.dragThreshold(ev.pointerType);
    if (!this.dragMoved && (Math.abs(dx) > threshold || Math.abs(dy) > threshold)) {
      this.dragMoved = true;
      this.rootEl.classList.add("is-panning");
    }
    if (this.dragMoved) {
      this.panX = this.dragBaseX + dx;
      this.panY = this.dragBaseY + dy;
      this.applyViewport();
    }
  };

  private onPointerEnd = (ev: PointerEvent): void => {
    if (ev.target instanceof Element && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch")) return;
    if (!this.activePointers.has(ev.pointerId)) {
      // 诊断：指针未记录时提前返回
      if (ev.pointerType === "touch") this.diag(`up: MISSING pointerId=${ev.pointerId}`);
      return;
    }
    const wasSinglePointer = this.activePointers.size === 1;
    // 拖动判定兜底：快速滑动或触碰后立即离开时，pointermove 可能来不及把 dragMoved
    // 置位，但按下与抬起位置已发生位移，此时应视为拖动而非点击，避免误弹出内容框。
    const endPoint = this.pointFromPointer(ev);
    const threshold = ZkShowView.dragThreshold(ev.pointerType);
    const dragged =
      Math.abs(endPoint.x - this.dragStartX) > threshold || Math.abs(endPoint.y - this.dragStartY) > threshold;
    const moved = ev.pointerType === "touch" ? this.dragMoved : (this.dragMoved || dragged);
    // 诊断：灯泡/指示器 tap 判定
    if (ev.pointerType === "touch" && this.pointerDownTarget?.closest(".zk-show-hint-marker, .zk-show-link-indicator")) {
      this.diag(`up: moved=${moved} dragMoved=${this.dragMoved} dragged=${dragged} single=${wasSinglePointer}`);
    }
    this.activePointers.delete(ev.pointerId);
    if (this.rootEl.hasPointerCapture(ev.pointerId)) this.rootEl.releasePointerCapture(ev.pointerId);

    if (this.activePointers.size >= 2) {
      this.beginPinch();
      return;
    }
    if (this.activePointers.size === 1) {
      this.beginPan([...this.activePointers.values()][0]);
      this.dragMoved = true;
      return;
    }

    if (wasSinglePointer && !moved) {
      if (this.pointerDownTarget?.closest(".zk-show-link-indicator")) {
        this.navigateFromTarget(this.pointerDownTarget);
        this.lastTapTime = 0;
      } else {
        const now = Date.now();
        if (now - this.lastTapTime < 300) {
          this.resetViewport();
          this.lastTapTime = 0;
        } else {
          this.navigateFromTarget(this.pointerDownTarget);
          this.lastTapTime = now;
        }
      }
    }
    this.endInteraction();
  };

  private endInteraction(): void {
    this.dragActive = false;
    this.dragMoved = false;
    this.rootEl.classList.remove("is-panning");
  }

  private onWheel = (ev: WheelEvent): void => {
    if (!ev.ctrlKey) {
      return;
    }
    ev.preventDefault();
    const rect = this.rootEl.getBoundingClientRect();
    const focal = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    const delta =
      ev.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? ev.deltaY * 16
        : ev.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? ev.deltaY * this.rootEl.clientHeight
          : ev.deltaY;
    this.setViewport(zoomViewportAt(this.viewport(), focal, this.scale * Math.exp(-delta * 0.002)));
  }

  private navigateFromTarget(target: Element | null): void {
    if (target?.closest(".zk-show-link-indicator")) {
      const indicator = target.closest<HTMLElement>(".zk-show-link-indicator");
      const code = indicator?.getAttribute("data-code");
      if (code) this.showLinkPopover(code, indicator);
      return;
    }
    if (target?.closest(".zk-show-hint-marker")) {
      const markerId = target.closest(".zk-show-hint-marker")?.getAttribute("data-hint-id");
      // 诊断：确认 navigateFromTarget 找到 hint marker
      this.diag(`nav: markerId=${markerId} target=${target?.tagName} cls=${target?.className}`);
      if (markerId) this.toggleHintPopover(markerId, target.closest(".zk-show-hint-marker"));
      return;
    }
    if (target?.closest(".zk-show-hint-node")) {
      const item = target.closest<HTMLElement>(".zk-show-hint-node");
      const code = item?.getAttribute("data-code");
      if (code && item && !item.classList.contains("is-ghost")) this.navigateToCode(code, item.getAttribute("data-path"));
      return;
    }
    if (!target || target === this.rootEl || target === this.canvasEl || target.closest(".zk-show-lines")) {
      this.closeHintPopover();
      this.closeLinkPopover();
      return;
    }
    const card = target.closest(".zk-show-card");
    if (!card) return;
    const code = card.getAttribute("data-code");
    if (!code) return;
    const path = card.getAttribute("data-path");
    this.navigateToCode(code, path);
  }

  private navigateToCode(code: string, path: string | null): void {
    // 钉住目标 code：openFile 是异步的，.excalidraw.md 这类被插件特殊视图
    // 接管的文件，在过渡期内 getActiveFile 仍可能返回旧文件，从而把刚切换
    // 的焦点覆盖回旧卡。钉住期内 refresh 一律用此 code；直到 getActiveFile
    // 真正返回目标文件（说明 openFile 已生效）才解除钉住，回退信任活动文件。
    this.focusCode = code;
    this.focusExpectedPath = path ?? null;
    this.focusPinnedUntil = Date.now() + 5000;
    if (path) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        this.app.workspace.getLeaf(false).openFile(file);
      }
    }
    this.refresh(true);
    this.centerCanvas();
  }

  private openLinkedFile(link: InlineLink): void {
    if (!link.path) return;
    const file = this.app.vault.getAbstractFileByPath(link.path);
    if (file instanceof TFile) {
      this.closeLinkPopover();
      this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  private bindLinkTitlePreview(titleEl: HTMLElement, path: string): void {
    const trigger = (ev: PointerEvent): void => {
      if (!shouldPreviewLinkOnPointer(ev)) return;
      if (this.linkPreviewTarget === titleEl && this.linkPreviewPath === path) return;
      this.linkPreviewTarget = titleEl;
      this.linkPreviewPath = path;
      this.app.workspace.trigger("hover-link", {
        event: ev,
        source: "zk-show",
        hoverParent: this,
        targetEl: titleEl,
        linktext: path,
        sourcePath: this.app.workspace.getActiveFile()?.path ?? "",
      });
    };
    titleEl.addEventListener("pointerover", trigger);
    titleEl.addEventListener("pointermove", trigger);
    titleEl.addEventListener("pointerout", () => {
      if (this.linkPreviewTarget === titleEl) {
        this.linkPreviewTarget = null;
        this.linkPreviewPath = null;
      }
    });
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    const indicator = ev.target instanceof Element ? ev.target.closest(".zk-show-link-indicator") : null;
    if (indicator && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      const code = indicator.getAttribute("data-code");
      if (code) this.showLinkPopover(code, indicator);
      return;
    }
    const marker = ev.target instanceof Element ? ev.target.closest(".zk-show-hint-marker") : null;
    if (marker && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      const id = marker.getAttribute("data-hint-id");
      if (id) this.toggleHintPopover(id, marker);
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      this.closeHintPopover();
      this.closeLinkPopover();
    }
  };

  private closeHintPopover(): void {
    this.openHintId = closeHint(this.openHintId);
    this.hintPopoverEl?.remove();
    this.hintPopoverEl = null;
    const marker = this.hintMarkerEl;
    this.hintMarkerEl = null;
    if (marker instanceof HTMLElement && marker.isConnected) marker.focus();
  }

  private closeLinkPopover(): void {
    if (this.linkHoverTimer !== null) {
      window.clearTimeout(this.linkHoverTimer);
      this.linkHoverTimer = null;
    }
    this.openLinkCode = null;
    this.linkPopoverEl?.remove();
    this.linkPopoverEl = null;
    this.linkPreviewTarget = null;
    this.linkPreviewPath = null;
    const indicator = this.linkIndicatorEl;
    this.linkIndicatorEl = null;
    if (indicator instanceof HTMLElement && indicator.isConnected) {
      indicator.setAttribute("aria-expanded", "false");
      indicator.classList.remove("is-lit");
      indicator.classList.add(linkIndicatorState(false));
    }
  }

  private openLinkPopover(code: string, indicatorEl: Element | null): void {
    const card = this.currentLayout?.cards.find((candidate) => candidate.code === code);
    if (!card) return;
    const outgoing = card.links;
    const incoming = this.getBacklinks(code);
    if (outgoing.length === 0 && incoming.length === 0) return;
    const pathToCode = new Map<string, string>();
    for (const node of this.plugin.index.allNodes()) {
      if (node.path) pathToCode.set(node.path, node.code);
    }
    const topicRoot = this.plugin.index.rootOf(code);
    this.closeHintPopover();
    this.closeLinkPopover();
    if (!indicatorEl?.isConnected) {
      indicatorEl = this.canvasEl?.querySelector(`.zk-show-link-indicator[data-code="${code}"]`) ?? null;
    }
    this.openLinkCode = code;
    this.linkIndicatorEl = indicatorEl;
    indicatorEl?.setAttribute("aria-expanded", "true");
    indicatorEl?.classList.remove("is-unlit");
    indicatorEl?.classList.add(linkIndicatorState(true));

    const popover = this.rootEl.createDiv({ cls: "zk-show-link-popover" });
    popover.setAttribute("role", "dialog");
    popover.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    popover.addEventListener("pointerup", (ev) => ev.stopPropagation());

    if (outgoing.length > 0) {
      const section = popover.createDiv({ cls: "zk-show-link-section" });
      section.createDiv({ cls: "zk-show-link-section-title", text: `出链（${outgoing.length}）` });
      const list = section.createDiv({ cls: "zk-show-link-popover-list" });
      for (const link of outgoing) {
        const resolved = link.path !== null;
        const item = list.createDiv({ cls: `zk-show-link-item${resolved ? "" : " is-unresolved"}` });
        const title = item.createSpan({ cls: "zk-show-link-item-label", text: link.label });
        const outCode = link.path ? pathToCode.get(link.path) : undefined;
        if (outCode) {
          const zno = item.createSpan({ cls: "zk-show-link-item-zkno", text: outCode });
          if (this.plugin.index.rootOf(outCode) !== topicRoot) zno.classList.add("is-external");
        }
        if (resolved) {
          this.bindLinkTitlePreview(title, link.path!);
          item.setAttribute("role", "button");
          item.setAttribute("tabindex", "0");
          item.addEventListener("pointerdown", (ev) => {
            if (ev.pointerType === "mouse" && ev.button !== 0) return;
            ev.stopPropagation();
            this.openLinkedFile(link);
          });
          item.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              this.openLinkedFile(link);
            }
          });
        } else {
          item.setAttribute("aria-disabled", "true");
        }
      }
    }

    if (incoming.length > 0) {
      const section = popover.createDiv({ cls: "zk-show-link-section" });
      section.createDiv({ cls: "zk-show-link-section-title", text: `入链（${incoming.length}）` });
      const list = section.createDiv({ cls: "zk-show-link-popover-list" });
      for (const backlink of incoming) {
        const item = list.createDiv({ cls: "zk-show-link-item" });
        const title = item.createSpan({ cls: "zk-show-link-item-label", text: backlink.label });
        const inCode = backlink.path ? pathToCode.get(backlink.path) : undefined;
        if (inCode) {
          const zno = item.createSpan({ cls: "zk-show-link-item-zkno", text: inCode });
          if (this.plugin.index.rootOf(inCode) !== topicRoot) zno.classList.add("is-external");
        }
        if (backlink.path) {
          this.bindLinkTitlePreview(title, backlink.path);
          item.setAttribute("role", "button");
          item.setAttribute("tabindex", "0");
          item.addEventListener("pointerdown", (ev) => {
            if (ev.pointerType === "mouse" && ev.button !== 0) return;
            ev.stopPropagation();
            this.openLinkedFile({ path: backlink.path } as InlineLink);
          });
          item.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              this.openLinkedFile({ path: backlink.path } as InlineLink);
            }
          });
        }
      }
    }

    this.linkPopoverEl = popover;
    const rootRect = this.rootEl.getBoundingClientRect();
    const indicatorRect = indicatorEl?.getBoundingClientRect();
    const ix = indicatorRect ? indicatorRect.left - rootRect.left : this.rootEl.clientWidth / 2;
    const iy = indicatorRect ? indicatorRect.bottom - rootRect.top : this.rootEl.clientHeight / 2;
    const gap = 8;
    const margin = 8;
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    const below = iy + gap + ph <= this.rootEl.clientHeight - margin;
    const top = below ? iy + gap : Math.max(margin, iy - gap - ph - (indicatorRect?.height ?? 0));
    const left = Math.max(margin, Math.min(ix, this.rootEl.clientWidth - pw - margin));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  private getBacklinks(code: string): Array<{ label: string; path: string | null }> {
    const node = this.plugin.index.node(code);
    if (!node || !node.path) return [];
    const targetPath = node.path;
    const result: Array<{ label: string; path: string | null }> = [];
    for (const sourceNode of this.plugin.index.allNodes()) {
      if (sourceNode.code === code) continue;
      for (const link of sourceNode.links) {
        if (link.path === targetPath) {
          result.push({ label: sourceNode.title, path: sourceNode.path });
        }
      }
    }
    return result;
  }

  private showLinkPopover(code: string, indicatorEl: Element | null): void {
    if (this.openLinkCode === code) return;
    this.openLinkPopover(code, indicatorEl);
  }

  private onLinkPointerOver = (ev: PointerEvent): void => {
    if (ev.pointerType !== "mouse") return;
    if (!(ev.target instanceof Element)) return;
    const indicator = ev.target.closest(".zk-show-link-indicator");
    if (!indicator) return;
    const code = indicator.getAttribute("data-code");
    if (!code) return;
    if (this.linkHoverTimer !== null) window.clearTimeout(this.linkHoverTimer);
    this.linkHoverTimer = window.setTimeout(() => {
      this.linkHoverTimer = null;
      this.showLinkPopover(code, indicator);
    }, 500);
  };

  private onLinkPointerOut = (ev: PointerEvent): void => {
    if (ev.pointerType !== "mouse") return;
    if (!(ev.target instanceof Element)) return;
    const fromIndicator = ev.target.closest(".zk-show-link-indicator");
    if (!fromIndicator) return;
    const related = ev.relatedTarget instanceof Element ? ev.relatedTarget : null;
    if (related?.closest(".zk-show-link-indicator, .zk-show-link-popover")) return;
    if (this.linkHoverTimer !== null) {
      window.clearTimeout(this.linkHoverTimer);
      this.linkHoverTimer = null;
    }
  };

  private toggleHintPopover(id: string, markerEl: Element | null): void {
    const marker = this.currentLayout?.markers.find((candidate) => candidate.id === id);
    // 诊断：确认 toggleHintPopover 是否被调用及 marker 是否找到
    this.diag(`toggle: id=${id} found=${!!marker} layout=${!!this.currentLayout} el=${!!markerEl}`);
    if (!marker) return;
    if (this.openHintId === id) {
      this.closeHintPopover();
      return;
    }
    this.closeLinkPopover();
    this.hintPopoverEl?.remove();
    this.openHintId = toggleHint(this.openHintId, id);
    this.hintMarkerEl = markerEl;

    const popover = this.rootEl.createDiv({ cls: "zk-show-hint-popover" });
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", marker.label);
    popover.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    const title = popover.createDiv({ cls: "zk-show-hint-popover-title", text: marker.label });
    title.setAttribute("tabindex", "-1");
    const description = popover.createDiv({ cls: "zk-show-hint-popover-description", text: hintDescription(marker) });
    description.setAttribute("data-source-id", marker.sourceId);
    popover.createDiv({ cls: "zk-show-hint-popover-source", text: `来源：${marker.sourceId}` });
    const list = popover.createDiv({ cls: "zk-show-hint-popover-list" });
    for (const code of marker.hiddenIds) {
      const node = this.plugin.index.node(code);
      const item = list.createDiv({ cls: `zk-show-hint-node${node?.isGhost ? " is-ghost" : ""}` });
      item.createSpan({ cls: "zk-show-hint-node-code", text: code });
      item.createSpan({ cls: "zk-show-hint-node-title", text: node?.title ?? code });
      if (node && !node.isGhost && node.path) {
        item.setAttribute("data-code", code);
        item.setAttribute("data-path", node.path);
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.addEventListener("click", () => this.navigateToCode(code, node.path));
        item.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            this.navigateToCode(code, node.path);
          }
        });
      }
    }
    this.hintPopoverEl = popover;
    const markerPoint = { x: marker.x * this.scale + this.panX, y: marker.y * this.scale + this.panY };
    const position = popoverPosition(markerPoint, { width: this.rootEl.clientWidth, height: this.rootEl.clientHeight }, { width: popover.offsetWidth, height: popover.offsetHeight });
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
    popover.dataset.side = position.side;
    popover.dataset.vertical = position.vertical;
    title.focus();
  }

  private addBacklinkIndicators(layout: Layout, canvas: HTMLElement): void {
    const pathToCode = new Map<string, string>();
    for (const node of this.plugin.index.allNodes()) {
      if (node.path) pathToCode.set(node.path, node.code);
    }
    const visibleCodes = new Set(layout.cards.map((c) => c.code));
    const backlinkCodes = new Set<string>();
    for (const node of this.plugin.index.allNodes()) {
      for (const link of node.links) {
        if (!link.path) continue;
        const targetCode = pathToCode.get(link.path);
        if (targetCode && visibleCodes.has(targetCode) && node.code !== targetCode) {
          backlinkCodes.add(targetCode);
        }
      }
    }
    for (const cardEl of canvas.querySelectorAll<HTMLElement>(".zk-show-card")) {
      const code = cardEl.getAttribute("data-code");
      if (!code || !backlinkCodes.has(code)) continue;
      if (cardEl.querySelector(".zk-show-link-indicator")) continue;
      const header = cardEl.querySelector<HTMLElement>(".zk-show-card-header");
      if (!header) continue;
      const indicator = header.createEl("button", {
        cls: `zk-show-link-indicator ${linkIndicatorState(false)}`,
        attr: { type: "button", "data-link-indicator": "true", "data-code": code },
      });
      header.insertBefore(indicator, header.firstChild);
    }
  }

  refresh(preserveViewport = false): void {
    const root = this.rootEl;
    if (!root) return;
    this.closeHintPopover();
    this.closeLinkPopover();
    this.currentLayout = null;
    // 只移除旧画布与旧空提示，保留 TopicSwitch 等固定 UI 子元素
    if (this.canvasEl) this.canvasEl.remove();
    root.querySelectorAll(".zk-show-empty").forEach((el) => el.remove());

    // TopicSwitch 在视图生命周期内仅创建一次，避免重复重建导致面板状态丢失
    if (!this.topicSwitch) {
      this.topicSwitch = new TopicSwitch();
      this.topicSwitch.onChange((code) => {
        const node = this.plugin.index.node(code);
        this.navigateToCode(code, node?.path ?? null);
      });
      root.appendChild(this.topicSwitch.el);
    }
    this.topicSwitch.setOptions(
      collectRootTopics(this.plugin.index).map((item) => ({
        code: item.code,
        title: item.title,
        disabled: item.isGhost,
      }))
    );

    // 画布层：随拖动平移（像 zettelkasten-forest 一样自由拖拽）
    const hasActivePointer = this.activePointers.size > 0;
    const now = Date.now();
    const pinned = this.focusCode !== null && this.focusExpectedPath !== null && now < this.focusPinnedUntil;
    if (pinned) preserveViewport = true;

    const canvas = root.createDiv({ cls: "zk-show-canvas" });
    this.canvasEl = canvas;
    if (!hasActivePointer && !preserveViewport) {
      this.panX = 0;
      this.panY = 0;
      // 保留用户已设定的缩放比例：切换 md 笔记或重建时仅重置平移并重新居中，
      // 不再把 scale 重置为 1。缩放比例的显式重置由双击 resetViewport 负责。
      this.activePointers.clear();
      this.endInteraction();
    }
    this.applyViewport();

    const active = this.app.workspace.getActiveFile();
    const code = pinned ? this.focusCode : this.resolveActiveCode(active);
    if (!pinned) {
      this.focusCode = code;
      this.focusExpectedPath = null;
    }
    this.topicSwitch?.setSelected(
      code !== null && !this.plugin.index.node(code)?.isGhost ? code : null
    );
    if (code === null) {
      return;
    }

    const vr = computeView(this.plugin.index, code);
    if (!vr) {
      this.empty(`未在索引中找到编码 ${code}（可能索引尚未加载），请稍候或切换一下笔记。`);
      return;
    }

    const layout = layoutView(vr);
    this.currentLayout = layout;
    renderLayout(layout, canvas);
    this.addBacklinkIndicators(layout, canvas);
    if (hasActivePointer) {
      const lastPoint = [...this.activePointers.values()][0];
      this.dragStartX = lastPoint.x;
      this.dragStartY = lastPoint.y;
      this.dragBaseX = this.panX;
      this.dragBaseY = this.panY;
    } else if (!preserveViewport) {
      this.allowResizeCenter = true;
      this.centerCanvas();
    }
  }

  private resolveActiveCode(active: TFile | null): string | null {
    if (!active) {
      this.empty("打开一篇带 zettelkastenNo 前台的笔记，这里会展示它与其他卡片的关系。");
      return null;
    }
    const no = this.app.metadataCache.getFileCache(active)?.frontmatter?.zettelkastenNo;
    const code = normalizeZettelkastenNo(no);
    if (code === null) {
      this.empty(`当前笔记「${active.basename}」没有有效的 zettelkastenNo 前台编码，无法参与关系展示。`);
      return null;
    }
    return code;
  }

  private empty(msg: string): void {
    this.rootEl.createDiv({ cls: "zk-show-empty", text: msg });
  }
}
