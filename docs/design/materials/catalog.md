# Materials Catalog · 念册素材索引

> 收录日基准：2026-10-19（Asia/Shanghai）  
> **链接优先。** `local_file: link-only` = 未落二进制。  
> 无许可 / inspiration-only → 详见 `../moodboard/`，**禁止**拷进本目录。

---

## A. 可再分发（许可清晰）

### mat-fx-001 · Paper Shaders Grain Gradient
- **source:** https://shaders.paper.design/grain-gradient
- **repo:** https://github.com/paper-design/shaders
- **license/auth:** Apache-2.0（商业可用；再分发代码库时保留 LICENSE/NOTICE）
- **用途:** 棉花糖空态 soft-blob 底纹 / 纸感噪点参数实验；未来 effects 模块候选实现
- **tags:** grain, blob, shader, cotton-candy, empty-state-bg
- **date:** 2026-10-19
- **local_file:** link-only
- **notes:** 建议参数起点：`shape="blob"`, `noise≈0.2–0.35`, `softness≈0.6`, `speed≤0.4`；`prefers-reduced-motion` 时 `speed=0`。勿用演示高饱和色。

### mat-fx-002 · Paper Shaders Paper Texture（同库）
- **source:** https://github.com/paper-design/shaders（包内 `paper-texture`）
- **license/auth:** Apache-2.0
- **用途:** magazine-heirloom / 京都纸感静帧底；与 Grain Gradient 同库，实现时 pin 版本
- **tags:** paper, texture, magazine-heirloom, kyoto-lantern
- **date:** 2026-10-19
- **local_file:** link-only
- **notes:** 静态纸纹优先于动态；空态阶段弱对比。

---

## B. 仅链接灵感（禁止入库二进制）

> 完整拆解见 `../moodboard/library-empty-fail.md` 与 `refs.json`。此处只做材料库视角的速查。

| id | name | source | license/auth | 用途 | tags | date | local_file |
|---|---|---|---|---|---|---|---|
| mat-ref-glass | Glass 5.0 | https://glass.photo/highlights/refined-and-reflective-glass-5-0 | inspiration-only | 照片压过 chrome | photo-app, chrome | 2026-10-19 | link-only |
| mat-ref-apple | Apple Photos (Gummble) | https://gummble.com/apps/apple-photos-ios | inspiration-only | 空库单 CTA / 留白 | photo-app, empty | 2026-10-19 | link-only |
| mat-ref-ente | Ente empty redesign | https://github.com/ente/ente/commit/b7728bb1bff7a745b3083a5fd995385f1d6d6da7 | inspiration-only | 分情境空态 | photo-app, empty | 2026-10-19 | link-only |
| mat-ref-fillbyte | Fillbyte empty/loading | https://fillbyte.com/blog/the-art-of-empty-states-and-loading-experiences | inspiration-only | 文案与失败出路 | copy, error | 2026-10-19 | link-only |
| mat-ref-linear | Linear empty (Northbase) | https://www.northbase.design/systems/linear/empty-states | inspiration-only | 空态分级 | product-empty | 2026-10-19 | link-only |
| mat-ref-stripe | Stripe empty (Northbase) | https://www.northbase.design/systems/stripe/empty-states | inspiration-only | 零态保结构 | product-empty, fail | 2026-10-19 | link-only |
| mat-ref-sk-sd | SK No SD Card | https://www.awwwards.com/inspiration/404-no-sd-card-sk-photographer-1 | inspiration-only | 摄影隐喻空/错 | metaphor, 404 | 2026-10-19 | link-only |
| mat-ref-felix | Félix Péault | https://www.awwwards.com/sites/felix-peault-photographer | inspiration-only | 系列网格/zoom | gallery, motion | 2026-10-19 | link-only |
| mat-ref-brady | Brady Perron | https://www.awwwards.com/sites/brady-perron | inspiration-only | idle / grid-list | gallery, idle | 2026-10-19 | link-only |
| mat-ref-readymag | Readymag Photography | https://readymag.com/templates/details/6314353 | inspiration-only | 杂志编排 | magazine-heirloom | 2026-10-19 | link-only |
| mat-ref-cargo | Cargo Orion photo | https://cargocollective.com/orion-design/filter/photography/ReadMe | inspiration-only | 编辑画布气质 | editorial | 2026-10-19 | link-only |
| mat-ref-pagecurl | Arc UI Page Curl | https://uiarc.dev/components/page-curl | inspiration-only（许可待核） | 杂志翻页手感 | page-turn | 2026-10-19 | link-only |
| mat-ref-vsco | VSCO empty (Uiland) | https://uiland.design/screens/vsco/screens/1d1c50b3-af07-4860-a9db-3d1c922e6e27/screen-type/empty-state | inspiration-only | 短导入路径 | photo-app, upload | 2026-10-19 | link-only |

---

## C. 我方资产（后续填）

> 现有 decor SVG 在 `../specs/decor/` 与 `../handoff-decor-v1/`；迁入本库时写 `license/auth: own-work`。

| id | name | source | license/auth | 用途 | tags | status |
|---|---|---|---|---|---|---|
| — | soft-blob / envelope / washi… | specs/decor | own-work | 空库插画叠层 | empty-states, cotton-candy | 待 design 决定是否 symlink/copy 到 `empty-states/` |

---

## 统计

- 可再分发条目：2（同属 Paper Shaders，Apache-2.0）
- 仅链接灵感：13
- 本目录二进制文件：0（符合 link-first）
