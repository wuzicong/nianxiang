# 三主题纹理差异化 · 噪点 / 纸纹 / 金线薄规 · 终稿

> **状态：终稿** · 2026-10-19（Asia/Shanghai）· didi 指派：stealbook **#5**「主题纹理差异化」  
> 对照：`docs/design/research/canva-awards-stealbook.md` §2.3 Texture Check / Top **#5** · `docs/design/materials/THEME-ASSET-NAMING.md` · `docs/design/materials/NOTES-motion-media.md` · `docs/design/materials/catalog.md` mat-fx-001/002 · `docs/design/moodboard/product-ui-v2.md` B6 · `library-empty-upload-fail.md` · `share-unlock-mobile-spec.md` §6 · `specs/decor/`  
> 表面：**分享解锁挑战态（locked）** + **图库空库 decor**  
> 主题 id（路径）：`cotton-candy` · **`kyoto-lantern`**（对外文案「海风」）· `heirloom`（仓库资产树可见 `magazine-heirloom`，以 `THEME_IDS` 为准）  
> **禁止**硬编码 `#b91c1c` / `#166534`；色与材质一律 `--share-*` / `color-mix`  
> W6：**不做** marketing 落地页；动效仅 CSS `opacity` / `transform`；时长桶 **80 / 120 / 180 / 280ms**；WebGL **仅参考不入船**  
> 前端另刀：album-preview steal **#8**（组间呼吸 + zoom-to-fill）— **本刀不拥有**

---

## 状态条 · 覆盖表面

| 项 | 约定 |
|---|---|
| 主战场 A | `/s/[token]` **locked** 挑战态（`ShareUnlock` / `.share-shell[data-theme]`）— 三主题纹理必须可感知差异 |
| 主战场 B | `/library` 时间 Tab **空库**（`.lib-empty.lib-empty-library`）— 工具皮固定 `DEFAULT_THEME_ID` = `cotton-candy`，落地 **棉花糖噪点 + soft-blob** 配方 |
| 主题解析（unlock） | 既有：`401.themeId` → `?t=` → `cotton-candy`；失败态**不换皮**（安全） |
| 工具页主题 | 空库 / 网格 chrome **不**按相册换皮；本刀空库只上棉花糖纹理 |
| 已有基线 | unlock：cotton `soft-blob`、kyoto 顶部径向光 / `washi-edge`、magazine 顶 3px 金线（`share-unlock-mobile-spec` §2.1 / §6）— 本刀**收口参数 + 补全可感知纹理层**，不推翻交互/安全文案 |
| 装饰资产 | `specs/decor/`（`--share-*`）· `theme-pack-pr/*/assets/`（部分仍硬编码 hex，落地时改 `var(--share-*)`） |

---

## 1. 目标（对齐 steal #5）

| # | Steal 句 | 落到念册 |
|---|---|---|
| A | **Texture Check**：可触感纸 / 噪点 / 薄规 | 三主题一眼可辨「物」的温度，不靠换文案 |
| B | 棉花糖 = soft noise / grain + soft-blob | 空库底 + unlock cotton shell 轻噪 + blob 氛围 |
| C | 海风 = paper / washi 纸纹（id=`kyoto-lantern`） | unlock kyoto：纸纹叠层 + 既有 washi-edge；**勿**写路径 `sea-breeze` |
| D | 传家 = 金线薄规 thin gold rules | unlock heirloom：顶/卡缘 0.5–1px 金线 + 可选中缝细规；禁粗金条抢 CTA |
| E | 不动逻辑 | **不改** API、IA、网格 chrome、解锁文案/限流/安全；只改 decor / CSS 叠层 |

---

## 2. Token（材质层）

| 用途 | 变量 / 写法 |
|---|---|
| 页底 / 正文 / 弱字 | `--share-bg` / `--share-text` / `--share-muted` |
| 表面 / 描边 | `--share-surface` / `--share-border` |
| 品牌点缀 / 金线色 | `--share-brand` · `--share-accent`（heirloom 金走 accent；**禁止**写死 `#C2A878`） |
| 次色（blob 内层） | `--share-secondary` |
| 噪点墨色 | `color-mix(in srgb, var(--share-text) 100%, transparent)` 再整体降 opacity（见 §3） |
| 纸纹墨色（kyoto） | `color-mix(in srgb, var(--share-border) 70%, var(--share-secondary))` 或 `--share-secondary` 低透 |
| 金线 | `color-mix(in srgb, var(--share-accent) 85%, var(--share-text))`（对比不足时提高 text 混比） |
| 焦点 | `--share-accent`，`outline-offset: 2px`（本刀不改焦点行为） |

