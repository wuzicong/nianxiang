# 建册 / 选图流收口 · 整模块终稿草案

> **状态：终稿** · didi 2026-10-19 签 §12 全默认 · 2026-10-19（Asia/Shanghai）· 设计大神 worker  
> 指派：建册 + 选图流 **整模块收口**（boss：大模块一次成，禁半页刀）  
> 对照：`library-home-spec.md` §4–5 · `library-grid-chrome.md` · `library-grid-gaps.md` · `library-empty-upload-fail.md` · `album-preview-cta.md` · stealbook **#2 / #3 / #4 同轴 / #9 / #10** · Canva Glow Up 浮动面板 / VSCO selection ring  
> 表面：`/library` **多选态 → 选择栏 → 建册弹层（主题 → 标题）→ 跳转** `/albums/[id]/preview`  
> 皮肤：工具页固定 `DEFAULT_THEME_ID`（cotton-candy）`--share-*`；**仅**主题卡内包各自 `.share-shell[data-theme]`  
> 动效：仅 CSS `opacity` / `transform`；桶 **80 / 120 / 180 / 280ms**；一律 `prefers-reduced-motion`  
> **禁止**硬编码 `#b91c1c` / `#166534` / 默认蓝链；W6 **不做** marketing 落地页；侧栏 push = W6 OOS  
> 远程核对（只读、未 clone）：`apps/web/src/app/library/{library-home,library-grid,library-create-dialog,library.css}` · `lib/{library,library-api}.ts` · `docs/design/*`（尚无本文件）

---

## 状态条 · 覆盖表面

| 项 | 约定 |
|---|---|
| 主路径 | 有图时间 Tab → 进入多选 → 选择栏「做成主题相册」→ Step1 选主题 → Step2 起标题 →「生成预览」→ `/albums/[id]/preview` |
| 路由 | `/library`（工具页）+ 建册后 owned 预览（本模块止于跳转握手；预览 CTA 已另刀） |
| 已落地 · 勿重做 | 空库/上传失败 · 网格半透 chrome · gapless 缝 · 上传浮动可收工作台 · 预览 CTA「生成分享链接」· 分享成功序章 · 图注/刷新 tip |
| 本模块增量 | 把 **选图 chrome + 选择栏 IA + 建册两步弹层 + 本流空/败态 + 文案/CTA/动效** 收成一份可验收终稿；对齐已签网格/上传气质，**扩展不矛盾** |
| 数据 | 衍生图 only；建册 `createThemedAlbum({ title, themeId, assetIds })`（仓库已有）；上限 **200**（`LIBRARY_SELECTION_LIMIT`） |

---

## 0. Token（本模块）

| 用途 | 变量 / 写法 |
|---|---|
| 页底 / 正文 | `--share-bg` / `--share-text`（工具页 cotton） |
| 表面 / 描边 | `--share-surface` / `--share-border` |
| 弱说明 / 计数 | `--share-muted` |
| 主 CTA | `.lib-primary`：`--share-text` 底 + 反白字（或主题规定实心）；**选择栏 / 弹层同时刻仅一枚实心主动词** |
| 次链 | `.lib-quiet`；禁浏览器默认蓝 |
| 选中 ring | ≤2px inset · `var(--share-brand)` 或 brand×text mix（与 `library-grid-chrome` 一致） |
| ✓ 徽章 | 底 `--share-brand`；勾 `--share-bg` |
| 焦点 | `--share-accent`，`outline-offset: 2px` |
| 失败强调 | `color-mix(in srgb, var(--share-accent) 55%, var(--share-text))` |
| 成功强调 | `color-mix(in srgb, var(--share-brand) 70%, var(--share-text))` |
| 浮动层阴影 | 仅 dialog / 选择栏可选极弱顶边；例 `0 8px 24px color-mix(in srgb, var(--share-text) 12%, transparent)` — **网格永不漂** |
| 半透选择栏（desktop 顶替） | `color-mix(in srgb, var(--share-bg) 78%, transparent)` + `backdrop-filter: blur(12px)`；对比不达标 → 提高不透明度 |

