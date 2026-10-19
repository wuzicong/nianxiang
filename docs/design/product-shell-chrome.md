# 产品壳视觉整模块 · 终稿草案（Product Shell Chrome）

> **状态：终稿** · 2026-10-20 按 §11 默认挂签（boss 紧急壳改写） · 2026-10-20（Asia/Shanghai）· 设计大神 worker  
> 指派：boss 本地验收紧急 — **产品 SHELL 页近乎裸 HTML**，成册/分享样张已上肤；要求 **整模块改写产品壳视觉**（非再刀相册模板）  
> 对照：`library-home-spec.md` · `library-grid-chrome.md` · `library-empty-upload-fail.md` · `library-grid-gaps.md` · `album-create-select-flow.md` · `album-preview-cta.md` · `theme-textures.md` · `share-success-overture.md` · stealbook **#2 / #3 / #4 / #5 / #10** · `../materials/THEME-ASSET-NAMING.md` · `../moodboard/product-ui-v2.md`  
> 皮肤：工具壳固定 `DEFAULT_THEME_ID`（**cotton-candy**）`--share-*`；成册/分享内卡继续吃各自主题皮  
> 动效：仅 CSS `opacity` / `transform`；桶 **80 / 120 / 180 / 280ms**；一律 `prefers-reduced-motion`  
> **禁止**硬编码 `#b91c1c` / `#166534` / 浏览器默认蓝 / inline `#555`/`#777`；W6 **不做** marketing 落地页；无 video splash；Immich/face/CLIP 后置；云端 apply OOS  
> 远程核对（只读、未 clone）：`apps/web/src/app/{login,albums,library,s}/*` · `globals.css` · `docs/design/*`（尚无本文件）

---

## 状态条 · 覆盖表面

| 项 | 约定 |
|---|---|
| 主战场 | `/login` · `/albums` · `/albums/[id]` · `/library` 主 chrome（含地点/场景/人物占位） |
| 加厚 | 已上肤的 `/albums/[id]/preview` · `/s/[token]` 解锁/图集 — **不推翻**已签刀，只补纹理/封面底/动效桶对齐 |
| 成功标准（boss） | 本地走 **登录 → 相册列表 → 图库 → 相册详情**，**不再像 90 年代裸表单**；与成册预览/分享样张气质同族 |
| 批次 | **一整模块一份规范 / 建议一 PR 合 docs**；前端实现亦宜整模块，禁半页刀 |
| 与建册流关系 | `album-create-select-flow` §12 曾标 `/albums` 裸建 **W6 OOS** — **本模块覆盖「壳视觉」**（顶栏/表单/列表/按钮 token），**不**重做库页选图建册 IA；无选片裸建仍是次路径，主路径仍是 `/library` → 做成主题相册 |

---

## 0. 仓库现状（bare vs themed）· 2026-10-20 只读

| 路由 / 面 | 现状 | 证据（main） |
|---|---|---|
| `/login` | **几乎全裸** | `login/page.tsx`：全 inline style；原生 `<button>`/`<input>`；硬编码 `#555`；无 `.share-shell`、无 `--share-*` |
| `/albums` | **几乎全裸** | `albums/page.tsx`：同构 inline；原生 `<select>`；列表纯文字链；`#555`/`#777` |
| `/albums/[id]` 外框 | **裸** | `albums/[albumId]/page.tsx`：inline 顶屑/标题/`#555`；无工具顶栏 |
| `/albums/[id]` 资产格 | **裸** | `album-asset-grid.tsx`：硬编码 `#eee`/`#faf8f5`/`#8a5a44`；filename 作主文案 |
| `/albums/[id]` 上传 | **已上肤** | `album-upload.css` + `UploadPhotos`：`--share-*`、dropzone、队列失败边 |
| `/albums/[id]` 分享创建/列表 | **已上肤** | `album-share.css` + `CreateShareForm` / `AlbumShareList`：挂 `.share-shell` |
| `/library` | **主 chrome 已上肤** | `library.css`：半透顶栏/Tabs、ring、空库 grain、选择栏、上传工作台；时长桶变量齐 |
| `/library` 地点/场景/人物 | **半档** | CSS 渐变 `.lib-shell-art-*` 占位；文案诚实；**未**落到 empty 刀同级 SVG decor（envelope / sparkle / soft-blob） |
| `/albums/[id]/preview` · `/s/...` | **已上肤 + 纹理起步** | `share-theme.css`：grain/paper、金线薄规、gallery 序章、motion 桶；仍可加厚封面底与卡片材质 |
| `globals.css` | 仅 `--memora-cream/ink/moon` | **未**统一产品壳；工具页应走 `shareThemeStyle(DEFAULT_THEME_ID)`，勿扩一套平行 token |

