# 图库空态 · 上传/失败态 Moodboard

> **群审状态（2026-10-19）**：didi 已签 Top 5 全收；空态/失败终稿见 `docs/design/library-empty-upload-fail.md`。


> 面向：念册 `/library` 空库、列表加载失败、上传抽屉失败行、未来素材模块空壳  
> 原则：对标顶级影像产品，**拒绝**系统默认空洞 / 小学插画 / 原生 Alert  
> 许可：下表均为 **inspiration-only**（无再分发许可）→ 只存链接；勿拷进 `materials/` 或 `assets/`  
> 结构化数据：同目录 `refs.json`

---

## Top 5 必偷（定稿前勾选）

| # | 偷法 | 主参考 | 落到念册 |
|---|---|---|---|
| 1 | **空态 = 情境化 onboarding**，禁止「还没有照片」死胡同文案 | Fillbyte/Kiyo；Linear Projects | 「这里还空着」+ 一句私密承诺 + 单一主 CTA |
| 2 | **首跑空态 ≠ 过滤无结果**，两套 UI/语气 | Ente Photos；open-noodle gallery | 空库 vs 筛选清空，绝不混用「去上传」 |
| 3 | **影像产品：照片永远压过 chrome**；空态插画克制、不抢戏 | Glass 5.0 | soft-blob + envelope 叠层即可，禁止吉祥物占半屏 |
| 4 | **失败要具体、给出路、不责备用户** | Fillbyte error 哲学；Stripe 恢复路径 | 「有照片未能加入」+ 重试/移除；禁堆栈/英文 exception |
| 5 | **摄影语境的空/错隐喻**（SD 卡、底片、信封）而非通用 empty icon | SK Photographer「No SD Card」 | 与棉花糖信封 / 京都灯笼 / 杂志薄线一脉，勿用灰云+加号 |

---

## 引用拆解（14）

### 1. Glass 5.0 — 影像界面退让
- **url:** https://glass.photo/highlights/refined-and-reflective-glass-5-0
- **category:** photo-app / ui-chrome
- **license/auth:** inspiration-only（产品营销文，不可再分发 UI）
- **用途:** `/library` 空态与未来图库 chrome 的「照片压过界面」基准；Liquid Glass 半透明深度节奏参考
- **TAKE:**
  - 导航与控件半透明退让，让影像（或空态插画）成为唯一焦点
  - 过渡/材质细腻，但不为动效而动效
  - 文案克制：产品退场，摄影进场
- **DON'T:** Liquid Glass 系统控件造型、Glass 品牌字标、会员付费门空态的商业话术
- **relevance:** 空库插画必须「轻」；上传抽屉失败态同样不能用厚重错误面板压死照片感

### 2. Apple Photos（iOS 截图库）— Library/Collections 信息架构
- **url:** https://gummble.com/apps/apple-photos-ios
- **category:** photo-app / empty-onboarding
- **license/auth:** inspiration-only（第三方截图库；截图本身无再分发权）
- **用途:** 空库首动作清晰度；Library vs Collections 分栏气质
- **TAKE:**
  - 首动作极度明确（导入/备份类单一 CTA）
  - 大留白 + 小字层级：标题短、说明一行内
  - 空态不伪造缩略图网格（假数据 = 廉价感）
- **DON'T:** iOS 系统 SF Symbol 空态图标整包、Photos 黄调品牌、系统「无项目」默认文案
- **relevance:** 念册空库已有「上传第一批照片」——保持单 CTA，勿加第三按钮

### 3. Ente Photos — 分情境空态插画
- **url:** https://github.com/ente/ente/commit/b7728bb1bff7a745b3083a5fd995385f1d6d6da7
- **category:** photo-app / empty-state
- **license/auth:** inspiration-only（开源仓库代码/资源受其 LICENSE 约束；**插画文件勿直接拷贝进产品**）
- **用途:** 空库 vs 设备权限 vs 共享 分型；小屏可滚动空态
- **TAKE:**
  - Albums / Feed / On-device 各有独立插画与文案，不一套打天下
  - 功能要点用 bullet-row，不写散文
  - 插画重的空态在小屏/大字号下可滚动，不裁切 CTA
- **DON'T:** Ducky 吉祥物造型、Ente 配色与 Outfit 字标
- **relevance:** 念册若加「地点/人物」诚实空壳，必须另起文案与插画权重，勿复用库空态