一律 `--share-*` / `color-mix`。主题卡内部可用该卡皮肤 token，**不得**把相册主题皮涂满整页工具 chrome。

---

## 1. 目标（整模块）

| # | 原则 | 落到念册 |
|---|---|---|
| A | **选图安静、建册清楚** | 多选不洗照片（ring+✓）；弹层一眼懂「皮肤 → 标题 → 成片」 |
| B | **一屏一主动词** | 选择栏主钮 =「做成主题相册」；弹层主钮 =「下一步」/「生成预览」；取消/上一步 = 文字链 |
| C | **失败可恢复、选择不丢** | 建册/关联失败保留选题集与输入；原子失败可「重试放入」 |
| D | **对齐已签 chrome** | 选中视觉跟 grid-chrome；阴影只给浮动层跟 gaps；上传工作台可并存但不抢选择栏 |
| E | **无文件名泄出（客态）** | 本流面向主人；`aria-label`/封面/`alt` **不以 filename 作首要信息**；客人分享面另规已签 |

---

## 2. 流程地图（屏幕）

```
[/library · 时间 · 有图]
  ├─ 浏览（单击 → 灯箱；非本模块深改）
  ├─ 进入多选（长按 450ms / 复选框 / Ctrl·Cmd / Space）
  │     └─ 选中 ring + ✓；日头「选这天」三态；Shift 范围
  ├─ 选择栏
  │     └─ ✕取消 | 已选 N 张 | 【做成主题相册】
  └─ 建册弹层 LibraryCreateDialog
        ├─ Step 1 选主题（3 卡 · 各自皮肤 · 用户封面预览图）
        ├─ Step 2 起标题（1–80 · 隐私一句）
        └─ 提交「生成预览」
              ├─ 成功 → 关弹层 · 清选择 · Toast · push `/albums/{id}/preview?focus=title`
              └─ 失败 → 弹层内联错误 · 保留状态（见 §7）
```

**不在本图：** `/albums` 裸表单「新建相册」（无选片）— 见 §11 OOS。  
**下游已签：** 预览页主 CTA「生成分享链接」→ 分享区（`album-preview-cta`）。

---

## 3. 选图 · 进入 / 退出 / 手势

### 3.1 进入多选

| 平台 | 方式 | 规格 |
|---|---|---|
| 触屏 | **长按 450ms** 进入并选中该张 | `navigator.vibrate(10)` 若可用；进入后**单击切换** |
| 桌面 | 悬停显左上复选空心；点复选进入；`Ctrl/Cmd+点击` 切换 | 复选视觉圆 ≥20px；热区 ≥44 走格或扩左上 1/3 |
| 键盘 | 焦点格 `Space` 切换；非多选时 `Enter` 开灯箱 | 漫游 tabindex 保持 grid 刀 |

- 不可选：`status === "failed"`（「预览没生成」格）— 可删（P1）但 **不可进选择集 / 不可建册**  
- 处理中格：可选（有衍生或占位）；提交时仍按 id 关联；预览未好由 preview 页空槽承接（已签虚线空槽）  
- **禁止**品牌色蒙版洗图；未选格 **不变暗**

### 3.2 范围与组选

| 手势 | 行为 |
|---|---|
| `Shift+点击` | 锚点→目标按时间序范围；锚点已选→加选，未选→批量取消；**跨日/月**；按数据索引（虚拟化外仍算） |
| 「选这天」 | 日头右侧；三态未选 / `aria-checked="mixed"` / 全选；只作用于该日 **可选集** |
| 「选整月」 | desktop 月头悬停或 mobile 长按 — **P1 可延后**；W6 若未做，验收不拦 |
| `Ctrl/Cmd+A` | 多选态下选中当前已加载可选集，封顶 200；live 区播「已选全部 N 张」或触顶文案 |

### 3.3 上限

- 常量：**200**（与 `LIBRARY_SELECTION_LIMIT` / API 一致）  
- 触顶：`capped=true`；主钮 **disabled**；live/选择栏文案：**「一次最多 200 张，先挑最想放进去的」**  
- 再点加选不静默丢弃已选；Shift 扩选遇顶设 capped

