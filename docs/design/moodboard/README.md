# 念册 · Moodboard（视觉对标库）

> 本地工作区：`docs/design/moodboard/`  
> 日后挂入仓库目标路径：`docs/design/moodboard/`（由 design lead 挂，**本目录不开 PR**）  
> 配套材料库：`../materials/`  
> 首批焦点：图库空态 / 上传失败 / 未来素材模块（棉花糖 · 京都灯笼 · 杂志传家）

---

## 这套东西怎么用

1. **先过 moodboard，再定稿。** Token 对齐（`--share-*`）只是底线；空态视觉必须对标顶级影像产品，而不是系统默认空壳。
2. **链接优先。** `refs.json` + 本目录 md 是权威索引；第三方截图/动效**默认只存外链**，不落二进制。
3. **有清晰可再分发许可的素材**，才允许进入 `../materials/` 对应文件夹（见 materials README）。无许可 / 仅灵感 → **只留在 moodboard 链接表**，严禁拷进 `assets/`。
4. 每条引用必须含：`source URL` · `license/auth` · `用途`。缺一项不算入档。
5. 对立原则：**偷构图/留白/字号层级/动效节奏/empty 文案语气**；**不偷品牌 chrome、吉祥物、专有插画造型、产品文案原文**。

## 文件地图

| 文件 | 用途 |
|---|---|
| `README.md` | 本说明 + 工作流 |
| `library-empty-fail.md` | 空库 / 上传失败 / 加载失败 的导演级拆解（偷什么 / 不偷什么） |
| `refs.json` | 结构化引用清单（程序可读；挂 `docs/design/moodboard/` 时同步） |

## 与规格文档的关系

- 实现刀：`../library-empty-upload-fail.md` — **定稿须先过本 moodboard**。
- 材料库：`../materials/catalog.md` — 可再分发条目 + 链接型待采条目。

## 审阅节奏（建议）

1. PM / Owner 在 `library-empty-fail.md` 勾选「Top 偷法」是否采纳  
2. Design 把采纳项写进规格验收条  
3. Engineering 只实现已签规格；moodboard 本身不进运行时 bundle