一律 `--share-*` / `color-mix`；**禁止** `#b91c1c` / `#166534` / 浏览器默认蓝 / 主题包遗留硬编码金 `#C2A878` 进新叠层（旧 SVG 落地时一并迁 var）。

---

## 3. 三主题配方（可实施参数）

> 实现优先级：**① 静态 SVG / CSS overlay** → ② Paper Shaders（Apache-2.0，`catalog` mat-fx-001/002）`speed=0` 或 `≤0.4` → ③ **不**要求 Lottie；**不**船 WebGL。

### 3.1 `cotton-candy` · 棉花糖 — soft noise / grain + soft-blob

| 层 | 规格 |
|---|---|
| **A · soft-blob** | 既有 `specs/decor/soft-blob.svg`（内联，吃 `--share-brand` / `--share-secondary`）；unlock：右上裁出屏（对齐 unlock-spec）；空库：`.lib-empty-art` 底层 `lib-decor-bg`，宽 **≤ 12rem**（空库终稿已定） |
| **B · grain / noise 叠层** | 全屏或卡片**背后**一层 `pointer-events: none; aria-hidden`；**勿**盖在标题/输入/按钮文字上（可用 `isolation` + 卡片实底隔开） |
| 静态实现（首选） | CSS：`background-image` 用极小 tile SVG feTurbulence **或** 1×1 噪点 data-URI 重复；`background-size: 120px 120px`（空库）/ `160px 160px`（unlock shell）；**opacity 空库 `0.14–0.20`** · unlock shell（卡片外）**`0.08–0.14`** · 卡片内 **不加** grain（保表单对比） |
| Paper Shaders 备选 | Grain Gradient：`shape="blob"` · `noise: 0.22–0.32` · `softness: 0.55–0.65` · **`speed: 0`（默认）或 ≤0.4`**；色取自 `--share-*` 映射，**禁**演示高饱和；包装容器 `opacity: 0.35–0.50` 再叠，避免糊字 |
| theme.json 提示 | 既有 `tokens.noise: 0.04` 作「产品气质」参考；**落地以本表 opacity 为准**（json 值过低不可见） |
| 微动（可选） | blob 呼吸：`opacity` 在基线 ±0.04 内循环 **4–6s** linear；或 grain `speed≤0.4`。桶外循环可，但 **reduced → 静态**（见 §5） |
| 禁止 | 半屏吉祥物、假缩略墙、高饱和 shader 演示色、grain 盖在 `.share-title` / input 文字上 |

### 3.2 `kyoto-lantern` · 海风 — paper / washi 纸纹

| 层 | 规格 |
|---|---|
| **id** | 路径 / `data-theme` / `THEME_IDS` = **`kyoto-lantern`**；UI 文案可写「海风」。**禁止**新建 `sea-breeze` 资产路径 |
| **A · washi-edge / 顶缘** | 既有主题装饰 `washi-edge`（及 unlock 顶部径向光）**保留**；≤640 继续隐藏 lantern/ticket/stamp（unlock-spec） |
| **B · 纸纹叠层** | `.share-shell` 背景之上、卡片之下：静态 **paper-texture** 叠层 |
| 静态实现（首选） | SVG feTurbulence `type="fractalNoise"` baseFrequency `0.65–0.9` · 低 octaves（2–3）· 单色填 `--share-secondary` / border mix；整层 **opacity `0.16–0.26`**（深底 `#1A1A1A` 气质下纸感可见但不脏）；卡片（`.share-card` 或等价）保持实底 `--share-surface`，**纸纹不穿透输入区** |
| Paper Shaders 备选 | `paper-texture`（mat-fx-002）：**静态优先** `speed=0`；容器 opacity `0.20–0.30`；pin 与 Grain 同库版本 |
| 撕边点缀（可选） | `torn-edge.svg` 仅卡片顶或底 **一条**，高 ≤ 12px，`opacity 0.5–0.7`；移动端解锁**不加**第二装饰物种（避免挤拇指区） |
| 禁止 | 亮色「日系插画」大图、高对比水印字、把 secondary 提到可读正文级（会脏） |

### 3.3 `heirloom` / `magazine-heirloom` · 传家 — 金线薄规