### 3.4 退出多选

| 方式 | 行为 |
|---|---|
| 「✕ 取消」 | 立即清空选择 + 退出选态 |
| `Esc` | 若弹层开：先关弹层（pending 时不可关）；否则退出多选 |
| 选中归零 | mobile：**不**自动退出，须点取消；desktop：可 1.5s 后自动退出（可选；若实现须 reduced 无延迟动画） |

打开建册弹层时 **保持** 选择集（勿先清）；成功提交后再清。

---

## 4. 选中 chrome（对齐 grid-chrome · 本模块验收）

> 行为已在 home-spec / 代码；本模块把视觉验收绑进建册路径，避免「选得对但看起来像旧 3px 压框」。

| 项 | 规格 |
|---|---|
| Ring | **≤2px 内描边**（`inset box-shadow` 或 `outline-offset: -2px`）；禁 ≥3px 实线压框；禁外扩吃 gap |
| 内缩 | **取消**默认 6% scale；按下可选 80ms `scale(0.98)`；reduced → 无 scale |
| ✓ | 右上 6–8px；圆 20px；120ms opacity + `scale(0.92→1)`；reduced → 仅 opacity 80ms |
| 空心复选（未选·多选态常显） | 1.5px border；底 `--share-bg` 40% mix，深色图上可读；**无**品牌填充 |
| Hover | 禁位移/投影抬起；可选复选 opacity 0→1 **120ms** |
| 焦点 | accent 环与 ring 可叠、不同色 |

网格 gap / 组间呼吸 / 禁投影墙 → **已签** `library-grid-gaps`；本模块不改数字。

---

## 5. 选择栏（Selection Bar）

### 5.1 放置

| 断点 | 规格 |
|---|---|
| mobile / tablet（&lt;1280） | **底部固定**；高 64px + `env(safe-area-inset-bottom)`；顶边 hairline 或极弱上投影一条 |
| desktop（≥1280） | **顶部替换**主顶栏（Google Photos 式）；同高 ≤56–64px；半透 + blur（§0）；**勿**再叠一条底部栏抢拇指区 |

**现状差距（仓库）：** `library-home` 同时渲染 `lib-selection-bar-top` 与 `lib-selection-bar-bottom`。本终稿要求 **按断点二选一**（CSS 显隐或条件渲染），避免双栏。

### 5.2 内容与层级

```
[ ✕ 取消 ]     [ 已选 N 张 ]     [ 做成主题相册 ]
  .lib-quiet      strong · aria-live     .lib-primary（唯一实心）
```

| 角色 | 文案（唯一） | 规格 |
|---|---|---|
| 取消 | **✕ 取消** | 文字链；热区 ≥44 |
| 计数 | **已选 N 张** | weight 600；`aria-live="polite"`；触顶换触顶文案（§3.3） |
| 主 CTA | **做成主题相册** | 实心；`selected.length < 1` / offline / pending / capped → disabled |
| P1 次级 | 「加入已有相册」「删除」 | **本模块不做**；占位勿先上假按钮 |

### 5.3 与上传工作台共存

| 态 | 规则 |
|---|---|
| 选择栏开 + 上传抽屉开 | 上传可收成右下胶囊（已签）；选择栏 z 高于胶囊点击区以外的遮挡；**禁止**两枚实心主 CTA 同屏抢（上传抽屉内主动作保留抽屉语境） |
| 离线 | 选择栏仍可浏览已选；主钮 disabled；旁侧不另起第二 CTA |

### 5.4 动效

| 交互 | 桶 |
|---|---|
| 选择栏进 | **180ms** opacity + `translateY(16px→0)`（底栏）或 `translateY(-8px→0)`（顶栏） |
| 选择栏出 | **180ms** opacity |
| reduced | ≤120ms 仅 opacity |

---

## 6. 建册弹层（主题 → 标题）

### 6.1 容器

