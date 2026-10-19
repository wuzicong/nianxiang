# 图库网格 chrome · 半透顶栏 + 选中描边（照片压 chrome）· 终稿

> **状态：终稿** · 2026-10-19（Asia/Shanghai）· didi 指派：stealbook **#2**  
> 对照：`research/canva-awards-stealbook.md` §2.7 / Top 2 · `../specs/library-home-spec.md` §1–4 · `docs/design/library-empty-upload-fail.md`（空/失败已另刀）  
> 表面：`/library` 网格 · sticky 顶栏 · Tabs 条 · 多选 selection chrome  
> 皮肤：工具页固定 `DEFAULT_THEME_ID`（cotton-candy）`--share-*`；海风资产 id = `kyoto-lantern`（本刀不换皮）  
> **禁止**硬编码 `#b91c1c` / `#166534`；W6 **不做** marketing 落地页  
> 动效：仅 CSS `opacity` / `transform`；时长桶 **80 / 120 / 180 / 280ms**；一律挂 `prefers-reduced-motion`

---

## 状态条 · 覆盖表面

| 项 | 约定 |
|---|---|
| 路由 | `/library`（时间 Tab 有图态为主战场） |
| 顶栏 | sticky 主顶栏（品牌 · 隐私徽标 · 上传 · 头像） |
| Tabs | sticky 分面条（`时间 \| 地点 \| 场景 \| 人物`） |
| 网格 | hairline / gapless 缩略墙（无卡片投影） |
| 选中 | 描边 ring + ✓；**不**染色照片 |
| 已有基线 | 半透 sticky **日/月/年头**已在 `library-home-spec`；本刀把同一「照片压 chrome」气质上推到**主顶栏 + Tabs**，并收口多选描边 |

---

## 1. 目标（对齐 steal #2）

| # | Steal 句 | 落到念册 |
|---|---|---|
| A | **照片压过 chrome**（Glass / Canva Glow Up） | 顶栏与 Tabs 半透 + blur；滚动时照片从 chrome 下透出；chrome 字色/对比仍可读 |
| B | **Glass / VSCO：半透顶栏** | 主顶栏、Tabs、日组吸顶头同一材质阶梯（见 §3）；无实底「挡照片」的厚白条 |
| C | **选中 = outline / ring，非色洗**（VSCO） | 替换/收紧现「`3px solid` + 内缩 6%」厚压感；禁半透明品牌色蒙版盖照片 |
| D | **缝感网格** | 保持 mobile 2px / tablet 4px / desktop 6px；缩略无投影、不卡片化 |

---

## 2. Token

| 用途 | 变量 / 写法 |
|---|---|
| 页底 / 正文 | `--share-bg` / `--share-text` |
| 表面 / 描边 | `--share-surface` / `--share-border` |
| 弱说明 / 隐私徽标 | `--share-muted` |
| 焦点环 | `--share-accent`，`outline-offset: 2px` |
| 选中 ring | `var(--share-brand)` 或 `color-mix(in srgb, var(--share-brand) 85%, var(--share-text))`（对比不足时混 text） |
| ✓ 徽章底 | `--share-brand`；勾色 `--share-bg`（保证对比） |
| 半透顶栏底 | `color-mix(in srgb, var(--share-bg) 72%, transparent)`（主顶栏） |
| 半透 Tabs 底 | `color-mix(in srgb, var(--share-bg) 78%, transparent)` |
| 日组吸顶（既有） | `color-mix(in srgb, var(--share-bg) 88%, transparent)` — **保持**，本刀不改配方除非对比不达标 |
| Blur | `backdrop-filter: blur(12px)` 主顶栏 / Tabs；日组头维持 `blur(8px)` |
| 回退 | 不支持 `backdrop-filter` 时：`color-mix(..., 92%, transparent)` 实底兜底，对比 ≥ 4.5:1 |

一律 `--share-*` / `color-mix`；**禁止**写死 `#b91c1c` / `#166534` / 浏览器默认蓝。

---

## 3. 规格

### 3.1 Sticky 顶栏（半透 + blur）

| 项 | 规格 |
|---|---|
| 定位 | `position: sticky; top: 0; z-index: 30`（与 home-spec 一致） |
| 高度 | mobile ≤ 52px；desktop ≤ 56px（不含 safe-area） |
| 背景 | §2 主顶栏 mix（~72% bg）+ `backdrop-filter: blur(12px)`；`-webkit-backdrop-filter` 同值 |
| 底边 | `1px solid var(--share-border)` hairline；**无**厚阴影（阴影仅浮动层：抽屉/弹层） |
| 滚动 | 内容上滚时照片从栏下透出；栏内品牌/按钮不换「实心底皮肤」 |
| 文字/图标 | `--share-text` / muted；隐私徽标静音，不抢上传主 CTA |
| 对比 | 毛玻璃上正文 ≥ 4.5:1；不达标则提高 mix 不透明度或加 1px 实底兜底层 |
| 动效 | 无滚动视差；栏本身不位移。若做「滚后微调不透明度」：仅 opacity，**120ms** ease-out；`prefers-reduced-motion` → 固定不透明配方 |