**结论：** 差距集中在 **login / albums 列表+创建 / album 详情外框+资产格**；library 补占位档次；preview/share **加厚不重写**。

---

## 1. 目标（整模块）

| # | 原则 | 落到念册 |
|---|---|---|
| A | **壳同族、成片更美** | 工具页 quiet cotton；主题皮只出现在主题卡 / 成册 / 分享 |
| B | **一屏一主动词** | 登录主钮「登录」；注册次钮 quiet；相册列表主 CTA「创建相册」；详情上传/分享各守自己区块 |
| C | **删裸 HTML 气质** | 禁浏览器默认蓝钮、灰字 `#555`、无边框白输入；一律 `--share-*` 字段/按钮/焦点 |
| D | **对齐已签刀** | 不回退 grid-chrome ring、empty 文案、create-select IA、preview CTA「生成分享链接」、textures 配方 |
| E | **大模块一次交** | 本文件覆盖全部壳面；前端勿拆「先改 login 再改天 albums」半页 PR（docs 可先挂） |

---

## 2. 共享壳 Token 系统（`.memora-shell` / 复用 `.lib` 模式）

> 工具页根节点：`.share-shell.memora-shell`（或复用 `.lib.share-shell`）+ `shareThemeStyle(themeSkin(DEFAULT_THEME_ID))`。  
> **勿**新建 `--memora-*` 平行色板进产品壳；`globals.css` 的 cream/ink 仅作未挂壳遗留兜底，新页面禁止依赖。

### 2.1 色与表面

| 用途 | 变量 / 写法 |
|---|---|
| 页底 / 正文 | `--share-bg` / `--share-text` |
| 卡片表面 / 描边 | `--share-surface` / `--share-border` |
| 弱说明 | `--share-muted` |
| 品牌点缀 | `--share-brand` · `--share-accent` · `--share-secondary` |
| 主 CTA（实心） | `.shell-primary` / `.lib-primary`：`--share-text` 底 + `--share-bg` 字（cotton 工具皮）；热区高 ≥ **44px**；圆角 `var(--share-radius-button)` 或 pill |
| 次 CTA（安静） | `.shell-quiet` / `.lib-quiet`：透明底 + `--share-border` 或纯文字链；**禁**默认蓝 |
| 字段底 | `color-mix(in srgb, var(--share-bg) 55%, var(--share-surface))`；边 `1px solid var(--share-border)`；圆角 12–14px（cotton） |
| 焦点 | `outline: 2px solid var(--share-accent); outline-offset: 2px`（与 library / share 一致） |
| 错误 | `color-mix(in srgb, var(--share-accent) 55%, var(--share-text))`；`role="alert"`；**禁** `#b91c1c` |
| 成功 | `color-mix(in srgb, var(--share-brand) 70%, var(--share-text))` |
| 浮动阴影 | **仅** dialog / toast / 抽屉：`0 8px 24px color-mix(in srgb, var(--share-text) 12%, transparent)`；列表卡 **无**外投影墙 |
| 半透顶栏 | `color-mix(in srgb, var(--share-bg) 72%, transparent)` + `backdrop-filter: blur(12px)`（login 可简化为实底 surface，因无照片压 chrome） |

### 2.2 顶栏（跨 `/albums` · `/albums/[id]` · 可选 login 轻顶）