| 层 | 规格 |
|---|---|
| **id** | 产品名「传家」；资产树常见 **`magazine-heirloom`**；运行时 id 以仓库 `THEME_IDS` / `isThemeId` 为准（文档交叉写 `heirloom` ≈ `magazine-heirloom`） |
| **A · 顶金线** | 既有「顶部 3px 金线」**收口为薄规**：视觉厚度 **1px**（retina 可用 `0.5px` / `1px` hairline）；色 `color-mix(in srgb, var(--share-accent) 85%, var(--share-text))`；整线 **opacity `0.70–0.90`**；宽 = 卡片内容宽或 shell 顶边满宽（与现布局择一，全主题一致即可） |
| **B · 薄规 thin-rule** | 标题区与表单之间 **一条** `thin-rule`：高 **1px**、左右缩进 0–8px、opacity `0.45–0.65`；资产改写 `theme-pack-pr/.../thin-rule.svg` / `gold-accent-line.svg` → **stroke/fill 用 `var(--share-accent)`**，删 `#C2A878` |
| **C · 直角编辑感** | 保持 radius 2–8px、黑边、**无** soft-blob / washi-tape（违背 stickerTiltDeg=`[0]`）；**不加** grain 满屏（传家靠线，不靠噪） |
| 静态实现 | 纯 CSS `border-top` / `linear-gradient` 1px 或内联 SVG rule；**不**上 Paper Shaders（非本主题气质） |
| 禁止 | ≥3px 粗金条、金色大阴影、满屏金箔贴图、sparkle 满天（sparkle 仅成功闪一下且非本刀必做） |

---

## 4. 落位图（Where）

### 4.1 分享解锁 locked（三主题）

```
.share-shell[data-theme="…"]          z 结构示意
  ├─ [texture-layer]  grain | paper | (heirloom 无满屏纹)
  │     position:absolute; inset:0; pointer-events:none; aria-hidden
  ├─ [blob / radial / top-gold]        主题既有氛围（参数见 §3）
  └─ [card] 实底 --share-surface       标题 / 表单 / CTA / note
        └─ heirloom: thin-rule 在标题↔表单之间
```

| 主题 | texture-layer | 额外 chrome |
|---|---|---|
| cotton-candy | soft grain §3.1 | soft-blob 右上；washi-tape + heart 角标（既有） |
| kyoto-lantern | paper §3.2 | washi-edge + 顶径向光（既有）；≤640 无 stamp/lantern/ticket |
| heirloom | **无**满屏纹 | 顶 1px 金线 + 卡内 1px thin-rule |

**失败 / 429 / 网络错：** 纹理与挑战态**完全同一套**（不换皮、不加强「警报纹」）。

### 4.2 图库空库（仅棉花糖）

| 项 | 规格 |
|---|---|
| 容器 | `.lib-empty.lib-empty-library`（文案/CTA 已终稿，本刀**不改字**） |
| 插画 | soft-blob 底 + envelope 前景；max 宽 12rem；`aria-hidden` |
| 新增 | 卡片**外**或空态区背景轻 grain（§3.1 空库 opacity）；**不**盖 CTA 字 |
| kyoto / heirloom | **本刀不上**空库（工具皮固定 cotton）；配方留给 unlock；若日后空库演示「主题样张」壳，复用 §3.2/§3.3 同一 token |

### 4.3 明确不改

| 不改 | 说明 |
|---|---|
| API / unlock 安全文案 | `FAILED`、限流、存在性、storage 规则 |
| IA / 路由 | `/library` Tabs、建册流、分享创建流 |
| 网格 chrome | 半透顶栏 / 选中 ring — 已终稿 `library-grid-chrome.md` |
| 空库文案与主 CTA | `library-empty-upload-fail.md` |
| album-preview 呼吸 / zoom | steal **#8**，前端另跟 |

---

## 5. 动效桶与 `prefers-reduced-motion`

| 交互 | 桶 | 属性 |
|---|---|---|
| 纹理层入场（若做） | **180ms** | opacity 0→目标 |
| blob / 角标入场 | **180ms**（cotton spring 若保留，reduced 关掉） | opacity + translateY(8px)→0 |
| 可选 grain 慢循环 | 非桶；`speed≤0.4` 或 CSS 4–6s opacity 呼吸 ±0.04 | 仅 opacity |
| 解锁成功序章 | **非本刀**（前端 share motion）；本刀不规定成功态新纹理 |
| 错误抖动等 | 沿用 unlock-spec（240ms；本刀不改） | — |

**`prefers-reduced-motion: reduce`：**

- Paper Shaders → **`speed=0`** 或卸下 canvas，改静态 SVG/CSS  
- 取消 blob 呼吸 / grain 循环  
- 入场仅 **≤80ms** opacity（或瞬切）  
- 禁 WebGL / 禁为纹理引入 Lottie

---

## 6. 对比度与无障碍

