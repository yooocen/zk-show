import { FileView, ItemView, Plugin, TFile, WorkspaceLeaf, type HoverPopover } from "obsidian";
import { computeView, ThreadIndex, type ZRecord } from "./model";
import { layoutView, renderLayout, type Layout } from "./renderer";
import { closeHint, hintDescription, popoverPosition, toggleHint } from "./hidden-hint-popover";
import { parseZettelkastenNoList } from "./parser";
import { pinchScale, zoomViewportAt, type ViewportPoint, type ViewportState } from "./viewport";
import { linkIndicatorState, scanInlineLinks, type InlineLink } from "./inline-links";
import { shouldPreviewLinkOnPointer } from "./hover-link";
import { ZkNoFormModal } from "./zkno-form-modal";
import { indexFingerprint } from "./index-fingerprint";
import { collectRootTopics } from "./topic-graph";
import { TopicSwitch } from "./topic-switch";
import { NavButtons, type NavDirection } from "./nav-buttons";
import { deriveZkNoSwitchOptions, ZkNoSwitch } from "./zkno-switch";

/** 跨窗口（popout）安全的元素判定：不依赖构造函数（各窗口 realm 不同），
 *  用 DOM 固有属性 nodeType === 1（ELEMENT_NODE）判断，任何窗口都成立。 */
function isElementNode(target: EventTarget | null | undefined): target is Element {
  return target !== null && target !== undefined && (target as Node).nodeType === 1;
}

/** 跨窗口（popout）安全的 HTMLElement 判定，供 close*Popover 中的聚焦回跳使用。
 *  同样不依赖构造函数，仅校验元素节点具备 focus 方法。 */
function isHtmlElementNode(target: Element | null | undefined): target is HTMLElement {
  return target !== null && target !== undefined && target.nodeType === 1 && typeof (target as HTMLElement).focus === "function";
}

interface ZkShowData {
  /** path → 该 md 上次聚焦的 zkNo 编码。 */
  lastTopicByPath?: Record<string, string>;
}

export const VIEW_TYPE_ZK_SHOW = "zk-show-view";

export default class ZkShowPlugin extends Plugin {
  index = new ThreadIndex([]);
  private data: ZkShowData = {};
  private dataReady: Promise<void> = Promise.resolve();
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

    this.dataReady = this.loadData()
      .then((data) => {
        this.data = Object.assign({}, (data as ZkShowData) ?? {}, this.data);
        this.view?.refresh();
      })
      .catch(() => {});
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

  /** 返回该文件应聚焦的编码：持久记忆有效则沿用，否则取第一个。 */
  lastTopicForPath(path: string, codes: string[]): string {
    const remembered = this.data.lastTopicByPath?.[path];
    return remembered && codes.includes(remembered) ? remembered : codes[0];
  }

  async rememberTopic(path: string, code: string): Promise<void> {
    if (this.data.lastTopicByPath?.[path] === code) return;
    if (!this.data.lastTopicByPath) this.data.lastTopicByPath = {};
    this.data.lastTopicByPath[path] = code;
    await this.dataReady;
    void this.saveData(this.data);
  }

