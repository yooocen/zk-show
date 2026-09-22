# 括号多位数单元（1/(10) 等）设计文档

- 日期：2026-09-21
- 状态：已确认
- 涉及文件：`src/model-units.ts`、`src/parser.ts`、`src/topic-graph.ts`、`src/zkno-form-modal.ts`、`test/`

## 背景与目标

当前 zkNo 后缀按单字符切分单元，数字仅支持 1-9。数字突破 9 时用括号表示单个单元：

- `1/(10)` → 根 `1`，一个单元 `(10)`（数值 10）
- `1/(11)` → 根 `1`，单元 `(11)`
- `1/1(11)` → 根 `1`，单元 `1`、`(11)`

约束：括号写法是**纯扩展**，无括号的输入仍走原有单字符解析（现有笔记不受影响）。`(`/`)` 成为后缀中的**保留语法**：旧的按字面字符解析含括号的后缀（如 `1/(5)`、`1/a(b)`）现在返回 null。

**根话题不涉及括号**：根是 `/` 前的整串，天然由 `/` 分隔，多位根（如 `10/1` 的根 `10`）直接写数字不加括号。括号仅用于 `/` 之后的后续单元（单元之间无分隔符，多位数字才需要用 `(n)` 表示单个单元）。

## 规则

### 单元判定（`src/model-units.ts`）

- `isDigitUnit(ch)`：`/^[0-9]$/` 或 `/^\([0-9]+\)$/`
- `isLetterUnit(ch)`：不变（单字母）
- 新增 `formatUnit(unit)`：`/^[0-9]{2,}$/` → `(${unit})`，否则原样
- 新增 `unitNumber(unit)`：`(10)` → 10，`9` → 9（`/^\(([0-9]+)\)$/` 取括号内数字，否则 Number(unit)）
- 新增 `lastUnit(code)`：词法取规范码末尾单元——若无 `/`，返回整串（根本身即一个单元）；否则取 `/` 后的末尾段：末尾若以 `)` 结尾，从尾部找匹配 `(` 返回其到末尾；否则返回末尾单字符

### 解析（`src/parser.ts`）

后缀（去掉所有 `/` 后）从左到右分词：
- `(` 开始：找后续最近的 `)`，括号内必须为 **≥2 位且无前导零的数字**（`/^[1-9][0-9]+$/`），否则整段无效返回 null；整个 `(…)` 为一个单元。`(10)` 合法；`(5)`、`(010)`、`(0)` 非法
- 其他字符：单字符为一个单元

`canonicalOf` 对后缀单元逐个 `formatUnit` 再拼接，保证规范码与解析往返一致（`1/(10)` 规范码即 `1/(10)`，不会塌缩成 `1/10`）。

非法输入：`1/(10`、`1/(a)`、`1/()`、`1/(010)`、`1/(5)` → null。

### 建图排序（`src/topic-graph.ts`）

- `canonicalFromPath` 同样用 `formatUnit` 拼接祖先幽灵节点编码
- `compareNodes` 的 continuation 排序：用 `lastUnit(code)` + `unitNumber` 数值比较（`(10)` 在 `9` 之后、`(11)` 之前）

### 表单推断（`src/zkno-form-modal.ts`）

- `candidateKind`：`isDigitUnit`/`isLetterUnit` 判定「继续讨论 / 题外话」
- `computeCandidates` 数字分支：末单元经 `lastUnit`+`unitNumber` 求最大，下一个数字不再有 `<= 9` 上限，`nextDigit` 经 `formatUnit` 输出（≥10 自动带括号）
- `validateManual`：后缀单元允许 `/^[0-9a-zA-Z]$/` 或 `/^\([0-9]+\)$/`
- `appendUnit`：拼接路径时对新增单元 `formatUnit`

## 测试

- `test/parser.test.ts`：`1/(10)`、`1/1(11)`、`1/(10)a` 的 path/canonical/parent；非法括号 → null；多编码 `"1/(10), 2/3"` 切分
- `test/model-units.test.ts`（新增）：isDigitUnit(`(10)`)、formatUnit(`10`→`(10)`)、unitNumber、lastUnit
- `test/topic-graph.test.ts`：`(10)` 为 continuation；`1/9`、`1/(10)`、`1/(11)` 数值排序
- `test/model.test.ts`：`1/(10)` 的 computeView 投影正常（主行链、当前卡）