| 项 | 规格 |
|---|---|
| 高度 | mobile ≤ **52px**；desktop ≤ **56px**（对齐 `library-grid-chrome`） |
| 左 | 品牌「念册 · Memora」→ `/library`（登录后）或 `/`（未登录） |
| 中/右链 | `照片库` · `相册` ·（登录态）头像/邮箱菜单 · `退出` |
| 当前页 | `aria-current="page"` 实心底 `--share-text` / 反白字（对齐 `.lib-nav a[aria-current]`） |
| 隐私 | 图库已有「仅你可见」；相册列表可弱标「相册默认私密」muted 12–13px |
| 阴影 | **无**；底边 1px `--share-border` |

`/library` 顶栏**已签**，本模块只要求 albums/login **同族**，不改 library 选择栏/上传逻辑。

### 2.3 表单字段（login / albums 创建 / 详情外框若有）

| 项 | 规格 |
|---|---|
| Label | 0.875–0.92rem · `--share-text`；与控件间距 **6px** |
| Input / select | 高 ≥ **44px**；padding `0.7rem 0.85rem`；字色 `--share-text`；placeholder `--share-muted` |
| Select | **自定义皮**：同字段边框；禁止系统蓝高亮残留为唯一风格（可用原生 select 但必须吃 token 边/底/字） |
| 错误句 | 字段下 0.82rem；或表单顶 `role="alert"` 一条 |
| 禁用 | opacity **0.45**；`cursor: not-allowed` |

### 2.4 按钮层级

| 角色 | 类 | 规则 |
|---|---|---|
| 主 | `.shell-primary` | 同时刻一屏一枚实心（区块内可各有一枚，但视觉权重分区） |
| 次 | `.shell-quiet` | 边框或文字；注册、取消、次导航 |
| 危险次 | 撤销分享等 | 已有 `.album-share-revoke-btn` — **保持**；勿改成红底实心 |

### 2.5 空占位（地点 / 场景 / 人物 · 与 empty 刀同档）

| Tab | 插画 | 标题（锁定） | 正文（锁定） | 操作 |
|---|---|---|---|---|
| 地点 | `decor/envelope.svg` 前景 + 可选轻 grain | **地点整理还在路上** | 我们会在你的设备/服务器上本地识别拍摄地点，不会把位置发给第三方。准备好之前，这里先空着。 | **回到时间**（`.lib-quiet`） |
| 场景 | `decor/sparkle.svg` | **场景识别还在路上** | 之后会按「夜景」「海边」「美食」这类场景自动归类。现在还没有分析任何照片。 | **回到时间** |
| 人物 | `decor/soft-blob.svg` 底（**无人脸剪影**） | **人物识别还在路上** | 人脸识别默认关闭，开启前会单独问你。现在没有识别任何人。 | **回到时间** |

- 容器：复用 `.lib-shell` / `.lib-empty` 表面；插画 max 宽 **12rem**；`aria-hidden`  
- **替换**现 `.lib-shell-art-place|scene|people` CSS 假地图/柱/剪影渐变 — 它们接近「示意 UI」，档次低于空库信封  
- Tab「即将」徽标 12px muted — **保持** home-spec  
- 禁止示例头像 / 地图 pin / 假 chip

---

## 3. 分路由规格

### 3.1 `/login` · 登录 + 注册

#### 布局

```
[.memora-shell 全屏 · cotton · 轻 soft-blob 右上可选]
  [.shell-card max 22.5rem]
    念册 · Memora（链 → /）
    kicker「欢迎回来」或「创建账号」
    h1「登录」 / 切到注册时「注册」
    一句隐私：「邮箱和密码只在你的空间里使用。会话放在 HttpOnly Cookie。」
    [邮箱]
    [密码 · ≥8]
    [ 登录 ]          ← 唯一实心
    [ 注册 ]          ← quiet；或 Tab「登录 | 注册」切换同一卡
    状态句 aria-live
```

