# 念册 · Canva / Awards Steal Book（视觉与交互）

> 研究日：2026-10-19（Asia/Shanghai）  
> 角色：设计大神 · 研究臂 · **仅视觉/交互/素材**，不开 PR、不改 app 代码  
> 产品：念册·Memora（nianxiang）— 私密图库 / 主题相册（棉花糖 · 海风 · 传家杂志）  
> 约束已签：情境空 ≠ 过滤空；照片压过 chrome；失败=具体+路径+不责备；摄影隐喻；`--share-*`；禁硬编码 `#b91c1c`/`#166534`；三主题；MVP CPU only；人脸/CLIP 后置


> **群审状态（2026-10-19）**  
> ① marketing 落地页：**W6 不做**，只升产品内 UI（老板拍）  
> ② 预览动效 MVP：**只 CSS** opacity/transform + 80/120/180/280ms + `prefers-reduced-motion`；WebGL 仅参考  
> ③ 海风主题资产树：**对齐 kyoto-lantern** 命名  
> 下一刀范围：产品内（网格 chrome / 动效时长桶 / 三主题纹理）；`marketing-shell` 映射降为附录，不排前端刀。


---

## 0. 怎么用这份书

1. **偷构图、节奏、字号层、动效时长、空态语气、媒体优先 chrome** — 不偷品牌、吉祥物、原文案、Logo。
2. 每条 pattern 映射到念册表面：`library-empty` · `upload-drawer` · `grid` · `album-preview` · `share-unlock` · `marketing-shell`（若做落地页）。
3. 落地刀见文末 **Top 10 优先推荐**；群分享用精简版见父代理回传 bullet。

---

## 1. Sources studied

| # | Source | URL | 看了什么 |
|---|---|---|---|
| 1 | Canva Homepage | https://www.canva.com/ | Hero「What will you design today?」、工具 Tab、模板墙、重复 CTA、生态模块 |
| 2 | Canva SaaS Pattern Breakdown | https://www.saaspattern.com/en/website-breakdowns/canva-com | Home/Pricing/Signup/Trust 转化拆解；unsupported-browser 出路 |
| 3 | Canva Glow Up | https://www.canva.com/newsroom/news/glow-up/ | 浮动对象面板、内容作英雄、工具栏按选中建议、Star 工作区 |
| 4 | Canva Design Trends 2026 | https://www.canva.com/design-trends/ | Imperfect by Design：Texture Check / Opt Out / Explorecore / Notes App Chic |
| 5 | Linear Empty (Northbase) | https://www.northbase.design/systems/linear/empty-states | 插画/图标/纯文字四级空态 |
| 6 | Linear DESIGN.md + Refresh | https://www.webdesignhot.com/design.md/linear/ · https://linear.app/now/behind-the-latest-design-refresh | 时长桶、阴影规则、导航退让 |
| 7 | Stripe Empty | https://www.northbase.design/systems/stripe/empty-states · https://docs.stripe.com/stripe-apps/patterns/empty-state | 零态保结构、短恢复链 |
| 8 | Framer Marketing | https://www.framer.com/ · https://bestsaaswebdesigns.com/site/framer | 浮动真控件 hero、双 CTA、滚动深度 |
| 9 | Framer Parallax Notes | https://www.framer.com/blog/parallax-scrolling-examples/ | 视差适用边界、transform/opacity、reduced-motion |
| 10 | VSCO Darkroom craft | https://github.com/Meliwat/awesome-ios-design-md/blob/main/design-md/social/vsco/DESIGN.md | 照片唯一彩色、gapless 网格、hairline 控件 |
| 11 | Frame.io V4 | https://blog.frame.io/2024/05/21/frame-io-v4-web-app-beta-feature-focus-new-design-smooth-navigation/ | 可折叠面板、媒体中心、网格密度 |
| 12 | Adam Bricker SOTD | https://www.awwwards.com/sites/adam-bricker | 双色极简、预加载、摄影全屏叙事 |
| 13 | Battuta Album Scroll | https://www.awwwards.com/sites/in-the-footsteps-of-battuta | 滚动=相册导航、overlay menu |
| 14 | Félix Péault HM | https://www.awwwards.com/sites/felix-peault-photographer | 系列网格、zoom-to-fill、info panel push |
| 15 | Glass / Apple / Ente / Fillbyte / SK SD / Brady / Readymag / Cargo / Paper Shaders / Arc Page Curl | 见 `../moodboard/refs.json` 既有条目 | 空态与材质基线（上轮 moodboard） |
| 16 | Immich empty album PR | https://github.com/immich-app/immich/pull/2604 | **反例**：功能按钮堆叠空态 |