### 4. Fillbyte / Kiyo — 空态文案与失败诚实度
- **url:** https://fillbyte.com/blog/the-art-of-empty-states-and-loading-experiences
- **category:** product-craft / empty-copy / error
- **license/auth:** inspiration-only（博客论述；可引观点，勿抄产品插画）
- **用途:** `/library` 文案语气；上传失败与衍生失败文案校准
- **TAKE:**
  - 「No photos yet」→ 改成「这空间是干什么的 + 下一步」
  - 错误具体化 + 至少一条出路；禁责备用户
  - 骨架屏优先于 indeterminate spinner（感知更快）
- **DON'T:** Kiyo 效果浏览器 UI、品牌插画
- **relevance:** 直接改写空库副文案与失败汇总条语气（规格已有结构，语气对齐本篇）

### 5. Linear Empty States — 克制分级
- **url:** https://www.northbase.design/systems/linear/empty-states
- **category:** product-empty / craft
- **license/auth:** inspiration-only（UX 拆解站；产品 UI 无再分发权）
- **用途:** 空态「插画级 / 图标级 / 纯文字」分级；过滤无结果用纯文字
- **TAKE:**
  - 首用功能 → illustration + 教育文案 + CTA
  - 搜索/过滤无结果 → text-only，不多余鼓励
  - 外围筛选栏在空态时仍可见（上下文不丢）
- **DON'T:** Linear 插画几何风格、Issue 语义、快捷键文化
- **relevance:** 念册「筛选后无照片」应比首跑空库更瘦；上传失败行用 icon+一行，勿整页插画

### 6. Stripe Dashboard Empty — 零态骨架诚实
- **url:** https://www.northbase.design/systems/stripe/empty-states
- **category:** product-empty / craft
- **license/auth:** inspiration-only
- **用途:** 加载失败/零数据时保留表头与结构；恢复路径用 inline link
- **TAKE:**
  - Dashboard 零态保留轴/表头，显示 0，而不是「一片白」
  - 区块级空态：紧凑居中 + 虚线边界感（文档模式亦见 https://docs.stripe.com/stripe-apps/patterns/empty-state）
  - 覆盖层搜索无结果：短标题 + 支持链，不用大插画
- **DON'T:** Stripe 紫/渐变品牌、Connect 流程图插画、金融文案
- **relevance:** 列表加载失败可保留 `.lib-empty` 壳但去掉插画；衍生失败格虚线框对齐「结构还在」

### 7. SK Photographer — 「No SD Card」隐喻空态
- **url:** https://www.awwwards.com/inspiration/404-no-sd-card-sk-photographer-1
- **category:** gallery-portfolio / empty-metaphor
- **license/auth:** inspiration-only（Awwwards 元素页；站点版权归 BEEM Studio）
- **用途:** 摄影语境的空/错隐喻；404/空库气氛
- **TAKE:**
  - 用摄影器物隐喻替代通用 empty icon
  - 错误页也有美学，不掉出品牌世界
  - 页面过渡本身是内容的一部分
- **DON'T:** 整站字体、BEEM 动效曲线原样、SD 卡插画矢量拷贝
- **relevance:** 念册「信封」路线正确——失败态也可轻触「底片没冲出来」类隐喻，但文案保持口语中文

### 8. Félix Péault Photographer — 系列网格与缩放
- **url:** https://www.awwwards.com/sites/felix-peault-photographer
- **category:** gallery-portfolio / motion
- **license/auth:** inspiration-only
- **用途:** 未来相册预览/素材模块的网格分组与 zoom-to-fill
- **TAKE:**
  - 系列缩略图可交互，zoom 填满屏幕但不丢上下文
  - 信息面板滑入有 push，而非突兀 modal
  - 分组网格节奏：疏密交替，杂志感
- **DON'T:** 荧光绿/蓝品牌色、整站 WebGL 炫技当空态
- **relevance:** 空库阶段克制；有图后的 browse 动效可借「分组 + zoom」

### 9. Brady Perron — Idle 与 Grid/List
- **url:** https://www.awwwards.com/sites/brady-perron
- **category:** gallery-portfolio / idle-motion
- **license/auth:** inspiration-only
- **用途:** 空态微动效上限；grid/list 切换气质
- **TAKE:**
  - Idle 状态有生命力但不打扰
  - Grid/List 切换是内容工具，不是装饰
  - 极简灰白底，让照片说话
- **DON'T:** Group Dynamics 品牌动效包、过长 intro 挡首 CTA
- **relevance:** 空库插画可极慢呼吸（需 `prefers-reduced-motion` 关闭）；规格本刀可不加动画，但 moodboard 预留

