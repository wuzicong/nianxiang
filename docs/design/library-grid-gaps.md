# 图库网格缝隙气质 · gapless / hairline · 禁投影墙 · 终稿

> **状态：终稿** · 2026-10-19（Asia/Shanghai）· didi 指派：stealbook **#9**「网格密度与缝」  
> 对照：`research/canva-awards-stealbook.md` §2.7 Gapless / Top **#9** · §2.4 Shadow only on floating · `library-home-spec.md` §2.3 · `library-grid-chrome.md` §3.6（chrome 刀已点缝，本刀收口气质与禁区）  
> 表面：`/library` 时间轴缩略网格（有图态）  
> 皮肤：工具页固定 `DEFAULT_THEME_ID`（cotton-candy）`--share-*`；本刀不换皮  
> **禁止**硬编码 `#b91c1c` / `#166534`；W6 **不做** marketing 落地页  
> 动效：仅 CSS `opacity` / `transform`；时长桶 **80 / 120 / 180 / 280ms**；一律挂 `prefers-reduced-motion`  
> 前端并行：上传抽屉可收工作台 + **阴影只给浮动层**（steal #4）— 与本刀「网格卡不漂」同轴，本刀不拥有抽屉实现

---

## 状态条 · 覆盖表面

| 项 | 约定 |
|---|---|
| 路由 | `/library` 时间 Tab **有图网格** |
| 气质目标 | **缝感墙**（VSCO Studio / Frame.io density）：照片满密度，缝是底色，不是卡片边距 |
| 已有基线 | home-spec / grid-chrome：列 3/5/7 · gap **2 / 4 / 6** · 缩略无投影 |
| 本刀增量 | 把「禁投影墙 / 禁卡片化」写成可验收禁区；锁定组间呼吸；明确 hairline ≠ 0 缝、≠ 卡片 gutter |
| 非本刀 | 选中 ring / 半透顶栏 → `#47` / `library-grid-chrome`；虚拟滚动 → 工程；空库 → empty 刀；上传抽屉阴影 → 前端本轮 |

---

## 1. 目标（对齐 steal #9）

| # | Steal 句 | 落到念册 |
|---|---|---|
| A | **Gapless / hairline grid** | 保持 2/4/6px 缝；缝露 `--share-bg`，不垫表面色「框」 |
| B | **禁卡片投影墙** | 缩略、日组卡、网格容器：**零**外投影 / 零抬起 hover |
| C | **密度 = 专业感** | 宁密勿疏；组内紧、组间疏（呼吸留给时间轴） |
| D | **阴影只浮动层**（steal #4 同轴） | 抽屉 / dialog / toast / popover 才可中性阴影；网格永不漂 |

---

## 2. Token

| 用途 | 变量 / 写法 |
|---|---|
| 页底（缝的颜色） | `--share-bg` — **缝即露底**，勿用 `--share-surface` 填缝 |
| 占位 / 未加载格 | `--share-border` 或 blurhash；可极淡 `color-mix(in srgb, var(--share-border) 40%, transparent)` 内线，**非**卡片描边 |
| 组间分隔 | 垂直间距 token 见 §3.2；日头底边可选 1px `--share-border` hairline |
| 浮动层阴影（对照，非网格） | 中性多层，例：`0 8px 24px color-mix(in srgb, var(--share-text) 12%, transparent)` — **仅** drawer/dialog/toast |

一律 `--share-*` / `color-mix`；**禁止**写死 `#b91c1c` / `#166534` / 浏览器默认蓝。

---

## 3. 规格

### 3.1 组内缝（gapless / hairline）

| 断点 | 列 | **gap（强制）** | 缩略 |
|---|---|---|---|
| 375（&lt;768） | 3 | **2px** | 方裁 `cover`；圆角 **0** 或全页统一 **≤2px**（不得混用 8/12/16 卡片圆角） |
| 768–1279 | 5 | **4px** | 同上 |
| ≥1280 | 7（宽屏可 8–9） | **6px** | 同上 |

**硬规则：**

1. `gap` 只能是上表三值；禁止把 gap 调到 ≥8px「舒服卡片距」或 0「真无缝死贴」（0 会糊成一条，丢失 hairline 节奏）。  
2. 缝的颜色 = 父级 `--share-bg`。禁止在格子外包一层带 `padding` + `background: surface` 的「卡槽」。  
3. 格子之间 **不**再叠加 `margin`（避免 gap+margin 双距 → 卡片墙）。  
4. 选中 ring 必须 **内描边**（`inset box-shadow` 或 `outline-offset: -2px`），**不得**外扩吃缝（与 chrome 刀一致）。

### 3.2 组间呼吸（日 / 月块）

| 项 | 规格 |
|---|---|
| 原则 | **日组间距 &gt; 组内 gap**（杂志疏密：组内密、组间疏） |
| mobile | 日组与下一日组之间 ≥ **16px**（推荐 16–20；不得 ≤ 组内 2px） |
| tablet | ≥ **20px** |
| desktop | ≥ **24px** |
| 日头 | sticky 半透头已有；头与其下第一行缩略间距 ≤ **8px**（头贴墙，勿头下大白） |
| 禁止 | 用「每张卡下方 12px margin」冒充分组；分组只靠日头 + 组块间距 |

### 3.3 禁投影墙（核心验收）

