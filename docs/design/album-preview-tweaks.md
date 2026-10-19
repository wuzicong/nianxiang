# 成册预览页微调清单（owned `/albums/[id]/preview`）

> 代码位置：`apps/web/src/app/albums/[albumId]/preview/`、`apps/web/src/app/preview/album-stage.tsx`。

> 对照：`AlbumStage` + `OwnedPreviewChrome`（main `ad66a4b` 后）与既有截图  
> `bc-ba7dd1d9…` / `bc-c1eecabc…`。样张 `/preview` 不在本清单范围。  
> 原则：**视觉/交互微调**，不改灌版算法与槽位 schema。

---

## P0 · 路径与壳

1. **壳态上肤**  
   loading / 401 / 空册 / 全 pending 仍走 `.preview-index`（硬编码 `#fafaf7` + 默认蓝链），与进入 `AlbumStage` 后的主题壳割裂。  
   → 已知 `themeId` 时用 `shareThemeStyle(themeSkin(id))` + `.share-shell`；未知时用 `DEFAULT_THEME_ID`。链接/按钮一律 `--share-*`，禁止浏览器默认蓝。

2. **主 CTA「生成分享链接」**  
   成册预览是 W6 主路径终点，工具栏只有「返回这本 / 同主题样张」。  
   → intro 或 sticky 工具栏加主按钮「生成分享链接」→ `/albums/[id]` 分享区（或现有 create-share 锚点）。次按钮保留「返回这本」。

3. **工具栏信息层级（owned）**  
   「同主题样张」视觉权重过高（像标题）。  
   → 降为 `layout-note` 级文字链；`故事/翻页` 固定右端；品牌屑左端。mobile ≤640：第一行屑+主 CTA，第二行版式切换。

---

## P1 · 版面细节

4. **图注不泄文件名**  
   owned 目前 `captionFromFilename`，测试图会出现 `photo-1` 等。  
   → 有拍摄日用短日期（如 `2024.5`）；否则空 caption / 不渲染 figcaption。文件名不进 DOM、不进 `alt` 首要信息（`alt` 可用「相册里的一张照片」）。

5. **空槽视觉**  
   缺图时勿呈现高饱和色块。  
   → `.frame` 虚线边 + `--share-border` 底；文案保持「预览生成后出现在这里」；`figcaption`「空位」用 muted，字号 ≤ 0.8rem。

6. **跳入焦点**  
   从图库「生成预览」进入后，焦点落到页面 `h1`（相册标题），与 library-home-spec §8 一致。

7. **壳 ↔ 舞台过渡**  
   chrome 与 `AlbumStage` 背景同 token，避免加载结束闪一帧硬白；spinner 在 `prefers-reduced-motion: reduce` 下静态。

---

## P2 · 移动端与 polish

8. **故事锚点条**  
   `slot-nav` 芯片过多时横向可滑，不换行撑高 intro；当前页锚点 `aria-current`。

9. **翻页控件**  
   底栏加 `env(safe-area-inset-bottom)`；按钮热区 ≥ 44px（≤640 已部分做到，补安全区即可）。

10. **杂志主题顶栏**  
    magazine-heirloom 顶栏与正文同色实底已 OK；确认 owned 主 CTA 在该主题下用 `--share-text` 实心、白字，勿粉嫩 pill。

---

## 非本次（明确不做）

- 翻页物理引擎 / Mood Dial / 地图真轨迹  
- 改三套 `theme.json` 槽位顺序或文案模板  
- 样张页 `/preview` 大改（仅要求 owned 与样张视觉语言一致）

---

## 验收（设计侧）

- [ ] 401 / loading / 有图故事 / 翻页，四态截图：375 · 768 · 1280 × 三主题  
- [ ] 工具栏可见「生成分享链接」，一键进分享创建  
- [ ] 页上无原始文件名、无默认蓝链  
- [ ] 空槽无高饱和色块  