---

## 2. Steal patterns by source

### 2.1 Canva Homepage + SaaS Pattern

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Outcome-first CTA** | Hero 问「今天做什么」+ 单一高对比「开始设计」 | 降低「选产品」决策，直达价值 | `library-empty`：单主 CTA「上传第一批照片」；`marketing-shell`：卖「收好私密相册」而非功能列表 |
| **Template-led self-segmentation** | 按交付物（社媒/视频/演示）分入口，非按工具 | 用户只认结果类型 | `marketing-shell`：按主题（棉花糖/海风/传家）入口；`album-preview`：主题卡即入口 |
| **Real output visuals** | 展示真实成品图，非抽象 UI 线框 | 质量信号 + 自我映射 | `marketing-shell` / 空库 decor：真实照片隐喻（信封、撕边）而非 SaaS 插画人 |
| **Repeated CTA at scroll depths** | 多深度同一动词 CTA | 不同滚动深度的人都能转化 | `marketing-shell`；应用内勿滥 — 仅空库/抽屉顶栏各一处主 CTA |
| **Friction with clear exits** | Unsupported browser 列出具体浏览器 + 移动端 App | 障碍 + 出路 = 信任 | `upload-drawer` 失败行 / `share-unlock` 错误态：具体原因字段 + 重试/换浏览器级出路（不责备） |

### 2.2 Canva Glow Up Editor

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Floating chrome, content hero** | 浅色浮动对象面板，画布变大 | 内容占视口，工具不抢戏 | `grid` / `album-preview`：顶栏/Tabs 半透模糊退让（已有 `--share-*` blur 方向） |
| **Context-suggested tools** | 工具栏按选中元素推荐相关动作 | 减少「找功能」负担 | `upload-drawer`：选中失败项 → 推荐「重试 / 移除」；多选栏上下文动作 |
| **Starred workspace** | Star 重要设计/文件夹 | 习惯路径缩短 | 未来「置顶相册」；MVP 可只偷视觉：空库旁「最近」弱入口 |
| **More space, less chrome** | 「nothing gets in your way」 | 溢出生意感变专注 | `grid`：gap 小、边框弱；`album-preview`：照片满幅优先 |

### 2.3 Canva Design Trends 2026（气质轴，非照搬插画）

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Texture Check** | 可触感纹理：纸、噪点、撕边 | 影像产品需要「物」的温度 | 棉花糖 soft-blob + washi；传家 thin-rule/金线；海风纸纹弱噪 |
| **Opt Out Era** | 结构化极简、去噪音 | 工具页安静 | `library` 工具皮：少分隔线、弱对比边框（对齐 Linear refresh） |
| **Explorecore** | 分层叙事 + 有目的动效 | 动效服务故事而非装饰 | `album-preview` / `share-unlock` 成功后：轻入场 opacity+8px，禁无意义循环 |
| **Notes App Chic** | 诚实、手作、不完美 | 私密相册气质 | 空库文案口语化；decor 不「完美矢量吉祥物」 |

### 2.4 Linear（空态 + 动效系统）

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Empty tiering** | 首用=插画+教育+CTA；过滤=纯文字；错误=像错误 | 避免四类空态一套皮 | `library-empty` vs 筛选无结果 vs 加载失败 — **已签，继续守** |
| **Duration buckets** | 80 / 120 / 180 / 280ms | 阈值门槛下响应感 | 全产品微交互默认；`prefers-reduced-motion` → 仅 opacity |
| **Shadow only on floating UI** | 卡片无阴影，popover/modal/toast 才有 | 表面实、不「漂」 | `grid` 缩略无投影；`upload-drawer` 抽屉可多层中性阴影 |
| **Nav recedes** | 侧栏/标签比主内容更暗更弱 | 「未赢得的注意力不抢」 | 顶栏/Tabs 弱于照片网格；隐私徽标静音 |

