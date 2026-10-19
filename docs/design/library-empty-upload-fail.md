# 图库空态 + 上传失败态 · 视觉落地刀

> 面向前端 · 2026-10-19 · 对齐 `shareThemeStyle` 的 `--share-*`  
> 路由：`/library`（`LibraryHome`）+ 上传抽屉内 `UploadPhotos`（`target.kind = "library"`）  
> 原则：图库是工具页，固定 `DEFAULT_THEME_ID`（cotton-candy）皮肤；**禁止**硬编码 `#b91c1c` / `#166534` 等色。  
> 对照：`docs/design` 既有 library-home 规范 §6–§7；本刀只收口**空库**与**上传/衍生失败**两处视觉。

---

## 0. Token 约定（全部走现有变量）

| 用途 | 变量 |
|---|---|
| 页底 / 正文 | `--share-bg` / `--share-text` |
| 卡片面 / 描边 | `--share-surface` / `--share-border` |
| 弱说明 | `--share-muted` |
| 主 CTA 底/字 | `--share-text` / `--share-bg`（与 `.lib-primary` 一致） |
| 次 CTA | 透明底 + `--share-border` 边 + `--share-text`（`.lib-quiet`） |
| 焦点环 | `--share-accent`，`outline-offset: 2px` |
| 失败强调 | `color-mix(in srgb, var(--share-accent) 55%, var(--share-text))`（暖警示，不引入独立 error 色） |
| 成功强调 | `color-mix(in srgb, var(--share-brand) 70%, var(--share-text))` |
| 装饰 SVG | 仅 `--share-*`（见 `docs/design` decor / `library-decor`），内联在 `.share-shell` 内 |

---

## 1. 空库（`photos.length === 0` · 时间 Tab）

**结构（已有 `.lib-empty.lib-empty-library`，按此验收）：**

```
[ soft-blob 底 + envelope 前景叠放 · aria-hidden ]
这里还空着                          ← h2 · --share-font-title
把照片放进来，念册会按时间帮你排好。只有你能看到。
[ 上传第一批照片 ]                  ← 主 CTA · 打开上传抽屉
看看主题样张                        ← 次链 → /preview
```

| 项 | 规格 |
|---|---|
| 卡片 | 已有 `.lib-empty`：surface 混色底 + border + radius-card；`max-width: 40rem`；居中于 main |
| 插画区 | `.lib-empty-art` ≥ 6rem；blob 满宽 max 12rem；envelope 绝对居中叠上；两层 SVG 均 `aria-hidden` |
| 主 CTA | `.lib-primary`；离线 `disabled` |
| 次链 | 勿裸浏览器蓝：`color: var(--share-muted)`；hover/focus 用 `--share-text`；建议改成 `.lib-quiet` 或 `.lib-link` 明确 class |
| 焦点 | 进入空库时焦点可留在「上传」；从样张返回不强制 |

**不做：** 假数据缩略图、三主题色切换、大插画以外的装饰动画。

---

## 2. 列表加载失败（`phase === "error"`）

| 项 | 规格 |
|---|---|
| 容器 | 复用 `.lib-empty`（无插画即可） |
| 标题 | 现有 `error` 文案（「照片暂时没加载出来」/ 网络断） |
| 操作 | 唯一主按钮「重试」→ `load("initial")` |
| 禁止 | 错误码、堆栈、英文 exception |

---

## 3. 上传失败态（抽屉内 `UploadPhotos`）

### 3.1 汇总条 `.album-upload-summary`

| `data-kind` | 色 | 文案（已有逻辑，只改色） |
|---|---|---|
| `hint` | `--share-muted` | （空或提示） |
| `success` | §0 成功强调 | 「N 张照片已加入图库。」等 |
| `error` | §0 失败强调 | 「有照片未能加入图库…」/ 部分失败汇总 |

**改动：** 删掉 `#166534` / `#b91c1c`，改用 §0 的 `color-mix`。

### 3.2 队列行 `data-upload-state="failed"`

| 项 | 规格 |
|---|---|
| 卡片 | 保持 surface + border；失败时左边加 **3px** `border-left-color` = 失败强调色（或整圈 `outline: 1px dashed` 同色） |
| 状态行 | `.album-upload-queue-status[data-state="failed"]` 用失败强调色，**不是**纯红 |
| 操作 | 「重试」「移除」保持 `.album-upload-queue-tools`；热区 ≥ 44px（mobile 可拉高 padding） |
| 文件名 | 可保留；读屏以「失败 · {detail}」为主，勿把路径当首要信息 |

### 3.3 衍生图失败（格）

| 项 | 规格 |
|---|---|
| 触发 | `LibraryPhoto` / asset `status === "failed"`（或 `data-failed="true"`） |
| 视觉 | 虚线框 `1px dashed var(--share-muted)`（已有）；底用 `--share-border` 浅底，**禁止**高饱和渐变占位 |
| 文案 | 格内居中 muted：「预览没生成」（≤ 0.75rem） |
| 行为 | 可多选、可删；**不可**选入建册（`libraryPhotoSelectable` 已拦则保持） |

---

## 4. 验收（设计签）

- [ ] 空库 375 / 768：插画叠放可见；主 CTA「上传第一批照片」；次链非默认蓝
- [ ] 上传队列制造 1 条失败：汇总条 + 行状态均无硬编码红/绿，色来自 `--share-*` mix
- [ ] 失败格虚线 +「预览没生成」，无原图、无刺眼色块
- [ ] `prefers-reduced-motion: reduce` 下无额外动效要求（本刀不加动画）

---

## 5. 非本次

- 地点/场景/人物诚实空壳（已有，不动）
- 离线横幅文案（已有）
- 建册弹层失败文案（已有）
- 换主题皮（图库固定棉花糖）