| 规则 | 数值 |
|---|---|
| 正文 / 标题 / 按钮字 | 相对其**直接背景**（卡片 surface）≥ **4.5:1**；纹理不得降低该对比 |
| 隔开策略 | 纹理只在 shell / 空态卡外；卡片用实底或 `color-mix(var(--share-surface) 92%, transparent)` ≥ 可读 |
| 调参方向 | 字被糊 → **先降** texture opacity（棉 ≤0.14；纸 ≤0.18），**再**考虑提 surface 不透明 |
| 装饰 | 全部 `aria-hidden="true"` / `pointer-events: none`；不进 Tab 序 |
| 读屏 | 不新增「纹理」话术；状态文案仍走既有 `role="status"` |

---

## 7. 实现偏好（给前端）

1. **先静态**：SVG feTurbulence tile / CSS 噪点 / 1px border 金线 — 零依赖、CPU MVP。  
2. **Paper Shaders**（Apache-2.0）允许：`@paper-design/shaders` pin 版本；Grain → cotton；Paper Texture → kyoto；**heirloom 不用**。默认 `speed=0`；若开微动 ≤0.4 + reduced 静态。  
3. **不**要求 Lottie；NOTES 中 Lottie 纹理条目保持候选，非本刀验收项。  
4. **不**船 WebGL；Awwwards / shader 演示页仅 moodboard 参考。  
5. 内联 SVG 必须在 `.share-shell`（或同样注入 `shareThemeStyle` 的空库壳）内，才能吃 `--share-*`；禁止 `<img src>` 引可变色 SVG。  
6. 迁 `gold-accent-line.svg` / `thin-rule.svg` 硬编码色 → `var(--share-accent, currentColor)`。  
7. 本文件为设计终稿；**无 PR 义务**（parent 稍后挂 docs）。

---

## 8. 验收清单（375 / 768）

### 解锁 locked · 三主题各一链（或 `?t=`）

- [ ] **375 & 768 × cotton-candy**：shell 可见轻 grain；soft-blob 在；卡片内标题/输入/「打开」对比 ≥ 4.5:1；grain **不**压字  
- [ ] **375 & 768 × kyoto-lantern**：纸纹可见；深底气质保留；`data-theme` / 资源路径为 **kyoto-lantern**（无 sea-breeze 路径）；表单区无纸纹穿透糊字  
- [ ] **375 & 768 × heirloom/magazine-heirloom**：顶金线 ≈ **1px** 薄规 + 卡内 thin-rule；无 soft-blob/washi；无满屏噪点；金色来自 `--share-accent` mix，源码无新增 `#C2A878` / `#b91c1c` / `#166534`  
- [ ] 失败态 / 429：纹理与初始 locked **一致**（不换皮）  
- [ ] `prefers-reduced-motion: reduce`：无 shader 动画、无 blob 呼吸；静态纹仍在  

### 空库 · cotton-candy

- [ ] **375 & 768**：soft-blob + envelope 仍轻叠（≤12rem）；可感知轻 grain；主 CTA「上传第一批照片」对比达标；文案未改  
- [ ] 无假网格、无系统 empty icon、无半屏装饰  

### 全局

- [ ] 动效仅 opacity/transform；入场落在 80/120/180/280  
- [ ] 无 WebGL 运行时依赖；无本刀强制 Lottie  
- [ ] 网格顶栏 / 选中 ring / 虚拟滚动行为未因本刀回归  

---

## 9. 非本次（Out of scope）

| 排除 | 归属 |
|---|---|
| 相册预览组间呼吸 + zoom-to-fill | steal **#8**，**前端另刀**；本刀可在 moodboard 注明 OOS |
| 虚拟滚动窗口化 | 工程已定 |
| Immich 空态 / 人脸 / CLIP | 后置；Immich 仅反例 |
| marketing-shell | W6 不做 |
| 分享解锁成功序章 / sparkle 成功闪 | 前端 share motion；非纹理差异化必验 |
| 网格 chrome 半透 / ring | 已终稿 `library-grid-chrome.md` |
| 空库文案、上传失败 | 已终稿 `library-empty-upload-fail.md` |
| 换工具页默认主题 / 空库三皮肤 | 未拍板；本刀空库只棉 |
| 商用库存 paper/grain loop 下载 | NOTES 采购门禁未过，不落 `materials/` 二进制 |

---

## 10. 前端交接摘要

1. 叠一层 `theme-texture`（名自定）：cotton=grain · kyoto=paper · heirloom=无满屏（只金线）。  
2. 参数用 §3 区间；验收对比不够时按 §6 **降 opacity**。  
3. 主题 id：**kyoto-lantern**；传家对齐仓库 `THEME_IDS`（`magazine-heirloom` ↔ heirloom）。  
4. 与 `#42` 时长桶一致时，入场挂 180；reduced 挂 80。  
5. 金线 SVG 去硬编码；decor 内联吃 `--share-*`。

---

*文件：`/workspace/design-memora/specs/theme-textures.md`*