| 项 | 规格 |
|---|---|
| 背景 | `--share-bg` + 可选 cotton grain opacity **0.08–0.12**（卡片外）；卡片实底 `--share-surface` |
| 卡片 | max-width **22.5rem**（360px）；padding **1.5–1.7rem**；border `--share-border`；radius `var(--share-radius-card)`；**可有**一层浮动阴影（登录是孤立卡，允许） |
| 双模式 | **默认 A（跟现码）**：同表单两钮「登录」「注册」；主=登录实心，注册=quiet。**备选 B**：顶部分段「登录 \| 注册」切换文案与提交 path — 见 §12 默认 A |
| 已登录 | 显示邮箱（**勿**把 user id 当主角；id 可 `lib-sr` 或 muted 小字）；主链 **进入照片库**；次 **管理相册**；quiet **退出** |
| 成功 | `router.push("/library")`（现行为保留）；Toast 可选「登录成功」 |
| 失败 | 产品句：`safeUserMessage` 已有兜底 — 皮上用 alert 色；禁堆栈 |
| 动效 | 卡入场 **180ms** opacity + `translateY(8px→0)`；reduced → ≤80ms opacity |

#### 文案锁定（中文）

| 角色 | 文案 |
|---|---|
| 标题 | **登录** / **注册** |
| 主钮 | **登录** · pending **登录中…** |
| 次钮 | **注册** · pending **注册中…** |
| 退出 | **退出** |
| 已登录主链 | **进入照片库** |
| 次链 | **管理相册** |
| 隐私一句 | **邮箱和密码只在你的空间里使用。会话放在 HttpOnly Cookie，页面脚本读不到。** |

**禁止：**「Submit」、英文主钮、默认蓝链「click here」。

---

### 3.2 `/albums` · 列表 + 创建（壳视觉 · 现纳入本模块）

> IA：无选片裸建仍是次路径；主建册在 `/library`。本模块只把本页从裸 HTML 拉到工具壳档次。

#### 结构

```
[半透/实底顶栏 · 品牌 · 照片库 · 相册(current) · 登录态]
[main · .shell-wrap max 42–45rem]
  h1「相册」
  lede（私密 + 链到样张 / 图库建册提示）
  [.shell-card 新建]
    h2「新建相册」
    标题 input 1–80
    主题 select（选项文案 themeSkin.name；**列表项可不换皮**，避免整页三色）
    [ 创建相册 ] 实心
  [列表]
    每本：卡或行 — 标题链 → /albums/[id] · 主题名 · N 张 · 「成册预览」quiet
  [空列表]
    信封轻叠 +「还没有相册」+ 主 CTA「新建一本」聚焦创建卡 · 次链「去照片库选片做成册」
```

| 项 | 规格 |
|---|---|
| 顶栏 | §2.2 |
| 创建卡 | surface + border；字段 §2.3；主题 **原生 select 吃 token** 即可（W6 不做三列主题大卡 — 那是 library 建册弹层的活） |
| 列表行 | 底边 hairline 或浅卡；**无**投影墙；行高舒适 padding **0.85–1rem** |
| 空态 | 对齐 empty 刀语气；插画 ≤12rem；禁止 Immich 式图标架 |
| 401 | 「请先登录」+ 链到 `/login?next=/albums` |
| 与 create-select | **不**在此页复制两步主题卡弹层；lede 可写：**想从照片里做成册，去照片库多选后点「做成主题相册」。** |

#### 文案

| 角色 | 文案 |
|---|---|
| h1 | **相册** |
| lede | **在这里管理相册与分享。相册默认只有你能看到。** 也可从照片库选片做成主题册。想先看版式，打开 **主题样张**。 |
| 创建 h2 | **新建相册** |
| 主钮 | **创建相册** · pending **创建中…** |
| 空标题 | **还没有相册** |
| 空正文 | **建一本空册后上传，或去照片库选片直接做成主题相册。** |
| 空次链 | **去照片库** |

---

### 3.3 `/albums/[id]` · 上传 + 分享管理壳

> 上传区 / 分享表单 / 分享列表 **已上肤** — 保留 `album-upload.css` / `album-share.css`。  
> 本模块改：**页外框 + 资产网格 + 空册提示**，去掉 inline 90s 皮。

#### 结构