| 断点 | 规格 |
|---|---|
| mobile（&lt;768） | 底部抽屉气质：**max-height 88vh**；圆角顶 16–20px；可下滑关闭（非 pending）；遮罩 `color-mix(text 40%, transparent)` |
| tablet / desktop | 居中 dialog；宽 **720px**（max `calc(100vw - 2rem)`）；中性浮动阴影（§0） |
| 实现 | 可继续用 `<dialog class="lib-dialog">`；CSS 在窄屏改为底贴（`margin: auto 0 0` 或等价），对齐 home-spec，勿另起第二组件 |

- 打开：焦点进 Step1 第一主题卡或 radiogroup；焦点陷阱；关闭回「做成主题相册」按钮  
- pending：`onCancel` preventDefault；主钮与取消禁用策略见 §6.4  
- 工具页外壳保持 cotton；**仅卡内**换皮

### 6.2 Step 1 · 选主题

| 项 | 规格 |
|---|---|
| Kicker | **第 1 步** · 0.75rem muted · tracking 略开 |
| 标题 h2 | **做成主题相册** |
| 说明 | **为已选的 N 张挑一套皮肤。封面会用你自己的预览图。** |
| 卡 | `THEME_IDS` 序：cotton-candy / kyoto-lantern / magazine-heirloom |
| 每卡 | `.share-shell[data-theme]` + `shareThemeStyle`；封面 = 所选照片衍生 `preview`（规则见 §6.2.1）；`theme.name` 中+英；一句 subtitle；layouts 标签（故事 / 翻页；magazine 仅故事） |
| 交互 | `role="radiogroup"`；方向键；默认 `DEFAULT_THEME_ID` |
| 禁止 | 「AI 推荐」角标；示例库存图当封面；假数据风景 chip |

#### 6.2.1 封面图选取（待 didi 可改默认）

**草案默认（与现码接近并收紧）：**  
在 **当前选择集** 内，按时间正序（`chronologicalAssetIds`）取 **第一张可选且有 `preview` URL** 的衍生图；若皆无 preview，显示空封面占位（`--share-border` 底，无假图）。

备选（§12）：用户在弹层内点选封面 · 或取选择集「第一张点选」而非时间序。

### 6.3 Step 2 · 起标题

| 项 | 规格 |
|---|---|
| Kicker | **第 2 步** |
| 标题 h2 | **起个标题** |
| 说明 | **相册默认只有你能看到。生成分享链接是之后单独的一步。** |
| 输入 | label「相册标题」；`maxLength={80}`；去首尾空后空 → 主钮 disabled |
| 预填 | 切入 Step2 或换主题且用户未脏写时：用该主题 `shareTitle` / `defaultComposeTitle`；**进框即全选** 方便改 |
| 备选预填 | `suggestedAlbumTitle`（日期范围）— 见 §12；W6 默认跟主题文案，更「成册」 |

### 6.4 主 / 次 CTA（弹层）

| Step | 主钮文案 | 次 |
|---|---|---|
| 1 | **下一步** | **取消**（quiet） |
| 2 | **生成预览** | **上一步** + **取消**（均 quiet） |
| pending | **正在生成…** | 取消 disabled；禁止换动词族（勿「提交中/请稍候」乱跳） |

- 同时刻 **一枚** `.lib-primary`  
- 连点只允许 1 次 in-flight 请求（`pending` 门闩）  
- 成功 Toast（live）：**已建好「{标题}」，共 N 张**  
- 跳转：`/albums/{id}/preview?focus=title`；落地焦点 `h1`（预览刀已要求）

### 6.5 主题卡视觉

| 项 | 规格 |
|---|---|
| 布局 | mobile 纵向 3 卡；≥768 **3 列** |
| 封面区 | 高约 7–8rem；`object-fit: cover`；圆角 = 该主题 `radius.card` |
| 选中卡 | 2px inset ring（brand）；可轻 `translateY(0)` 无抬起投影墙；禁洗底 |
| Hover | 120ms brightness/opacity only；禁 scale 抬起 |
| 纹理 | 可吃已签 `theme-textures` 薄规（卡内）；勿在工具页全屏换皮 |

---

## 7. 本流空 / 败态（仅建册·选图）

