# 图库空态 + 上传失败态 · 终稿（视觉落地刀）

> **状态：终稿** · 2026-10-19 · didi 已签 moodboard Top 5  
> Moodboard：`docs/design/moodboard/`（`library-empty-fail.md` · `refs.json`）  
> 前端对齐：[#39](https://github.com/wuzicong/nianxiang/pull/39)（壳已有；按本终稿收口）  
> 路由：`/library` + 上传抽屉 `UploadPhotos`（`target.kind = "library"`）  
> 皮肤：工具页固定 `DEFAULT_THEME_ID`（cotton-candy）`--share-*`；**禁止**硬编码 `#b91c1c` / `#166534`

---

## 已签 · Top 5（必须落地）

| # | 原则 | 落到念册 |
|---|---|---|
| 1 | **空态 = 情境化 onboarding**，禁「还没有照片」死胡同 | 标题说空间用途；正文私密承诺；**单一**主 CTA |
| 2 | **首跑空态 ≠ 过滤无结果** | 空库用插画+上传；若日后有筛选清空，另做瘦文案（本刀不做筛选） |
| 3 | **照片压过 chrome**；插画克制 | soft-blob + envelope 轻叠，**禁止**吉祥物占半屏 / 假缩略图墙 |
| 4 | **失败：具体 + 出路 + 不责备** | 汇总条说明失败数；行内「重试」「移除」；禁堆栈/英文 exception |
| 5 | **摄影隐喻**，非系统 empty icon | 信封路线保留；失败格虚线「预览没生成」=「底片没冲出来」语气，口语中文 |

---

## 0. Token

| 用途 | 变量 |
|---|---|
| 页底 / 正文 | `--share-bg` / `--share-text` |
| 卡片 / 描边 | `--share-surface` / `--share-border` |
| 弱说明 | `--share-muted` |
| 主 CTA | `--share-text` 底 / `--share-bg` 字（`.lib-primary`） |
| 次链 | `.lib-quiet` 或 muted 链，**禁止**浏览器默认蓝 |
| 焦点 | `--share-accent`，`outline-offset: 2px` |
| 失败强调 | `color-mix(in srgb, var(--share-accent) 55%, var(--share-text))` |
| 成功强调 | `color-mix(in srgb, var(--share-brand) 70%, var(--share-text))` |
| 装饰 | 仅 `--share-*` SVG，内联在 `.share-shell` |

---

## 1. 空库（时间 Tab · `photos.length === 0`）

```
[ soft-blob 底 + envelope 前景 · aria-hidden · max 插画宽 12rem ]
这里还空着
把照片放进来，念册会按时间帮你排好。只有你能看到。
[ 上传第一批照片 ]     ← 唯一主 CTA · 开上传抽屉
看看主题样张           ← 次链 → /preview · .lib-quiet / muted
```

| 项 | 规格 |
|---|---|
| 卡片 | `.lib-empty.lib-empty-library`；surface 混色 + border；`max-width: 40rem` |
| 插画 | 轻、居中；不抢 CTA；无第三装饰层 |
| 主 CTA | `.lib-primary`；离线 disabled |
| 文案 | 禁止改成「还没有照片 / 暂无数据」 |
| 禁止 | 假网格、系统 empty icon、半屏插画 |

---

## 2. 列表加载失败（`phase === "error"`）

| 项 | 规格 |
|---|---|
| 容器 | `.lib-empty`，**无**空库插画（Stripe：结构在、装饰退） |
| 标题 | 「照片暂时没加载出来。」或网络断文案 |
| 操作 | 唯一「重试」 |
| 禁止 | 错误码、堆栈、责备用户 |

---

## 3. 上传失败（抽屉 `UploadPhotos`）

### 3.1 汇总 `.album-upload-summary`

| `data-kind` | 色 | 语气 |
|---|---|---|
| hint | muted | — |
| success | §0 成功 mix | 「N 张照片已加入图库。」 |
| error | §0 失败 mix | 「有照片未能加入图库，可重试或移除后继续。」 |

删硬编码红/绿。

### 3.2 队列行 `data-upload-state="failed"`

- 左 3px 失败强调边（或 dashed outline）
- 状态行同色；「重试」「移除」热区 ≥ 44px
- 读屏：「失败 · {detail}」，文件名非首要

### 3.3 衍生失败格

- `1px dashed var(--share-muted)`；浅 `--share-border` 底
- 文案「预览没生成」（≤ 0.75rem muted）
- 可多选/删；**不可**选入建册
- 禁止高饱和占位渐变

---

## 4. 验收（对照 Top 5）

- [ ] 空库 375/768：信封轻叠；主 CTA「上传第一批照片」；次链非默认蓝；无「还没有照片」
- [ ] 加载失败无插画、有「重试」、无堆栈
- [ ] 上传失败 1 条：汇总+行均 `--share-*` mix；有重试/移除
- [ ] 失败格虚线 +「预览没生成」
- [ ] 无假缩略图墙、无系统 empty icon
- [ ] `prefers-reduced-motion`：本刀不加强制动效

---

## 5. 非本次

地点/场景/人物诚实空壳 · 离线横幅 · 建册弹层失败 · 换主题皮 · Paper Shaders 动效实验（可进 materials 笔记，不进本 PR）