### 3.2 Tabs 条

| 项 | 规格 |
|---|---|
| 定位 | sticky，`top: 顶栏高`；`z-index: 29` |
| 背景 | §2 Tabs mix（~78% bg）+ `blur(12px)`；底边 1px `--share-border` |
| 活跃指示 | 底边 2px `var(--share-brand)` 或 text 混色短条；**勿**整 Tab 品牌色洗底 |
| 字色 | 默认 `--share-muted`；活跃 `--share-text` |
| 「即将」徽标 | 12px muted（地点/场景/人物）— 与 home-spec 一致 |
| 切换动效 | 内容交叉淡 **180ms**；reduced → 瞬切或 ≤80ms opacity |

### 3.3 选中 ring（替换 / 收紧现 3px solid pressed）

**现状（home-spec §4.1）：** `outline: 3px solid var(--share-brand)` + 内缩 6% + 右上 ✓。  
**本刀收口：**

| 项 | 规格 |
|---|---|
| Ring | **2px** `box-shadow: inset 0 0 0 2px <选中 ring token>` **或** `outline: 2px solid` + `outline-offset: -2px`（内描边，不撑破 gapless 缝） |
| 禁止加厚 | 禁止回到 ≥3px 实线「压框」；禁止外扩 outline 吃掉邻格缝 |
| 内缩 | **取消**默认 6% scale 内缩（会让缝变「卡片感」）。若需按下反馈：仅 **80ms** `scale(0.98)`，松手回 1；reduced → 无 scale |
| 未选中 | **不变暗、不加灰蒙**；多选态仅常显复选框空心 |
| Hover（desktop） | 未选：1px `--share-border` 极淡内线或复选框 opacity 0→1（**120ms**）；**禁止** hover 位移 / 投影抬起 |
| 焦点 | 键盘焦点另走 `--share-accent` 2px + offset 2px，与选中 ring 可叠加但不同色 |

### 3.4 Checkmark（✓）

| 项 | 规格 |
|---|---|
| 位置 | 右上角；距格边 6px（mobile）/ 8px（desktop） |
| 尺寸 | 圆 20px；热区随整格多选逻辑，视觉圆 ≥ 20、点按 ≥ 44 走格子热区 |
| 样式 | 底 `--share-brand`；勾 `--share-bg`；可选 1px `--share-border` 外圈保证亮图上可读 |
| 出现 | 选中：**120ms** opacity + `scale(0.92→1)`；reduced → 仅 opacity **80ms** |
| 空心复选（未选） | 1.5px `--share-border` 圆；半透明白/`--share-bg` 底 40% mix，保证深色照片上可见；**无**品牌色填充 |

### 3.5 禁止：品牌色洗照片

| 禁止 | 说明 |
|---|---|
| 半透明品牌蒙版 | 如 `background: color-mix(... brand 30%)` 盖在 `<img>` 上 |
| 选中整格填色 | 选中态不得把缩略染成粉/绿/品牌色 |
| 外发光大阴影 | 选中勿 `box-shadow` 大 blur 品牌光晕 |
| 硬编码红/绿 | `#b91c1c` / `#166534` 及等价 rgb |

**唯一允许的选中色：** ring 线 + ✓ 徽章（点缀，非洗底）。

### 3.6 网格：hairline / gapless

| 断点 | 列 | gap | 缩略 |
|---|---|---|---|
| 375（&lt;768） | 3 | **2px** | 方裁 `cover`；无圆角或 ≤2px（全页统一） |
| 768–1279 | 5 | **4px** | 同上 |
| ≥1280 | 7（宽屏可 8–9） | **6px** | hover **禁止** 1.04 放大位移感；若保留轻微反馈 → **仅** opacity/brightness 120ms，或取消放大（推荐取消，对齐 VSCO / Linear「hover 不位移」） |

- 缩略：**无** `box-shadow`；占位 `--share-border` 或 blurhash  
- 日组间距 &gt; 组内 gap（呼吸留给时间轴，不留给卡片描边）  
- 虚拟滚动逻辑 **本刀不改**（见 §5）

### 3.7 本刀动效桶（对齐全局；若与 #42 冲突见文末）