### 2.5 Stripe Empty / Docs Pattern

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Structure remains at zero** | 零数据仍保留表头/轴 | 不「整页白死」 | 列表加载失败：保留 `.lib-empty` 壳，去掉大插画 |
| **Compact block empty + dashed feel** | 区块空态紧凑居中 | 局部失败不吞整页 | 衍生失败格虚线框 |
| **Inline recovery** | 短标题 + 支持/重试链 | 出路可见 | `upload-drawer` 汇总条；`share-unlock` 错误态次要链接 |

### 2.6 Framer Marketing + Parallax craft

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Floating real UI as proof** | Hero 浮入真实产品面板 | 比平面截图更可信 | `marketing-shell`：浮入真实主题相册预览卡（非假数据） |
| **Primary / secondary CTA pair** | 白主按钮 + 灰次按钮 | 决策清晰 | 空库：主「上传」+ 次「了解隐私」（若需要） |
| **Subtle scroll coupling** | 背景 80–90% 速、前景略快；只用 transform/opacity | 深度感不伤性能 | `marketing-shell` / 主题切换；**应用内网格禁视差**（任务页） |
| **Reduced-motion static fallback** | 动效关则静态构图仍可读 | 可达 + CPU MVP | 全局约定 |

### 2.7 VSCO Darkroom

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Photo is only color** | Chrome 单色；彩色只来自照片 | 影像产品身份 | `album-preview` / 全屏灯箱：chrome 走 `--share-*` 中性；主题色仅 decor/边框点缀 |
| **Gapless / hairline grid** | Studio 满铺、1px 缝 | 照片密度=专业感 | `grid` mobile 2px / desktop 6px 已定 — 保持「缝」感勿卡片化 |
| **Selection = ring not brand fill** | 白环选中 | 不染色照片 | 多选态：描边/角标，勿半透明品牌色蒙版过重 |
| **Chrome as thin band** | 控件 ≤底栏薄带 | 呼吸边距留给照片 | 灯箱/预览底栏；上传抽屉顶栏薄 |

### 2.8 Frame.io V4

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Toggleable panels** | 左/中/右面板可关 → 全沉浸 | 多任务 vs 专注切换 | `upload-drawer` 可收；`album-preview` 元信息侧栏可折叠 |
| **User-tunable card density** | Card Size / Aspect | 用户控制密度 | 未来设置；MVP 用断点列数即可 |
| **Instant + infinity feel** | 网格即时可滚、无限感 | 大库不「分页焦虑」 | 虚拟滚动已定 — UI 上避免「第 N 页」控件 |

### 2.9 Awwwards：Adam Bricker / Battuta / Félix Péault

| Pattern | 是什么 | 为什么有效 | → 念册表面 |
|---|---|---|---|
| **Two-ink photography** | #F0F2F1 / #020202 双色衬影像 | 极简让照片说话 | 传家/海风预览页；勿在工具库页强行全黑 |
| **Preloader as overture** | 预加载是序章非 spinner | 情绪进入 | `share-unlock` → 成功后轻序章（短），CPU-only：opacity 交叉淡 |
| **Scroll = album navigation** | 滚动位置驱动相册页 | 身体感翻阅 | `album-preview` 纵向章节；营销「翻相册」叙事 |
| **Zoom-to-fill + push info** | 缩略 zoom 填屏；信息板 push | 不失上下文的放大 | 灯箱打开；详情抽屉从侧 push 网格 |
| **Grouped photo density rhythm** | 分组网格疏密交替 | 杂志呼吸 | 时间轴日组间距 > 组内缝 |

### 2.10 Immich（NEGATIVE）

| Anti-pattern | 是什么 | 为什么不学 | → 念册 |
|---|---|---|---|
| **Empty = action icon rack** | 空相册只堆添加/分享/删除 | 无情境、无隐喻、像后台工具 | **禁止**作为空库正例；对照用 |

---

## 3. Explicit DO NOT steal

| 类别 | 禁止项 |
|---|---|
| **Canva** | 紫/渐变品牌色、Canva 字标、Affinity/Disney/Marvel 联名视觉、「Start designing」等原文、Magic* 产品名、编辑器侧栏图标整包 |
| **Linear / Stripe / Framer** | 品牌 indigo/紫/电蓝、Issue 语义图标、金融文案、GT Walsheim 原样 |
| **VSCO / Frame.io / Apple / Glass** | 滤镜码与字标、Adobe 审片话术、SF Symbol 空态整包、Liquid Glass 系统控件造型、会员门控话术 |
| **Awwwards 作品** | 摄影原片、工作室字标、WebGL 炫技作空态默认 |
| **Immich** | 图标堆叠空态布局、AGPL UI 资产 |
| **通用** | 吉祥物占半屏、伪造缩略图网格、责备用户的错误文案、硬编码 `#b91c1c` / `#166534` |

