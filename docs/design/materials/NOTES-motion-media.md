# NOTES · Motion / Video / GIF（授权候选 · 链接优先）

> 2026-10-19（Asia/Shanghai）  
> 原则：**不下载专有二进制**；本文件只记「值得以后授权/采购」的模式与来源。  
> MVP：**CPU only** — 优先 CSS / 轻量 canvas shader；Lottie/视频作 post-MVP 候选。  
> 配套：`catalog.md` · `../moodboard/refs.json` · `../research/canva-awards-stealbook.md`

---

## 1. 念册需要的运动类型（按优先级）

| Pri | 类型 | 表面 | MVP 实现倾向 | 授权需求 |
|---|---|---|---|---|
| P0 | 微交互（hover/press/drawer） | grid, upload-drawer | CSS 80–280ms | 无（自制） |
| P0 | 空态轻呼吸 / 静态纸纹 | library-empty | Paper Shaders `speed=0` 或极低速 | Apache-2.0 已可用 |
| P1 | 入场交叉淡（unlock→gallery） | share-unlock success | CSS opacity + 8px Y | 无 |
| P1 | 主题纹理循环（可选） | empty decor | canvas grain loop ≤15fps | 开源优先 |
| P2 | 相册翻页阴影/动量 | album-preview heirloom | 自研或授权 page-curl | 核 Arc UI 许可前不拷 |
| P2 | 营销 hero 产品预览循环 | marketing-shell | 自录产品屏 / 授权库存 | 若外购需商用许可 |
| P3 | 预加载「序章」短片 | share / marketing | 自研静帧序列；禁重 WebGL | 摄影素材需授权 |

---

## 2. 开源 / 可再分发（优先采购清单之前）

| id | Name | URL | License | 用途 | 备注 |
|---|---|---|---|---|---|
| fx-paper-grain | Paper Shaders — Grain Gradient | https://shaders.paper.design/grain-gradient | Apache-2.0 | 棉花糖空态 blob+噪点 | `speed≤0.4`；reduced-motion → 0 |
| fx-paper-tex | Paper Shaders — Paper Texture | https://github.com/paper-design/shaders | Apache-2.0 | 传家/海风纸感 | 静态优先 |
| motion-lottie-free | LottieFiles Free (Simple License) | https://lottiefiles.com/ | Lottie Simple License（Free 区；商用通常可，**逐条核对**） | 轻量空态/加载示意 | 过滤 Free；Marketplace 付费另议 |
| motion-lottie-blur | Free Blur Effect Animations | https://lottiefiles.com/free-animations/blur | 同上（逐条） | soft blur 氛围 | 勿用高饱和演示色 |
| motion-lottie-tex | Free Texture Animations | https://lottiefiles.com/free-animations/texture | 同上（逐条） | 纸/布纹微动 | MVP 可先静态 SVG |

**工程约束：** Lottie 播放器有 JS 成本；MVP 空库优先 **己方 SVG decor + CSS**，Lottie 作增强开关。

---

## 3. Inspiration-only（禁止下载入库）

| Name | URL | 偷什么（节奏） | 勿偷 |
|---|---|---|---|
| Adam Bricker elements | https://www.awwwards.com/sites/adam-bricker | Pre-loader 作序章；Photography 全屏节奏 | 视频原片、Three.js 默认空态 |
| Battuta album scroll | https://www.awwwards.com/sites/in-the-footsteps-of-battuta | 滚动驱动翻页感 | WebGL 全景包 |
| Félix Péault gallery | https://www.awwwards.com/sites/felix-peault-photographer | zoom-to-fill、info push 时长 | 品牌荧光、整站动效包 |
| Framer parallax guide | https://www.framer.com/blog/parallax-scrolling-examples/ | 层速 80–90%；transform only | Framer 品牌片 |
| Canva animations marketing | https://www.canva.com/（Animations 模块话术） | 「照片动画」作为相册预览微动上限参考 | Canva 动画资产、模板 |
| Arc UI page curl | https://uiarc.dev/components/page-curl | 折痕阴影 + 动量手感 | **许可未核前不拷源码** |
| Brady Perron idle | https://www.awwwards.com/sites/brady-perron | Idle 上限：有生命不打扰 | 过长 intro |

---

## 4. 商用库存（以后授权再采 · 未下载）

> 以下为**候选检索方向**，采购前由 design lead 确认商用条款与发票主体。

| 方向 | 示例检索 / 入口 | License 字段（采购时填） | 用途 |
|---|---|---|---|
| 纸纹 / 胶片颗粒 loop | Depositphotos / Shutterstock 搜 `paper texture loop` `film grain overlay 4k` | Standard / Extended（填采购单） | 传家/棉花糖空态底；**需无水印预览链即可，不落库** |
| 柔焦光斑 / 海面微浪 | 同上搜 `soft bokeh loop` `sea foam abstract` | 同上 | 海风主题氛围（营销壳） |
| 信封/撕纸转场（库存动态） | Motion Array / Envato Elements（若已有订阅） | 订阅条款 | 空库→有图转场参考；优先自研 SVG |
| 抽象 soft blur Lottie 付费包 | LottieFiles Marketplace | Marketplace license | 仅当 Free 区不够用 |

**采购门禁：**  
1. 条款允许 **App / SaaS UI 内嵌**  
2. 不要求露出供应商 Logo  
3. 可再导出到客户端（Web）  
4. 录入 `catalog.md` §A 后再允许下载到 `materials/motion/`

---

## 5. 自制优先（零授权）

| 资产 | 现状 | 动效建议 |
|---|---|---|
| `specs/decor/soft-blob.svg` | own-work | CSS `opacity` 呼吸 4–6s，amplitude 极低 |
| `specs/decor/envelope.svg` | own-work | 入场 180ms translateY(8px)→0 |
| `specs/decor/washi-tape.svg` | own-work | 静态；hover 时微旋转 ≤2° |
| `specs/decor/torn-edge.svg` | own-work | 静态遮罩 |
| `specs/decor/sparkle.svg` | own-work | 场景 Tab 空态；偶发闪烁 ≤2 点，禁满屏 |

---

## 6. 明确不做（MVP）

- 自动播放有声视频背景  
- Immich 式「空页面堆图标」配弹跳  
- Canva 式模板墙无限滚动作图库空态  
- 未核许可的 page-curl 源码拷贝  
- 下载 Awwwards 作品 MP4 进仓库  

---

## 7. 下一步（授权流程草稿）

1. Design 在本 NOTES 勾选要试的 **P1/P2** 条目  
2. 开源：直接进 `catalog.md` §A + pin 版本  
3. 库存：老板批准预算 → 采购 → 登记 license 字段 → 才允许二进制落入 `materials/motion/`  
4. 工程：所有循环动效挂 `prefers-reduced-motion: reduce` 静态回退  

---

*文件：`/workspace/design-memora/materials/NOTES-motion-media.md`*