### 10. Readymag Photography 模板 — 杂志编排
- **url:** https://readymag.com/templates/details/6314353
- **category:** gallery-portfolio / magazine-heirloom
- **license/auth:** inspiration-only（付费模板；预览可看，资产不可入库）
- **用途:** magazine-heirloom 主题的项目页/精选区块留白与字号
- **TAKE:**
  - 项目页结构清晰：作品 → 精选 → About，动画极简
  - 大图 + 细字说明的杂志层级
  - 转场短、服务于翻阅而非秀技
- **DON'T:** 模板付费插图、默认英文字体搭配原样搬进产品
- **relevance:** 传家主题空态可用细规则线 + 弱标题，而不是棉花糖 blob

### 11. Cargo 影像站气质（Orion 示例 + 平台分析）
- **url:** https://cargocollective.com/orion-design/filter/photography/ReadMe  
  **辅:** https://www.a1.gallery/technology/cargo
- **category:** gallery-portfolio / editorial-layout
- **license/auth:** inspiration-only
- **用途:** 自由画布式编辑感；导航让位于内容
- **TAKE:**
  - 全屏 slideshow 展示媒体；设置按项目可变
  - 排版接近杂志跨页，而非「卡片墙 SaaS」
  - 导航弱化，作品优先
- **DON'T:** Cargo 编辑器 chrome、示例摄影作品文件
- **relevance:** 空库不要做成 SaaS dashboard 空卡片；更接近「一本还没贴照片的册子」

### 12. Paper Shaders · Grain Gradient — 可落地纹理动效
- **url:** https://shaders.paper.design/grain-gradient  
  **源码/许可:** https://github.com/paper-design/shaders （Apache-2.0）
- **category:** motion-effects / grain-blob
- **license/auth:** **Apache-2.0（可商业再分发；再分发代码库时保留 LICENSE/NOTICE）**
- **用途:** 棉花糖 soft-blob / 纸感噪点；空态背景微动参数实验（可进 materials/effects 笔记）
- **TAKE:**
  - `shape="blob"` + `noise` + 低 `speed` → 棉花糖呼吸感
  - 轻量 canvas shader，比 GIF 循环干净
  - 可静态（speed=0）做纸纹底
- **DON'T:** 默认高饱和演示色；勿在 `prefers-reduced-motion` 下强开动画
- **relevance:** 唯一本批**可工程引用**的动效库；空态底纹实验走 materials/effects，不直接依赖第三方 CDN 热链

### 13. Arc UI Page Curl — 杂志翻页交互
- **url:** https://uiarc.dev/components/page-curl
- **category:** motion-effects / magazine-page-turn
- **license/auth:** inspiration-only / check-component-license（实现前核对组件许可；未核清前**只链不拷**）
- **用途:** magazine-heirloom 翻页阴影与动量手感参考
- **TAKE:**
  - 拖拽翻页 + 折痕阴影 + 动量
  - 键盘可达，不只是炫技
- **DON'T:** 未核许可前把组件源码搬进仓库
- **relevance:** 传家主题相册浏览；空库阶段不需要翻页

### 14. VSCO Empty State（Uiland 截图索引）
- **url:** https://uiland.design/screens/vsco/screens/1d1c50b3-af07-4860-a9db-3d1c922e6e27/screen-type/empty-state
- **category:** photo-app / empty-state
- **license/auth:** inspiration-only（截图库）
- **用途:** 创作者工具空库的低对比插画 + 导入路径
- **TAKE:**
  - 低对比占位，不抢未来滤镜气质
  - 导入路径短：+ → 选图 → Import
  - 空态也保持 Studio 的「暗房」气氛
- **DON'T:** VSCO 滤镜预览墙、品牌字标、社区 feed 空态话术
- **relevance:** 上传抽屉的「开始感」——动作路径短，失败后回到同一路径

---

## 念册三主题空态调性（导演便签）

| 主题 | 空态气质 | 可借 | 禁区 |
|---|---|---|---|
| cotton-candy | 软、空隙大、信封轻叠 | soft-blob 呼吸、暖粉灰 | 儿童贴纸堆满 |
| kyoto-lantern | 夜色余韵、一点暖光 | 弱光晕、克制和风纹 | 浮世绘满幅、鸟居 emoji |
| magazine-heirloom | 纸白、细线、字号像刊头 | 薄规则线、页边距 | 报纸噪点糊一脸 |

## 明确不做

- 假缩略图墙「假装有内容」
- 系统默认 empty icon + 「暂无数据」
- 把 Linear/Stripe 插画当品牌资产
- 未许可二进制入库