> 空库、列表加载失败、上传失败 → **已签** empty 刀；此处只写选图/建册路径。

| 状态 | 触发 | 表现 | 文案 |
|---|---|---|---|
| 未选不可建 | 选态但 0 张 | 主钮 disabled | 计数可空或「已选 0 张」；勿 Toast 责备 |
| 触顶 200 | capped | 主钮 disabled；live 换文案 | **一次最多 200 张，先挑最想放进去的** |
| 失败格 | status failed | 不可选；虚线 +「预览没生成」 | 与 empty 刀一致 |
| 离线 | `navigator.onLine=false` | 建册主钮 disabled；已选可浏览 | 顶栏离线条已有；弹层若已开：提交失败走网络文案 |
| 建册 API 失败 | create 非 attach | 弹层 `role="alert"`；保留主题/标题/选择 | 优先产品句；401 → **登录已过期，请重新登录** |
| 网络断 | fetch throw | 同上 | **网络好像断了，选择还在，连上后再点一次** |
| 册成片未挂上 | attachFailed + albumId | 不跳转；保留 draftAlbumId/draftIds；主题步可锁 | **相册建好了，但照片没放进去。请重试放入。** + 链 **打开这本相册**（可选） |
| 标题非法 | trim 空 / &gt;80 | 主钮 disabled 或 400 回显 | **标题需要 1 到 80 个字符**（API 已有） |

**禁止：** 堆栈、英文 exception、错误码作主文案、空选择仍可点进弹层后才骂用户。

草稿提示条（有 `draftAlbumId` 时，网格上方）：**有一本相册还没放完照片，重试只会继续放入刚才那一批。** — 保留。

---

## 8. 隐私与文件名

| 面 | 规则 |
|---|---|
| 选图 `aria-label` | 日期时间 +「第 i 张，共 n 张」± 已选；**不要** filename 作首要（现码已对齐） |
| 建册封面 `img alt` | `alt=""` 装饰；读屏靠卡标题 |
| 灯箱说明 | 短日期/上传回落；**无**原始文件名主角（`libraryPhotoCaption` 已无 filename） |
| 主人库其它面 | 若某管理列表已允许显示 filename，可保留；**不得**泄漏到客人 `/s/...` 与成册预览图注（预览刀已禁） |
| EXIF / GPS | 不下发不上屏（home-spec）；本模块不新开字段 |

---

## 9. 动效总表（本模块）

| 交互 | 桶 | 属性 |
|---|---|---|
| 复选 / ✓ / ring | 80–120 | opacity ± 轻 scale |
| 选择栏进/出 | 180 | opacity + 短 translateY |
| 弹层进/出 | 280 / 180 | opacity + 底栏上滑 16px 或桌面 scale(0.98→1) 可选；reduced → 仅 opacity ≤120 |
| Step 切换 | 180 | 交叉淡 |
| 主题卡 hover | 120 | opacity/brightness |
| Toast | 停留 4000（含操作 6000） | — |
| 长按判定 | 450 | — |

禁：width/height/top 布局动画、网格视差、WebGL、Lottie 选中特效。

---

## 10. 验收清单（375 / 768 / 1280）

**路径**

- [ ] 长按/复选/Ctrl·Cmd/Space 进多选；Shift 跨日正确；失败格不可选  
- [ ] 选择栏断点：mobile 仅底栏、desktop 仅顶替顶栏；文案「已选 N」「做成主题相册」  
- [ ] 200 触顶：主钮禁用 + 触顶文案  
- [ ] 弹层两步：三主题各自皮肤；封面为用户衍生图；标题 1–80；隐私句可见  
- [ ] 「生成预览」pending 防双提交；成功跳 preview 且焦点标题；Toast 含标题与张数  
- [ ] attach 失败不跳转，可重试放入；网络/401 文案符合 §7  

**视觉 / a11y**