---

## 4. Top 10 prioritized recommendations（下一刀视觉）

| Rank | 推荐 | 主参考 | 落点 | 理由 |
|---|---|---|---|---|
| **1** | **空态分级落地验收**（情境插画 vs 过滤纯文字 vs 失败具体出路） | Linear + Fillbyte + 已签 moodboard | `library-empty` / filter / fail | 已签原则，下一刀必须「验得出」 |
| **2** | **照片压过 chrome**：半透顶栏 + 无投影缩略 + 选中描边而非染色蒙版 | Glass + VSCO + Canva Glow Up | `grid` / `album-preview` | 影像产品身份句 |
| **3** | **微交互时长桶**（80/120/180/280）+ reduced-motion | Linear DESIGN.md | 全局 | CPU MVP 友好、体感统一 |
| **4** | **上传抽屉 = 浮动工作台**：薄顶栏、失败行上下文动作、可收起 | Canva floating panel + Frame.io panels | `upload-drawer` | 转化与恢复同屏 |
| **5** | **主题纹理差异化**（Texture Check）：棉花糖噪点 blob / 海风纸纹 / 传家金线薄规 | Canva Trends + Paper Shaders + 己方 decor | 空库 + unlock 挑战态 | 三主题可感知差异，不动代码逻辑 |
| **6** | **分享解锁：挑战态安静 / 成功态轻序章** | Adam Bricker preloader + Stripe 短错误 | `share-unlock` | 安全文案不变；视觉分层 |
| **7** | **相册预览翻阅节奏**：组间呼吸 + zoom-to-fill + 可选侧栏 push | Félix + Battuta | `album-preview` | 成片「美」的主战场 |
| **8** | **营销壳（若做）Outcome CTA + 真实主题预览浮层** | Canva home + Framer floating proof | `marketing-shell` | **需老板拍板是否做落地页** |
| **9** | **网格密度与「缝」**：保持 gapless 气质，禁卡片投影墙 | VSCO Studio + Frame.io density | `grid` | 避免做成网盘 |
| **10** | **失败态结构保留**：虚线格 / 壳还在 / inline 重试 | Stripe empty | load-fail / derivative-fail | 与「不责备」文案同捆 |

---

## 5. Steal axes checklist（对齐 brief）

| 轴 | 偷到了吗 | 关键摘录 |
|---|---|---|
| Layout rhythm | ✓ | 组间疏、组内密；营销模块块状；工具页安静 |
| Type hierarchy | ✓ | 短标题 + 一行说明；工具页字号偏紧（Linear） |
| Empty / onboarding | ✓ | 四级空态；Immich 作反例 |
| Hover / scroll coupling | ✓ | 卡片 hover 不位移；营销可轻视差；应用内网格禁 |
| Soft shadows / blur | ✓ | 阴影仅浮动层；吸顶 blur 已在 library-home-spec |
| Micro-motion | ✓ | 时长桶；Explorecore「有目的」 |
| Media-first chrome | ✓ | VSCO / Glow Up / Glass |
| CTA hierarchy | ✓ | 单主 CTA；主/次对 |
| Failure recovery UX | ✓ | 具体 + 路径 + 结构保留 |

---

## 6. Ambiguity for boss

1. **是否做 `marketing-shell` 落地页？** Top 8 大量依赖此决策；若「仅 in-app」，把 Canva/Framer 的 Outcome CTA 收束到空库与主题选择弹层即可。  
2. **相册预览是否允许轻 WebGL/大动效？** 建议 MVP：**否**（CPU only）；Awwwards 动效作上限参考，实现用 CSS opacity/transform。  
3. **海风主题正式名**（sea-breeze vs kyoto-lantern 资产树）：视觉刀按现有 `themes/` + `theme-pack-pr/` 双轨对齐，避免串皮。

---

*文件：`/workspace/design-memora/research/canva-awards-stealbook.md`*
