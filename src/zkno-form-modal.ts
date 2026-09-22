/**
 * zkno-form-modal.ts — 为当前活动笔记设置/推断 zettelkastenNo 的表单弹窗。
 *
 * 两种模式：
 *   - 手动：用户直接输入完整 zkno，按 parser 规则归一化。
 *   - 推断：用户选「话题根编号」缩小上一级笔记候选范围 → 选上一级笔记
 *           → 插件列出「数字下一个(继续讨论) / 字母下一个(题外话)」候选 → 用户挑一个。
 *
 * 确定后调用 app.fileManager.processFrontMatter 写入当前活动笔记的 frontmatter。
 */
import { App, Modal, Notice, TFile } from "obsidian";
import { parseZettelkastenNo } from "./parser";
import { formatUnit, isDigitUnit, isLetterUnit, lastUnit, unitNumber } from "./model-units";
import { TopicGraph, type TopicGraphNode } from "./topic-graph";

type Mode = "manual" | "infer";

export class ZkNoFormModal extends Modal {
  private readonly index: TopicGraph;
  private mode: Mode = "infer";
  private manualInput = "";
  private selectedRoot = "";
  private selectedParentCode = "";
  private selectedCandidate = "";

  private rootCombo!: ComboField;
  private parentCombo!: ComboField;
  private candidateBox!: HTMLElement;
  private inferSection!: HTMLElement;
  private manualSection!: HTMLElement;
  private asRootTopic = false;
  private rootTopicToggle!: HTMLInputElement;
  private inferFieldsEl!: HTMLElement;
  private manualHint!: HTMLElement;

  constructor(app: App, index: TopicGraph) {
    super(app);
    this.index = index;
  }

  onOpen(): void {
    this.titleEl.setText("设置 zettelkastenNo");
    this.contentEl.empty();
    const form = this.contentEl.createDiv({ cls: "zk-show-form" });

    this.renderActiveNoteInfo(form);
    this.renderModeSwitch(form);
    this.manualSection = form.createDiv({ cls: "zk-show-form-section is-hidden" });
    this.inferSection = form.createDiv({ cls: "zk-show-form-section" });
    this.renderManualSection(this.manualSection);
    this.renderInferSection(this.inferSection);
    this.renderActions(form);
    this.applyMode();
  }

  private renderActiveNoteInfo(form: HTMLElement): void {
    const active = this.app.workspace.getActiveFile();
    const box = form.createDiv({ cls: "zk-show-form-active" });
    if (!active || active.extension !== "md") {
      box.createEl("span", { cls: "zk-show-form-warn", text: "当前没有打开 Markdown 笔记，确定后仍会尝试写入活动文件。" });
      return;
    }
    const no = this.app.metadataCache.getFileCache(active)?.frontmatter?.zettelkastenNo;
    const normalized = parseZettelkastenNo(no);
    box.createEl("span", { cls: "zk-show-form-file", text: active.basename });
    if (normalized) {
      box.createEl("span", { cls: "zk-show-form-current", text: `现有 zkno：${normalized.canonical}` });
    } else {
      box.createEl("span", { cls: "zk-show-form-current zk-show-form-warn", text: "暂无有效 zkno" });
    }
  }

  private renderModeSwitch(form: HTMLElement): void {
    const tabs = form.createDiv({ cls: "zk-show-form-tabs" });
    const manualBtn = tabs.createEl("button", { cls: "zk-show-form-tab", text: "手动定义", attr: { type: "button" } });
    const inferBtn = tabs.createEl("button", { cls: "zk-show-form-tab is-active", text: "插件推断", attr: { type: "button" } });
    manualBtn.addEventListener("click", () => {
      this.mode = "manual";
      inferBtn.classList.remove("is-active");
      manualBtn.classList.add("is-active");
      this.applyMode();
    });
    inferBtn.addEventListener("click", () => {
      this.mode = "infer";
      manualBtn.classList.remove("is-active");
      inferBtn.classList.add("is-active");
      this.applyMode();
    });
  }