| 交互 | 桶 | 属性 |
|---|---|---|
| 复选框 / ✓ 显隐 | 120ms（reduced 80） | opacity ± 轻微 scale |
| 选中 ring 切换 | 80–120ms | opacity / box-shadow |
| 按下反馈 | 80ms | scale(0.98) 可选 |
| Tab 内容切换 | 180ms | opacity 交叉淡 |
| 顶栏透明度微调（若做） | 120ms | opacity only |
| 抽屉等（非本刀） | 280ms | 前端既有 |

仅 `opacity` / `transform`；禁 width/height/top 动画；禁网格视差。

---

## 4. 验收清单（375 / 768）

- [ ] **375 & 768**：有图时间轴上滚，主顶栏 + Tabs 半透，照片从 chrome 下透出；栏内字/图标对比 ≥ 4.5:1  
- [ ] 顶栏 / Tabs **无**厚实白底、**无**大阴影；底边仅为 hairline `--share-border`  
- [ ] 多选：选中格为 **≤2px 内描边 ring** + 右上 ✓；**无**品牌色蒙版洗图；未选格不变暗  
- [ ] 取消默认「3px solid + 内缩 6%」厚压感（或等价视觉）；邻格缝不被 outline 外扩吃掉  
- [ ] 网格 gap 仍为 2 / 4 / 6；缩略无投影、不卡片化  
- [ ] 色值全部 `--share-*` / `color-mix`；源码与计算样式无 `#b91c1c` / `#166534`  
- [ ] `prefers-reduced-motion: reduce`：无 scale 弹簧；仅短 opacity（≤120ms，优先 80）  
- [ ] 键盘焦点 accent 环与选中 ring 可区分；读屏 `aria-selected` 仍正确（行为不改，只改皮）

---

## 5. 非本次（Out of scope）

| 排除 | 归属 |
|---|---|
| 相册预览 zoom / 侧栏 push | `album-preview` 另刀 |
| 分享解锁序章 / 成功态动效 | frontend 另跟 share motion；本刀不改 `/s/...` |
| 虚拟滚动窗口化 / 数据索引 | 工程已定，本刀只视觉 |
| 空库 / 上传失败文案与插画 | 已终稿：`docs/design/library-empty-upload-fail.md` |
| 选择栏信息架构 / 建册 Step | home-spec §4–5；本刀不改文案与流程 |
| marketing-shell | W6 不做 |
| 三主题纹理差异化（棉花糖噪点 / 海风纸纹 / 传家金线） | steal #5，下下刀 |
| WebGL / Lottie 选中特效 | MVP 禁 |

---

## 6. 前端交接

1. **改皮不改行为**：长按进多选、Shift 范围选、选择栏文案/建册流保持 home-spec；本刀只动 CSS token 与选中视觉。  
2. **优先选择器**：主顶栏、`.lib-tabs`（或等价）、选中格（`[aria-selected="true"]` / `.is-selected`）、✓ 徽章；日组 sticky 头配方可保留 88% + blur(8)。  
3. **Ring 实现建议**：`box-shadow: inset 0 0 0 2px …` 优于外扩 `outline`，避免打穿 gapless。  
4. **Hover 放大**：home-spec §2.3 desktop「1.04」与本刀「hover 不位移」冲突时，**以本刀为准**（取消 scale，或仅 brightness）。  
5. **动效与 #42**：本刀时长已落在 80/120/180/280。若 `#42`（微交互时长桶）把全局 token 化，请把本刀类名挂到同一 bucket 变量；**勿**再引入 160 / 220 / 240ms（home-spec §9 旧值）于网格 chrome。  
6. **主题**：工具页继续 cotton-candy `--share-*`；勿按相册 `kyoto-lantern` / heirloom 换顶栏皮。  
7. **无 PR 义务**：本文件为设计终稿；挂 PR / 改 `apps/web` 由前端排期（parent 稍后挂）。

---

## 7. 与 #42 motion 的冲突备忘

| 来源 | 旧值 | 本刀 / #42 桶 | 处理 |
|---|---|---|---|
| home-spec §9 选中切换 | 160ms + spring | **120ms** opacity/transform；禁 spring（或仅 cotton 且 reduced 关掉） | 网格选中跟本刀 |
| home-spec §9 选择栏进出 | 220 / 180 | 进 **180** / 出 **180**（或进 280 若需更沉） | 选择栏若同 PR 改，对齐桶；非本刀必改 |
| home-spec §9 上传格插入 | 240ms | **180** 或 **280** | 非本刀；#42 收口时一并 snap |
| home-spec §2.3 hover 1.04 | transform scale | **取消**或仅非位移反馈 | **本刀覆盖** |

结论：本刀与时长桶方向一致；实施时以 **#42 桶变量** 为准，删掉网格路径上的 160/220/240 散值。

---

*文件：`/workspace/design-memora/specs/library-grid-chrome.md`*
