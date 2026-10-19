# 念册 · Materials（持久素材库）

> 本地：`/workspace/design-memora/materials/`  
> 日后挂库：与 `docs/design/moodboard/` 并列的材料约定（具体路径由 design lead 定）  
> **他人作品 = 灵感/参考。注明版权。存链接 + 我方笔记/自有捕获；不得主张第三方资产所有权。**

---

## 铁律（Room rules）

1. **优先外链。** `catalog.md` 是主索引；二进制仅在许可明确为 **commercial / redistributable** 时入库。
2. **每条必须有：** `source URL` · `license/auth` · `用途` · `tags` · `date`（收录日）。
3. **无许可条目只进 moodboard 链接表**，**永不**复制到本目录或产品 `assets/`。
4. 我方自绘 SVG / 自摄静帧 / 自录动效：`license = own-work`，仍写清用途与日期。
5. 截营销页公开图：仅当明确 fair-use 笔记用途时，可进 `empty-states/` 并带 sidecar `.txt`（含 source URL）；默认仍用外链。

## 文件夹约定

| 目录 | 放什么 | 不放什么 |
|---|---|---|
| `stills/` | 可再分发静帧、纹理样本、我方拍摄 | App Store 截图、Glass/Apple 品牌页原图 |
| `motion/` | 可再分发短循环、我方录制的交互参考笔记（优先 mp4 链接） | 未授权产品录屏全集 |
| `effects/` | 可再分发 shader/纹理库指针（如 Apache-2.0）、参数笔记 | 破解/刮来的特效包 |
| `ui-chrome/` | 我方 chrome 草图、开源图标子集 | Linear/Stripe 整屏 UI 抠图当资产 |
| `empty-states/` | 空态构图草图、公开页小截图+sidecar（严格许可） | Ente/VSCO 插画文件本体 |

每个子目录有 `README.md`（约定）+ `.gitkeep`（空目录可挂）。

## 条目模板（写入 catalog.md）

```markdown
### {id} · {短名}
- **source:** https://...
- **license/auth:** Apache-2.0 | MIT | own-work | inspiration-only (no redistrib)
- **用途:** 例如：棉花糖空态 blob 动效参数参考 / 杂志翻页节奏
- **tags:** empty-state, grain, washi, ...
- **date:** 2026-10-19
- **local_file:** （无则写 `link-only`）
- **notes:** 一句话：偷什么 / 明确不偷什么
```

## 与 moodboard 的分工

- **moodboard** = 导演意见 + 对标拆解（可收「仅灵感」链接）  
- **materials** = 可被工程/设计反复取用的、许可干净的资产与参数笔记