  private collectRecords(): ZRecord[] {
    const records: ZRecord[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(f);
      const codes = parseZettelkastenNoList(cache?.frontmatter?.zettelkastenNo);
      if (codes.length === 0) continue;
      const links = scanInlineLinks([...(cache?.links ?? []), ...(cache?.embeds ?? [])], f.path, (link, sourcePath) => {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
        return target ? { path: target.path, title: target.extension === "md" ? target.basename : target.name } : null;
      });
      for (const no of codes) {
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
  private navButtons: NavButtons | null = null;
  private zkNoSwitch: ZkNoSwitch | null = null;
  private activeCodes: string[] | null = null;
  private panX = 0;
  private panY = 0;
  private scale = 1;
  private preSelectedCode: string | null = null;
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
  /** 每个根话题上次浏览时停留的聚焦卡与视口位置，切换话题时恢复。 */
  private readonly topicStates = new Map<string, { focusCode: string; viewport: ViewportState }>();
  /** 切换话题时的聚焦覆盖：刷新优先使用它，直到用户再次导航（点卡/切笔记）。 */
  private focusOverride: string | null = null;
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
    // 用户主动切换笔记：取消话题聚焦覆盖，回到以活动笔记为准
    this.focusOverride = null;
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
    this.rootEl = this.contentEl.createDiv({ cls: "zk-show-root", attr: { tabindex: "0" } });
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
    this.rootEl.focus();
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
    this.navButtons?.destroy();
    this.navButtons = null;
    this.zkNoSwitch?.destroy();
    this.zkNoSwitch = null;
    this.hoverPopover = null;
    this.linkPreviewTarget = null;
    this.linkPreviewPath = null;
    this.rootEl?.remove();
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
    if (isElementNode(ev.target) && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch, .zk-show-zkno-switch, .zk-show-nav-buttons, .zk-show-empty")) return;
    // 点击画布时清除预选中状态
    this.clearPreSelected();
    this.activePointers.set(ev.pointerId, this.pointFromPointer(ev));
    this.pointerDownTarget = isElementNode(ev.target) ? ev.target : null;
    ev.preventDefault();
    // 确保点击后 rootEl 获得焦点，裸键方向键/Home/End 才能工作
    this.rootEl.focus();
    try {
      this.rootEl.setPointerCapture(ev.pointerId);
    } catch {
      if (this.pointerDownTarget) this.pointerDownTarget.setPointerCapture(ev.pointerId);
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
    if (isElementNode(ev.target) && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch, .zk-show-zkno-switch, .zk-show-nav-buttons, .zk-show-empty")) return;
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
    if (isElementNode(ev.target) && ev.target.closest(".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch, .zk-show-zkno-switch, .zk-show-nav-buttons, .zk-show-empty")) return;
    if (!this.activePointers.has(ev.pointerId)) return;
    const wasSinglePointer = this.activePointers.size === 1;
    // 拖动判定兜底：快速滑动或触碰后立即离开时，pointermove 可能来不及把 dragMoved
    // 置位，但按下与抬起位置已发生位移，此时应视为拖动而非点击，避免误弹出内容框。
    const endPoint = this.pointFromPointer(ev);
    const threshold = ZkShowView.dragThreshold(ev.pointerType);
    const dragged =
      Math.abs(endPoint.x - this.dragStartX) > threshold || Math.abs(endPoint.y - this.dragStartY) > threshold;
    const moved = ev.pointerType === "touch" ? this.dragMoved : (this.dragMoved || dragged);
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
          this.centerCanvas();
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
    // 点卡等显式导航：取消话题聚焦覆盖，恢复以活动笔记驱动的聚焦
    this.focusOverride = null;
    // 钉住目标 code：openFile 是异步的，.excalidraw.md 这类被插件特殊视图
    // 接管的文件，在过渡期内 getActiveFile 仍可能返回旧文件，从而把刚切换
    // 的焦点覆盖回旧卡。钉住期内 refresh 一律用此 code；直到 getActiveFile
    // 真正返回目标文件（说明 openFile 已生效）才解除钉住，回退信任活动文件。
    if (path && this.plugin.index.node(code)?.path === path) this.plugin.rememberTopic(path, code);
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

  /** 在不切换当前笔记的前提下，把图谱聚焦切换到该笔记的另一个 zkNo。 */
  private switchFocus(code: string, path: string | null): void {
    if (path && this.activeCodes?.includes(code)) this.plugin.rememberTopic(path, code);
    this.focusOverride = null;
    this.focusCode = code;
    this.focusExpectedPath = null;
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
    const indicator = isElementNode(ev.target) ? ev.target.closest(".zk-show-link-indicator") : null;
    if (indicator && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      const code = indicator.getAttribute("data-code");
      if (code) this.showLinkPopover(code, indicator);
      return;
    }
    const marker = isElementNode(ev.target) ? ev.target.closest(".zk-show-hint-marker") : null;
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
      return;
    }

    // 回车聚焦预选中卡片
    if (ev.key === "Enter" && this.preSelectedCode) {
      ev.preventDefault();
      const card = this.currentLayout?.cards.find((c) => c.code === this.preSelectedCode);
      if (card) this.navigateToCode(card.code, card.path);
      return;
    }

    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "Home" || ev.key === "End") {
      const cards = this.currentLayout?.cards;
      if (!cards || cards.length === 0) return;
      ev.preventDefault();
      const dir = ev.key === "ArrowLeft" ? "left" : ev.key === "ArrowRight" ? "right" : ev.key === "ArrowUp" ? "up" : ev.key === "ArrowDown" ? "down" : ev.key === "Home" ? "home" : "end";
      this.navigateByDirection(dir as NavDirection);
    }
  };

  /** 找到当前视口中心最近的卡片，作为键盘导航锚点。 */
  private navigationAnchor(cards: Layout["cards"]): Layout["cards"][number] | null {
    const centerX = (this.rootEl.clientWidth / 2 - this.panX) / this.scale;
    const centerY = (this.rootEl.clientHeight / 2 - this.panY) / this.scale;
    let best: Layout["cards"][number] | null = null;
    let bestDist = Infinity;
    for (const card of cards) {
      const cx = card.x + card.w / 2;
      const cy = card.y + card.h / 2;
      const dist = (cx - centerX) ** 2 + (cy - centerY) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    }
    return best;
  }

  /** 将指定卡片平移到视口中心，但不改变聚焦。 */
  private centerCard(card: Layout["cards"][number]): void {
    this.panX = Math.round(this.rootEl.clientWidth / 2 - (card.x + card.w / 2) * this.scale);
    this.panY = Math.round(this.rootEl.clientHeight / 2 - (card.y + card.h / 2) * this.scale);
    this.applyViewport();
    this.setPreSelected(card.code);
  }

  /** 设置预选中卡片（高亮 + 可回车聚焦）。 */
  private setPreSelected(code: string): void {
    this.clearPreSelected();
    const el = this.canvasEl?.querySelector(`.zk-show-card[data-code="${code}"]`);
    if (el) el.classList.add("is-pre-selected");
    this.preSelectedCode = code;
  }

  /** 清除预选中状态。 */
  private clearPreSelected(): void {
    if (this.preSelectedCode) {
      const el = this.canvasEl?.querySelector(`.zk-show-card[data-code="${this.preSelectedCode}"]`);
      el?.classList.remove("is-pre-selected");
      this.preSelectedCode = null;
    }
  }

  /** 按方向导航（上下左右/Home/End），与键盘和按钮共用。 */
  private navigateByDirection(dir: NavDirection): void {
    const cards = this.currentLayout?.cards;
    if (!cards || cards.length === 0) return;
    const anchor = this.navigationAnchor(cards);
    if (!anchor) return;

    if (dir === "left" || dir === "right") {
      const row = cards.filter((c) => Math.abs(c.y - anchor.y) < 10);
      row.sort((a, b) => a.x - b.x);
      const target = dir === "left"
        ? [...row].reverse().find((c) => c.x + c.w / 2 < anchor.x + anchor.w / 2 - 1)
        : row.find((c) => c.x + c.w / 2 > anchor.x + anchor.w / 2 + 1);
      if (target) this.centerCard(target);
    } else if (dir === "up" || dir === "down") {
      const target = this.polyConnected(anchor, dir === "up" ? "above" : "below");
      if (target) this.centerCard(target);
    } else if (dir === "home") {
      const row = cards.filter((c) => Math.abs(c.y - anchor.y) < 10);
      row.sort((a, b) => a.x - b.x);
      const target = row[0];
      if (target) this.centerCard(target);
    } else if (dir === "end") {
      const row = cards.filter((c) => Math.abs(c.y - anchor.y) < 10);
      row.sort((a, b) => a.x - b.x);
      const target = row[row.length - 1];
      if (target) this.centerCard(target);
    }
    this.updateNavButtons();
  }

  /** 根据当前锚点更新导航按钮的置灰状态。 */
  private updateNavButtons(): void {
    const disabled = new Set<NavDirection>();
    const cards = this.currentLayout?.cards;
    if (!cards || cards.length === 0) { this.navButtons?.setDisabled(new Set(["up", "down", "left", "right", "home", "end"])); return; }
    const anchor = this.navigationAnchor(cards);
    if (!anchor) { this.navButtons?.setDisabled(new Set(["up", "down", "left", "right", "home", "end"])); return; }

    const row = cards.filter((c) => Math.abs(c.y - anchor.y) < 10);
    row.sort((a, b) => a.x - b.x);
    const anchorCenterX = anchor.x + anchor.w / 2;

    if (!row.find((c) => { const cx = c.x + c.w / 2; return cx < anchorCenterX - 1; })) disabled.add("left");
    if (!row.find((c) => { const cx = c.x + c.w / 2; return cx > anchorCenterX + 1; })) disabled.add("right");
    if (!this.polyConnected(anchor, "above")) disabled.add("up");
    if (!this.polyConnected(anchor, "below")) disabled.add("down");
    if (!row[0] || row[0].code === anchor.code) disabled.add("home");
    if (!row[row.length - 1] || row[row.length - 1].code === anchor.code) disabled.add("end");

    this.navButtons?.setDisabled(disabled);
  }

  /** 沿连接线（poly/虚线等）方向找到锚点上方/下方连接的卡片。 */
  private polyConnected(anchor: Layout["cards"][number], dir: "above" | "below"): Layout["cards"][number] | null {
    const cards = this.currentLayout?.cards ?? [];
    const edges = this.currentLayout?.edges ?? [];
    const codeById = new Map(cards.map((c) => [c.code, c]));
    // 用边的 sourceId/targetId 构建邻接，连接锚点所在的折线/连线
    const connected = new Set<string>();
    for (const edge of edges) {
      if (!edge.sourceId || !edge.targetId) continue;
      if (edge.sourceId === anchor.code) connected.add(edge.targetId);
      if (edge.targetId === anchor.code) connected.add(edge.sourceId);
    }
    const anchorY = anchor.y + anchor.h / 2;
    let best: Layout["cards"][number] | null = null;
    let bestDist = Infinity;
    for (const code of connected) {
      const card = codeById.get(code);
      if (!card) continue;
      const targetY = card.y + card.h / 2;
      const inDir = dir === "above" ? targetY < anchorY : targetY > anchorY;
      if (!inDir) continue;
      const dist = Math.abs(targetY - anchorY);
      if (dist < bestDist) { bestDist = dist; best = card; }
    }
    return best;
  }

  private closeHintPopover(): void {
    this.openHintId = closeHint(this.openHintId);
    this.hintPopoverEl?.remove();
    this.hintPopoverEl = null;
    const marker = this.hintMarkerEl;
    this.hintMarkerEl = null;
    if (isHtmlElementNode(marker) && marker.isConnected) marker.focus();
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
    if (isHtmlElementNode(indicator) && indicator.isConnected) {
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
    if (!isElementNode(ev.target)) return;
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
    if (!isElementNode(ev.target)) return;
    const fromIndicator = ev.target.closest(".zk-show-link-indicator");
    if (!fromIndicator) return;
    const related = isElementNode(ev.relatedTarget) ? ev.relatedTarget : null;
    if (related?.closest(".zk-show-link-indicator, .zk-show-link-popover")) return;
    if (this.linkHoverTimer !== null) {
      window.clearTimeout(this.linkHoverTimer);
      this.linkHoverTimer = null;
    }
  };

  private toggleHintPopover(id: string, markerEl: Element | null): void {
    const marker = this.currentLayout?.markers.find((candidate) => candidate.id === id);
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
    this.clearPreSelected();

    // TopicSwitch 在视图生命周期内仅创建一次，避免重复重建导致面板状态丢失
    if (!this.topicSwitch) {
      this.topicSwitch = new TopicSwitch();
      this.topicSwitch.onChange((code) => {
        // 离开当前话题前，记住当前停留的聚焦卡与视口位置
        const oldTopic = this.focusCode ? this.plugin.index.rootOf(this.focusCode) : null;
        if (oldTopic && oldTopic !== code && this.focusCode) {
          this.topicStates.set(oldTopic, { focusCode: this.focusCode, viewport: this.viewport() });
        }
        // 回到上次在该话题停留的卡片；无记录或已失效则聚焦该话题根卡
        let focusTarget = code;
        let savedViewport: ViewportState | undefined;
        const saved = this.topicStates.get(code);
        if (saved) {
          const savedNode = this.plugin.index.node(saved.focusCode);
          if (savedNode && !savedNode.isGhost) {
            focusTarget = saved.focusCode;
            savedViewport = saved.viewport;
          }
        }
        this.focusCode = focusTarget;
        this.focusExpectedPath = null;
        this.focusOverride = focusTarget;
        this.refresh(true);
        if (savedViewport) {
          this.setViewport(savedViewport);
        } else {
          this.centerCanvas();
        }
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

    // 右下角导航按钮组，仅创建一次
    if (!this.navButtons) {
      this.navButtons = new NavButtons();
      this.navButtons.onChange((dir) => this.navigateByDirection(dir));
      root.appendChild(this.navButtons.el);
    }

    // 「笔记话题」下拉：多 zkNo 笔记切换聚焦，仅创建一次
    if (!this.zkNoSwitch) {
      this.zkNoSwitch = new ZkNoSwitch();
      this.zkNoSwitch.onChange((zkNo) => {
        const active = this.app.workspace.getActiveFile();
        this.switchFocus(zkNo, active?.path ?? null);
      });
      root.appendChild(this.zkNoSwitch.el);
    }

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
      // 不再把 scale 重置为 1。缩放的显式重置已移除，双击仅居中当前卡片。
      this.activePointers.clear();
      this.endInteraction();
    }
    this.applyViewport();

    const active = this.app.workspace.getActiveFile();
    const codes = this.resolveActiveCodes(active);
    const code = pinned ? this.focusCode : this.focusOverride ?? (codes !== null && active ? this.plugin.lastTopicForPath(active.path, codes) : null);
    // 话题覆盖生效时可能活动笔记无有效编码，去掉刚插入的空提示
    if (code !== null) root.querySelectorAll(".zk-show-empty").forEach((el) => el.remove());
    if (!pinned) {
      this.focusCode = code;
      this.focusExpectedPath = null;
    }
    this.activeCodes = codes !== null && codes.length > 1 ? codes : null;
    this.topicSwitch?.setSelected(
      code !== null && !this.plugin.index.node(code)?.isGhost ? this.plugin.index.rootOf(code) : null
    );
    this.zkNoSwitch?.render(
      this.activeCodes ? deriveZkNoSwitchOptions(this.activeCodes, this.plugin.index) : [],
      code
    );
    if (code === null) {
      this.updateNavButtons();
      return;
    }

    const vr = computeView(this.plugin.index, code);
    if (!vr) {
      this.empty(`未在索引中找到编码 ${code}（可能索引尚未加载），请稍候或切换一下笔记。`);
      this.updateNavButtons();
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
    this.updateNavButtons();
  }

  private resolveActiveCodes(active: TFile | null): string[] | null {
    if (!active) {
      this.empty("打开一篇带 zettelkastenNo 前台的笔记，这里会展示它与其他卡片的关系。");
      return null;
    }
    const codes = parseZettelkastenNoList(this.app.metadataCache.getFileCache(active)?.frontmatter?.zettelkastenNo);
    if (codes.length === 0) {
      this.empty(`当前笔记「${active.basename}」没有有效的 zettelkastenNo 前台编码，无法参与关系展示。`, {
        label: "新增 zk 关系",
        onClick: () => new ZkNoFormModal(this.app, this.plugin.index).open(),
      });
      return null;
    }
    return codes;
  }

  private empty(msg: string, action?: { label: string; onClick: () => void }): void {
    const box = this.rootEl.createDiv({ cls: "zk-show-empty" });
    box.createDiv({ cls: "zk-show-empty-text", text: msg });
    if (action) {
      const btn = box.createEl("button", {
        cls: "zk-show-empty-action",
        text: action.label,
        attr: { type: "button" },
      });
      btn.addEventListener("click", action.onClick);
    }
  }
}