```
[顶栏 · 相册 current · 链回列表]
[标题区]
  h1 {album.title}
  meta：主题名 · N 张 · 「按主题看这本相册」→ preview（主文字链，权重次于分享区主 CTA）
[资产区 .album-assets]
  空：诚实空卡（token 边框，禁 #faf8f5）
  有图：方格网格 gap 对齐库页气质（mobile 2–4px 可略疏到 8px 因管理页）；状态角标 muted
[上传 #album-upload]     ← 已有组件，勿复制第二套
[创建分享 #album-create-share] ← 已有
[分享列表]               ← 已有 share-shell
```

| 项 | 规格 |
|---|---|
| 外框 | `.memora-shell` cotton；max-width **45rem**（720 可升到 45rem 与库对话框同阶） |
| 资产格 | **删**硬编码色；用 `--share-border` / `--share-surface`；失败虚线 + 产品句；**alt/列表主文案不以 filename 为首要**（改「照片」+ status；filename 可 muted 次行或 title tooltip） |
| 空册 | 标题 **这本相册还是空的**；正文引导上传；「前往上传」为页内锚点 quiet，色 `--share-text` / accent mix，**禁** `#8a5a44` |
| 处理中条 | muted：**有照片正在生成预览…**（现文案可留，换色） |
| 预览链 | **按主题看这本相册** — quiet；分享创建主 CTA 仍在 CreateShareForm 内（既有） |
| 主题 | 上传/分享子树继续 `themeSkin(album.themeId)`；**页顶栏不换三皮** |

---

### 3.4 `/library` · 主 chrome 补齐 + 占位 Tab

| 项 | 本模块做 | 不做（已签） |
|---|---|---|
| 顶栏 / Tabs 半透 | 审计与 albums 顶栏 token 一致 | 改 ring / gap / 选择栏 IA |
| 时间轴 | — | 网格逻辑、虚拟滚动 |
| 地点/场景/人物 | **升到 empty 同档 SVG + 文案验收**（§2.5） | ML / 假数据 |
| 空库 / 上传失败 | — | 已终稿 |
| 建册弹层 | — | create-select 终稿 |

**占位实现要点：** 去掉 `.lib-shell-art-place|scene|people` 渐变示意；改 `.lib-empty-art` 结构（soft-blob/envelope/sparkle 内联 `--share-*`）；保留「即将」与「回到时间」。

---

## 4. 加厚 pass · 预览 / 分享（不拆已签刀）

目标：在 **不改** CTA 文案、安全文案、序章字阶、侧栏 OOS 的前提下，让样张与产品壳同帧更「满」。

| 加厚项 | 规格 | 勿动 |
|---|---|---|
| **封面 / 页底氛围** | 各主题 `.share-backdrop` 保持；cotton 可略提高 blob 可见度但仍 ≤ 抢 CTA；kyoto 径向光保留；heirloom **仅** 1px 金线 | 勿加 video/Lottie splash |
| **纹理** | 沿用 `theme-textures`：cotton grain · kyoto paper · heirloom 无满屏纹；gallery 成功屏可在标题区外轻纹，**不压字** | 勿改 unlock 失败同态 |
| **SVG 材料** | 继续 ornaments（tape/heart/washi/folio）；移动端 ≤640 藏 lantern/ticket/stamp（既有） | 勿新吉祥物半屏 |
| **动效桶对齐** | 审计残留 `0.15s`（upload dropzone 等）→ snap 到 **120/180**；gallery sparkle 一次 ≤400ms 可保留但 reduced 关 | 勿引入 160/220/240 新散值到壳 |
| **预览 owned chrome** | 确认主 CTA 仍「生成分享链接」；屑/返回链 quiet | 勿第二实心 |
| **图集卡片** | `share-gallery-card` 可加 1px border `--share-border`；gap 保持 ≥12px | 勿 filename 主角（captions 刀） |

**明确不做：** 营销落地、WebGL、翻页物理模拟升级、云主题商店。

---

## 5. 材料清单（SVG / 纹理 / 封面底）

### 5.1 已有可用（优先）