| 禁止 | 说明 |
|---|---|
| 缩略 `box-shadow` 外投影 | 任何 blur/y-offset 外阴影 |
| hover / press **抬起** | `translateY(-n)`、放大位移、阴影加深「浮起来」 |
| 卡片化边框 | 每格 1px 实线围成独立卡（缝变成 gutter）；允许的只有选中 **内** ring 与极淡占位 |
| 大圆角网格 | `border-radius ≥ 8px` 的缩略（像网盘/相册卡墙） |
| 格子白底垫高 | 图未盖满时露出大块 surface「相纸卡」；未加载用 border/blurhash，勿厚垫 |
| 网格容器投影 | 整墙再套一层 elevation |

**允许（非墙）：**

- 选中 ≤2px **inset** ring + ✓（chrome 刀）  
- 浮动层：上传抽屉、灯箱 dialog、toast、菜单 — 中性阴影 OK  
- sticky chrome hairline 底边（1px border，**无**阴影）— chrome 刀  

### 3.4 Hover / 焦点（桌面）

| 态 | 规格 |
|---|---|
| Hover 未选 | **禁止** scale / 位移 / 投影。可选：brightness ±4% **或** 复选框 opacity 0→1，**120ms** |
| Hover 与 home-spec §2.3「1.04」 | **以本刀 + chrome 为准：取消 1.04** |
| 焦点 | `--share-accent` 2px + offset 2px；可与选中 ring 叠色，不外扩破缝 |
| reduced-motion | 无 brightness 动画亦可；仅瞬时态 |

### 3.5 与上传抽屉阴影的分工

| 表面 | 阴影 |
|---|---|
| 网格缩略 / 日组 / Tabs 下内容墙 | **无** |
| 上传抽屉、失败行所在浮动工作台、dialog | **有**（前端本轮 steal #4/#5 笔记落实） |
| 选择栏（底栏） | 可用极轻顶边 hairline 或极弱上投影 **一条**；勿整栏厚 elevation 墙 |

---

## 4. 验收清单（375 / 768 / 1280）

- [ ] 组内 gap 实测为 **2 / 4 / 6**（对应断点）；缝色为页底 `--share-bg`  
- [ ] 缩略计算样式：**无** `box-shadow` 外投影；**无** hover `translateY` / `scale(1.0x)` 抬起  
- [ ] 缩略圆角 0 或全页统一 ≤2px；无 8px+ 卡片圆角混用  
- [ ] 日组间距明显大于组内缝（mobile ≥16）；非「每卡 margin」假分组  
- [ ] 选中 ring 不外扩吃邻缝；多选墙仍读作缝感网格而非卡墙  
- [ ] 上传抽屉打开时，抽屉可有阴影，**背后网格仍无投影**  
- [ ] 色值全部 `--share-*` / `color-mix`；无 `#b91c1c` / `#166534`  
- [ ] `prefers-reduced-motion: reduce`：无位移/scale hover  

---

## 5. 非本次（Out of scope）

| 排除 | 归属 |
|---|---|
| 半透顶栏 / Tabs / 选中 ring 细则 | `library-grid-chrome.md`（已合 #47） |
| 上传抽屉 IA / 失败行重试移除 | 前端本轮（didi 笔记第 5 条） |
| 虚拟滚动窗口化 | 工程 |
| 空库 / 失败插画 | `library-empty-upload-fail.md` |
| 三主题纹理 | `theme-textures.md`（#51） |
| album-preview 组间呼吸 | 已另刀 #50 |
| 用户可调卡片密度（Frame.io Card Size） | 未来设置；MVP 断点列数即可 |
| marketing-shell / WebGL | W6 禁 |

---

## 6. 前端交接

1. **改皮不改行为**：多选、虚拟滚动、日组数据结构不动；只收 gap / 阴影 / 圆角 / hover。  
2. **优先审计选择器**：网格容器 `gap`、缩略 `.thumb` / `figure` / `img` 包装、日组 wrapper margin、任何 `shadow-*` / `drop-shadow` utility。  
3. **冲突裁决**：home-spec「desktop hover 1.04」→ **删**；chrome §3.6 与本刀一致，本刀是缝/投影的验收真源。  
4. **阴影审计一句**：`apps/web` 里库页路径，缩略与网格节点不得出现外投影；浮动层类名集中（drawer/dialog）才允许。  
5. **本地合入**：Actions 额度恢复前，本地 `typecheck` / `build`（自托管 compose）过即可开 PR / squash。  
6. **主题**：工具库页不换 `kyoto-lantern` / heirloom 皮。  

---

## 7. 与既有刀的关系

| 文档 / PR | 关系 |
|---|---|
| `library-home-spec` §2.3 | 列/gap 数字同源；本刀覆盖 hover 1.04 与「禁卡墙」 |
| `library-grid-chrome` §3.6 | chrome 已写 gap 表；本刀展开禁区 + 组间 + 阴影分工 |
| #47 网格 chrome 实现 | 若实现已无投影且 gap 正确，本刀 PR 可能是 **审计删余阴影 / 圆角 / hover** 的小 diff |
| 前端上传抽屉刀 | 阴影只给浮动层 — 联调验收用本刀 §3.5 / §4 |

---

*文件：`/workspace/design-memora/specs/library-grid-gaps.md`*