- [ ] 选中 ≤2px inset ring + ✓；无品牌蒙版；无 3px 压框；缝不被吃  
- [ ] 浮动层可有阴影；网格仍无投影（gaps 刀）  
- [ ] 色值 `--share-*` / color-mix；无 `#b91c1c` / `#166534` / 默认蓝  
- [ ] 弹层焦点陷阱；关闭回触发钮；读屏播报选中数与错误 alert  
- [ ] `prefers-reduced-motion`：无弹簧/无抬起；短 opacity  
- [ ] DOM/`aria-label` 首要信息无原始文件名、无 GPS  

**边界**

- [ ] 未改空库/上传失败文案；未改预览「生成分享链接」；未做侧栏 push；未做 marketing  

---

## 11. 非本次（Out of scope）

| 排除 | 归属 |
|---|---|
| 空库 / 列表失败 / 上传队列失败皮 | `library-empty-upload-fail` |
| 半透顶栏 / Tabs / ring 细则源 | `library-grid-chrome`（本模块只绑验收） |
| gap 2/4/6 · 禁投影墙 | `library-grid-gaps` |
| 上传工作台可收/阴影 | 已落地；本模块只定与选择栏共存 |
| 成册预览 CTA / 图注 / 成功序章 | `album-preview-*` / `share-*` |
| 侧栏 push | W6 OOS |
| 「加入已有相册」/「删除」/「选整月」完整 | P1 |
| `/albums` 无选片裸创建表单重做 | 遗留工具页；W6 主路径是库页建册 |
| Mood Dial / AI 推荐模板 / ML 分面选片 | 后置 |
| Immich 导入 · face/CLIP | 后置 |
| marketing-shell · WebGL | W6 禁 |

---

## 12. 已拍板（didi · 2026-10-19 Asia/Shanghai）

| # | 项 | 决议 |
|---|---|---|
| 1 | 封面 | 时间序第一张有 preview |
| 2 | 标题预填 | 主题 `shareTitle` |
| 3 | 窄屏弹层 | 底贴 88vh 抽屉 |
| 4 | 选择栏 | 断点单挂（mobile 底 / desktop 顶；禁双挂） |
| 5 | `/albums` 裸建 | W6 **完全 OOS** |
| 6 | 「加入已有相册」 | **踢出 W6** |

本文件挂入 `docs/design/album-create-select-flow.md`（设计 docs PR 勿改 app 代码）。

---

## 13. 前端交接（挂靠后）

1. **真源文件：** `library-home.tsx`（选择栏显隐、提交、draft）、`library-create-dialog.tsx`（两步）、`library-grid.tsx`（手势）、`library.css`（栏/弹层/ring）、`lib/library.ts` + `library-api.ts`（上限与 API）。  
2. **优先 diff：** (a) 选择栏断点单挂；(b) 弹层窄屏底贴 + 阴影 token；(c) 封面选取与 §6.2.1 对齐；(d) ring 审计删残留 3px/6%；(e) pending/失败文案与 §7 逐字。  
3. **勿复制** 第二套 Upload / 第二套主题卡组件；主题卡继续 `shareThemeStyle`。  
4. **行为不回退：** `createThemedAlbum` 原子 + attach 重试、`LIBRARY_SELECTION_LIMIT=200`、失败格不可选。  
5. **测试：** 键盘全路径；375/768/1280 截图三主题卡；mock `libraryMock` 可走多选。  
6. **设计挂靠 PR 建议标题：** 见 worker 回传；代码实现可另 PR，仍建议整模块一次合，禁拆半页。

---

## 14. 与既有文档关系

| 文档 | 关系 |
|---|---|
| `library-home-spec` §4–5 | 行为母本；本模块收口视觉/断点/文案/败态并标现状差距 |
| `library-grid-chrome` / `gaps` | 选中与缝的视觉真源；本模块引用不改数字 |
| `library-empty-upload-fail` | 空库/上传败；本模块 §7 只补建册流 |
| `album-preview-cta` | 下游主动词；本模块成功跳转后交接 |
| stealbook #2/#3/#4/#9/#10 | 照片压 chrome · 时长桶 · 浮动层 · 缝 · 失败结构 |
| 仓库 `docs/design/` | 尚无本文件；签后 hang |

---

*文件：`/workspace/design-memora/specs/album-create-select-flow.md`*