| 资产 | 路径（设计仓 / 将挂 docs） | 用途 |
|---|---|---|
| soft-blob.svg | `specs/decor/` · handoff-decor | 空库底、login 氛围、人物 Tab 底 |
| envelope.svg | 同上 | 空库前景、地点 Tab |
| sparkle.svg | 同上 | 场景 Tab、成功闪（既有） |
| washi-tape.svg / torn-edge.svg | 同上 | 分享卡点缀；壳页慎用 |
| share-texture grain/paper | `apps/web/.../share-theme.css` data-URI | unlock / 可复用 login 卡外 |
| Paper Shaders | catalog mat-fx-001/002 · Apache-2.0 | 可选；默认静态 SVG |

### 5.2 命名（锁定）

| 产品名 | id |
|---|---|
| 棉花糖 | `cotton-candy`（工具默认皮） |
| 海风 | **`kyoto-lantern`**（禁 `sea-breeze` 路径） |
| 传家 | `magazine-heirloom` / `THEME_IDS` 为准 |

### 5.3 仍缺 / 可选补（非拦验收）

| 缺口 | 建议 | 优先级 |
|---|---|---|
| 独立「壳顶栏」SVG logo | 可用字标「念册」；完整 logo 后置 | P2 |
| login 专用封面静帧 | **不需要**库存大图；blob+grain 足够 | — |
| ui-chrome/ 二进制 | 保持 link-first；本模块不落商用库存 | — |

挂靠仓库时路径建议：`docs/design/materials/`（命名）· `docs/design/` 本规格 · decor 随既有 handoff。

---

## 6. 动效总表（本模块）

| 交互 | 桶 | 属性 |
|---|---|---|
| 按钮/链 hover·active | 80–120 | opacity / `scale(0.97–0.98)`；reduced 无 scale |
| 字段 focus 环 | — | 即时 outline |
| 登录卡 / 空态入场 | 180 | opacity + translateY(8→0) |
| 顶栏显隐微调（若做） | 120 | opacity only |
| Tab 内容切换 | 180 | 交叉淡 |
| 抽屉/弹层（库页既有） | 280 / 180 | 不改 IA |
| 纹理入场 | 180 | opacity |
| 上传 dropzone 过渡 | **120**（替换 0.15s） | border/opacity；禁 layout |

`prefers-reduced-motion: reduce`：仅短 opacity（≤120，优先 80）；关 blob 呼吸、grain 循环、sparkle。

---

## 7. 验收清单（375 / 768 / 1280）

**路径观感（boss）**

- [ ] `/login`：无原生灰钮/蓝链；卡片与字段吃 `--share-*`；主次钮分明  
- [ ] `/albums`：有工具顶栏；创建区与列表非裸 HTML；空态有插画+出路  
- [ ] `/albums/[id]`：外框与资产格无 `#555`/`#eee`/`#8a5a44`；上传/分享仍好用且已肤  
- [ ] `/library`：地点/场景/人物与空库同档 SVG；无假地图/人脸剪影  
- [ ] 预览/分享：纹理与金线仍在；主 CTA 文案未改；无 video splash  

**系统**

- [ ] 工具壳均为 cotton `DEFAULT_THEME_ID`；主题皮不涂满 login/albums 顶栏  
- [ ] 色值 `--share-*` / `color-mix`；源码无新增 `#b91c1c` / `#166534` / 默认蓝  
- [ ] 动效仅 opacity/transform；时长在 80/120/180/280；有 reduced 分支  
- [ ] 焦点环 accent；触控 ≥44；对比 ≥4.5:1  
- [ ] 未回归：create-select 选择栏、preview「生成分享链接」、empty 文案、grid ring≤2px  

**边界**

- [ ] 无 marketing 落地；无 Immich/face/CLIP UI；无云 apply；无半页刀拆 PR 要求  

---

## 8. 非本次（OOS）