  private renderManualSection(host: HTMLElement): void {
    host.createDiv({ cls: "zk-show-form-label", text: "zettelkastenNo 编码" });
    const input = host.createEl("input", {
      cls: "zk-show-form-input",
      attr: { type: "text", placeholder: "如 1/4a 或 2", autocomplete: "off" },
    });
    input.value = this.manualInput;
    this.manualHint = host.createDiv({ cls: "zk-show-form-hint" });
    input.addEventListener("input", () => {
      this.manualInput = input.value;
      this.refreshManualHint();
    });
    this.refreshManualHint();
  }

  private renderInferSection(host: HTMLElement): void {
    const toggleRow = host.createDiv({ cls: "zk-show-form-toggle" });
    this.rootTopicToggle = toggleRow.createEl("input", {
      cls: "zk-show-form-checkbox",
      attr: { type: "checkbox", id: "zk-show-form-as-root" },
    });
    toggleRow.createEl("label", {
      cls: "zk-show-form-toggle-label",
      attr: { for: "zk-show-form-as-root" },
      text: "此卡片作为根话题（无上一级笔记）",
    });
    this.rootTopicToggle.addEventListener("change", () => {
      this.asRootTopic = this.rootTopicToggle.checked;
      this.selectedCandidate = "";
      this.inferFieldsEl.classList.toggle("is-hidden", this.asRootTopic);
      this.rebuildCandidates();
    });

    this.inferFieldsEl = host.createDiv({ cls: "zk-show-form-infer-fields" });

    this.inferFieldsEl.createDiv({ cls: "zk-show-form-label", text: "话题根编号（用于缩小上一级笔记范围）" });
    this.rootCombo = new ComboField("选择话题根");
    this.rootCombo.onChange((value) => {
      this.selectedRoot = value;
      this.selectedParentCode = "";
      this.selectedCandidate = "";
      this.rebuildParentCombo();
      this.rebuildCandidates();
    });
    this.inferFieldsEl.appendChild(this.rootCombo.el);

    this.inferFieldsEl.createDiv({ cls: "zk-show-form-label", text: "上一级笔记" });
    this.parentCombo = new ComboField("先选话题根");
    this.parentCombo.setDisabled(true);
    this.parentCombo.onChange((value) => {
      this.selectedParentCode = value;
      this.selectedCandidate = "";
      this.rebuildCandidates();
    });
    this.inferFieldsEl.appendChild(this.parentCombo.el);

    host.createDiv({ cls: "zk-show-form-label", text: "候选编码（由插件推断，请选择其一）" });
    this.candidateBox = host.createDiv({ cls: "zk-show-form-candidates" });

    this.rebuildRootCombo();
    this.rebuildParentCombo();
    this.rebuildCandidates();
  }

  private rebuildRootCombo(): void {
    const roots = this.roots();
    this.rootCombo.setOptions(
      roots.map((r) => ({ value: r.root, code: r.root, title: r.title ?? "" })),
    );
    if (this.selectedRoot && roots.some((r) => r.root === this.selectedRoot)) {
      this.rootCombo.setValue(this.selectedRoot);
    } else {
      this.selectedRoot = "";
      this.rootCombo.setValue("");
    }
  }

  private rebuildParentCombo(): void {
    if (!this.selectedRoot) {
      this.parentCombo.setOptions([]);
      this.parentCombo.setDisabled(true);
      this.selectedParentCode = "";
      this.parentCombo.setValue("");
      return;
    }
    const nodes = this.parentCandidates(this.selectedRoot);
    this.parentCombo.setOptions(
      nodes.map((n) => ({ value: n.code, code: n.code, title: n.title })),
    );
    this.parentCombo.setDisabled(false);
    if (this.selectedParentCode && nodes.some((n) => n.code === this.selectedParentCode)) {
      this.parentCombo.setValue(this.selectedParentCode);
    } else {
      this.selectedParentCode = "";
      this.parentCombo.setValue("");
    }
  }

  private rebuildCandidates(): void {
    this.candidateBox.empty();
    if (this.asRootTopic) {
      this.renderCandidateRadio(this.nextRoot(), "根话题");
      return;
    }
    if (!this.selectedParentCode) {
      this.candidateBox.createDiv({ cls: "zk-show-form-empty", text: "选择上一级笔记后，这里会列出可推断的编码。" });
      return;
    }
    const candidates = this.computeCandidates(this.selectedParentCode);
    if (candidates.length === 0) {
      this.candidateBox.createDiv({ cls: "zk-show-form-empty zk-show-form-warn", text: "无法自动推断下一个编码（可能数字/字母已到上限），请改用手动定义。" });
      return;
    }
    for (const code of candidates) this.renderCandidateRadio(code, this.candidateKind(code));
  }

  private renderCandidateRadio(code: string, tag: string): void {
    const id = `zk-show-form-cand-${code.replace(/[^A-Za-z0-9]/g, "-")}`;
    const row = this.candidateBox.createDiv({ cls: "zk-show-form-candidate" });
    const radio = row.createEl("input", {
      cls: "zk-show-form-radio",
      attr: { type: "radio", name: "zk-show-form-cand", id, value: code },
    });
    const label = row.createEl("label", { cls: "zk-show-form-candidate-label", attr: { for: id } });
    label.createEl("code", { text: code });
    if (tag) {
      const tagEl = label.createEl("span", { cls: "zk-show-form-tag", text: tag });
      if (tag === "继续讨论") tagEl.classList.add("is-cont");
      else if (tag === "题外话") tagEl.classList.add("is-off");
      else if (tag === "根话题") tagEl.classList.add("is-root");
    }
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      this.selectedCandidate = code;
      this.candidateBox.querySelectorAll(".zk-show-form-candidate").forEach((el) => el.classList.remove("is-selected"));
      row.classList.add("is-selected");
    });
    if (this.selectedCandidate === code) {
      radio.checked = true;
      row.classList.add("is-selected");
    }
  }

  private candidateKind(code: string): string {
    const unit = parseZettelkastenNo(code)?.path.slice(-1)[0] ?? "";
    if (isDigitUnit(unit)) return "继续讨论";
    if (isLetterUnit(unit)) return "题外话";
    return "";
  }

  private nextRoot(): string {
    let max = 0;
    for (const n of this.index.allNodes()) {
      if (n.isGhost) continue;
      const p = parseZettelkastenNo(n.code);
      if (!p) continue;
      const d = Number(p.path[0]);
      if (!Number.isNaN(d) && d > max) max = d;
    }
    return String(max + 1);
  }

  private renderActions(form: HTMLElement): void {
    const actions = form.createDiv({ cls: "zk-show-form-actions" });
    const cancel = actions.createEl("button", { cls: "zk-show-form-btn", text: "取消", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", {
      cls: "zk-show-form-btn zk-show-form-btn-primary",
      text: "确定",
      attr: { type: "button" },
    });
    confirm.addEventListener("click", () => this.apply());
  }

  private applyMode(): void {
    if (this.mode === "manual") {
      this.manualSection.classList.remove("is-hidden");
      this.inferSection.classList.add("is-hidden");
    } else {
      this.inferSection.classList.remove("is-hidden");
      this.manualSection.classList.add("is-hidden");
    }
  }

  private resolveCode(): string | null {
    if (this.mode === "manual") {
      return this.validateManual(this.manualInput).code;
    }
    return this.selectedCandidate || null;
  }

  private validateManual(input: string): { code: string | null; error: string | null } {
    const parsed = parseZettelkastenNo(input);
    if (!parsed) return { code: null, error: "编码不合法（需如 1/4a 或 2）" };
    const units = parsed.path.slice(1);
    if (!units.every((u) => /^[0-9a-zA-Z]$/.test(u) || /^\([1-9][0-9]+\)$/.test(u))) {
      return { code: null, error: "编码不合法（后缀单元需为数字、字母或括号多位，如 1/(10)）" };
    }
    const code = parsed.canonical;
    const activePath = this.app.workspace.getActiveFile()?.path ?? null;
    for (const n of this.index.allNodes()) {
      if (n.isGhost || !n.path) continue;
      if (n.code === code && n.path !== activePath) {
        return { code: null, error: `编码 ${code} 已被笔记「${n.title}」占用` };
      }
    }
    return { code, error: null };
  }

  private refreshManualHint(): void {
    if (!this.manualHint) return;
    this.manualHint.empty();
    const v = this.manualInput.trim();
    if (v === "") {
      this.manualHint.createEl("span", { cls: "zk-show-form-hint-muted", text: "请输入编码，如 1/4a 或 2" });
      return;
    }
    const r = this.validateManual(this.manualInput);
    if (r.error) {
      this.manualHint.createEl("span", { cls: "zk-show-form-hint-warn", text: r.error });
    } else if (r.code) {
      this.manualHint.createEl("span", { cls: "zk-show-form-hint-ok", text: `合法，将写入 ${r.code}` });
    }
  }

  private async apply(): Promise<void> {
    let code: string | null = null;
    let error: string | null = null;
    if (this.mode === "manual") {
      const r = this.validateManual(this.manualInput);
      code = r.code;
      error = r.error;
    } else {
      code = this.selectedCandidate || null;
      if (!code) error = "请先选择一个候选编码";
    }
    if (!code) {
      new Notice(error ?? "请先选择或输入有效的 zettelkastenNo");
      return;
    }
    const active = this.app.workspace.getActiveFile();
    if (!active || !(active instanceof TFile) || active.extension !== "md") {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    try {
      await this.app.fileManager.processFrontMatter(active, (fm) => {
        fm.zettelkastenNo = code;
      });
      new Notice(`已设置 zettelkastenNo = ${code}`);
      this.close();
    } catch (err) {
      new Notice(`写入失败：${(err as Error)?.message ?? err}`);
    }
  }

  private roots(): { root: string; title: string | null }[] {
    const titles = new Map<string, string>();
    const rootSet = new Set<string>();
    for (const n of this.index.allNodes()) {
      if (n.isGhost || !n.path) continue;
      const p = parseZettelkastenNo(n.code);
      if (!p) continue;
      const root = p.path[0];
      rootSet.add(root);
      // 根节点：path 恰为单元素（code === root），其笔记标题即话题根标题
      if (p.path.length === 1 && n.title && !titles.has(root)) {
        titles.set(root, n.title);
      }
    }
    return [...rootSet]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((root) => ({ root, title: titles.get(root) ?? null }));
  }

  private parentCandidates(root: string): TopicGraphNode[] {
    const out: TopicGraphNode[] = [];
    for (const n of this.index.allNodes()) {
      if (n.isGhost || !n.path) continue;
      const p = parseZettelkastenNo(n.code);
      if (p && p.path[0] === root) out.push(n);
    }
    return out.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  private computeCandidates(parentCode: string): string[] {
    const out: string[] = [];

    const digits = this.index.digitChildren(parentCode);
    let maxDigit = 0;
    for (const n of digits) {
      const d = unitNumber(lastUnit(n.code));
      if (!Number.isNaN(d) && d > maxDigit) maxDigit = d;
    }
    const nextDigit = maxDigit + 1;
    out.push(this.appendUnit(parentCode, formatUnit(String(nextDigit))));

    const letters = this.index.letterChildren(parentCode);
    let maxLetter = "";
    for (const n of letters) {
      const unit = lastUnit(n.code).toLowerCase();
      if (/^[a-z]$/.test(unit) && unit > maxLetter) maxLetter = unit;
    }
    let nextLetter = "";
    if (maxLetter === "") nextLetter = "a";
    else if (maxLetter < "z") nextLetter = String.fromCharCode(maxLetter.charCodeAt(0) + 1);
    if (nextLetter) out.push(this.appendUnit(parentCode, nextLetter));

    return out;
  }

  private appendUnit(parentCode: string, unit: string): string {
    const p = parseZettelkastenNo(parentCode);
    if (!p) return `${parentCode}${formatUnit(unit)}`;
    const newPath = [...p.path, unit];
    return newPath.length <= 1 ? newPath[0] : `${newPath[0]}/${newPath.slice(1).map(formatUnit).join("")}`;
  }
}

interface ComboOption {
  value: string;
  code: string;
  title: string;
}

/**
 * 轻量自定义下拉：input 过滤 + 浮层面板。相比原生 <select>，面板内条目可自动换行，
 * 长标题不会被截断；选中后在输入框显示「code　title」。
 */
class ComboField {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly panel: HTMLElement;
  private options: ComboOption[] = [];
  private selectedValue = "";
  private changeHandler: (value: string) => void = () => {};
  private blurTimer: number | null = null;

  constructor(placeholder: string) {
    this.el = document.createElement("div");
    this.el.className = "zk-show-combo";
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "zk-show-combo-input";
    this.input.placeholder = placeholder;
    this.input.setAttribute("autocomplete", "off");
    this.panel = document.createElement("div");
    this.panel.className = "zk-show-combo-panel";
    this.el.appendChild(this.input);
    this.el.appendChild(this.panel);

    this.input.addEventListener("focus", () => this.open());
    this.input.addEventListener("input", () => {
      this.selectedValue = "";
      this.changeHandler("");
      this.render(this.filter());
      this.panel.classList.add("is-open");
    });
    this.input.addEventListener("blur", () => {
      this.blurTimer = window.setTimeout(() => this.close(), 150);
    });
  }

  setDisabled(disabled: boolean): void {
    this.input.disabled = disabled;
    if (disabled) this.close();
  }

  setOptions(opts: ComboOption[]): void {
    this.options = opts;
  }

  setValue(value: string): void {
    this.selectedValue = value;
    const opt = this.options.find((o) => o.value === value);
    this.input.value = opt ? `${opt.code}　${opt.title}` : "";
  }

  clear(): void {
    this.options = [];
    this.selectedValue = "";
    this.input.value = "";
    this.close();
  }

  onChange(cb: (value: string) => void): void {
    this.changeHandler = cb;
  }

  private open(): void {
    this.render(this.options);
    this.panel.classList.add("is-open");
  }

  private close(): void {
    this.panel.classList.remove("is-open");
    if (this.blurTimer !== null) {
      window.clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
  }

  private filter(): ComboOption[] {
    const q = this.input.value.trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter((o) => `${o.code} ${o.title}`.toLowerCase().includes(q));
  }

  private render(list: ComboOption[]): void {
    this.panel.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "zk-show-combo-empty";
      empty.textContent = "（无匹配项）";
      this.panel.appendChild(empty);
      return;
    }
    for (const o of list) {
      const item = document.createElement("div");
      item.className = "zk-show-combo-item";
      if (o.value === this.selectedValue) item.classList.add("is-selected");
      const code = document.createElement("span");
      code.className = "zk-show-combo-code";
      code.textContent = o.code;
      const title = document.createElement("span");
      title.className = "zk-show-combo-title";
      title.textContent = o.title;
      item.appendChild(code);
      item.appendChild(title);
      item.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        this.select(o);
      });
      this.panel.appendChild(item);
    }
  }

  private select(o: ComboOption): void {
    this.selectedValue = o.value;
    this.input.value = `${o.code}　${o.title}`;
    this.close();
    this.changeHandler(o.value);
  }
}