| 排除 | 归属 |
|---|---|
| `/library` 选图建册 IA / 200 上限 / 弹层两步 | `album-create-select-flow`（已签） |
| 网格 ring / 半透参数重开 | `library-grid-chrome` / `gaps` |
| 空库/上传失败文案重写 | `library-empty-upload-fail` |
| 预览主 CTA 文案 | `album-preview-cta` |
| 侧栏 push | W6 OOS 文 |
| 分享安全/限流/失败同态 | unlock 既有 |
| `/albums` 升级为三主题大卡建册 | 主路径在 library；本模块 select 即可 |
| Mood Dial / 12 模板扩展 / ML 分面 | 后置 |
| marketing-shell · WebGL · video splash | W6 禁 |
| 云端主题 apply / 商店 | OOS |

---

## 9. 前端交接

1. **新建样式入口建议：** `apps/web/src/app/shell/shell.css`（或 `memora-shell.css`），login + albums 列表/详情外框共用；**复用** `--share-*` 与 library 的 `.lib-primary`/`.lib-quiet` 模式，避免第三套按钮名。  
2. **真源改造文件：**  
   - `login/page.tsx` — 剥 inline，挂 shell  
   - `albums/page.tsx` — 顶栏 + 创建卡 + 列表  
   - `albums/[albumId]/page.tsx` — 外框  
   - `albums/album-asset-grid.tsx` — token 网格；弱化 filename  
   - `library.css` / 占位 JSX — 替换 `.lib-shell-art-*`  
   - `album-upload.css` — 时长 snap（小）  
   - preview/share — 仅加厚审计，大改走既有刀  
3. **注入主题：** 各工具页根 `className="share-shell memora-shell"` + `style={shareThemeStyle(themeSkin(DEFAULT_THEME_ID))}`。  
4. **勿复制** UploadPhotos / CreateShareForm。  
5. **测试：** 375/768/1280 截图四路由；键盘登录全路径；reduced-motion；axe 无 serious。  
6. **实现批次：** 建议前端 **一个实现 PR** 覆盖壳；若必须拆，按「token 基础 → login+albums → album detail 外框 → library 占位 → 加厚」仍属同一里程碑，禁只交 login。

---

## 10. 与既有文档关系

| 文档 | 关系 |
|---|---|
| `library-home-spec` §3 | 占位文案母本；本模块升视觉档 |
| `library-grid-chrome` / `gaps` / `empty` | 已签；本模块引用不改数字/文案 |
| `album-create-select-flow` | 主建册；本模块补 `/albums` **壳**（§12 OOS 的「裸建」被壳化，非 IA 回流） |
| `album-preview-cta` / `share-*` / `theme-textures` | 加厚遵守 |
| `念册-最终完整设计方案` | 注册登录在 IA 内；本模块补 W6 可实施壳，不恢复 marketing 落地 |
| 仓库 `docs/design/` | 签后 hang `product-shell-chrome.md` |

---

## 11. 已拍板默认（减少 didi 往返）

| # | 项 | 默认决议 |
|---|---|---|
| 1 | 工具壳主题 | **cotton-candy** `DEFAULT_THEME_ID` |
| 2 | 登录交互 | **同卡双钮**（登录实心 / 注册 quiet）；不做独立 `/register` 路由 |
| 3 | `/albums` 主题选择 | **token 化 native select**；不做库页级三主题大卡 |
| 4 | `/albums` 与建册主路径 | 列表可建空册；lede 导向库页选片；**不**回退 create-select |
| 5 | 资产格文件名 | 主文案改中性「照片」+ 状态；filename 降级 |
| 6 | 地点/场景/人物 | 换 SVG decor，文案保持 home-spec |
| 7 | 预览/分享 | **加厚 only**；CTA/安全文案不动 |
| 8 | PR 策略 | docs 一 PR；实现一大 PR（或同里程碑） |

若 didi 要改：仅可能动 **#2 分段 Tab** 或 **#3 主题卡** — 其余按表执行。

---

## 12. 建议 PR 标题

```
docs(design): 产品壳视觉整模块 (product-shell-chrome)
```

Hang 目标：`docs/design/product-shell-chrome.md`（设计 docs，勿改 app 代码于设计 PR）。

---

*文件：`/workspace/design-memora/specs/product-shell-chrome.md`*
