# 分享解锁 · 成功轻序章（字阶 / 间距）· 终稿

> **状态：终稿** · 2026-10-19（Asia/Shanghai）· didi 指派：stealbook **#6**「成功态轻序章」视觉补刀  
> 对照：`share-unlock-mobile-spec.md` §7 · `#45` 解锁动效（已合）· `canva-awards-stealbook.md` §2.9 Preloader as overture / Top **#6**  
> 表面：`/s/[token]` 解锁成功后的 **`ShareGallery` 开场**（挑战→图集交叉淡之后的第一屏）  
> **不改**安全文案、限流、失败同态、密码处理；动效时长桶仍 **80 / 120 / 180 / 280**；仅 `opacity` / `transform`  
> W6 **不做** marketing 落地页；色一律 `--share-*` / `color-mix`；禁 `#b91c1c` / `#166534`

---

## 状态条

| 项 | 约定 |
|---|---|
| 已有 | `#45`：挑战卡淡出 **180** + 图集淡入 **280**；reduced → 短 opacity |
| 本刀 | 成功后图集**字阶 / 间距 / 信息层级**收口（现 `share-gallery.tsx` 多为 inline，权重散） |
| 非本刀 | 挑战态安静 / 错误同态（既有）；三主题纹理（#51）；相册预览侧栏 push（见另文 OOS） |

---

## 1. 目标

| # | Steal 句 | 落到念册 |
|---|---|---|
| A | 序章非 spinner | 解锁后先「认相册」再进照片墙；标题是主角 |
| B | 挑战安静 / 成功有温度 | 成功屏比挑战卡**更松**一档行距与边距，仍克制 |
| C | 文案层级清楚 | kicker → 标题 → 只读说明 → 刷新提示 → 网格，权重递减 |

---

## 2. 信息层级（成功态）

| 层 | 内容 | 字阶 / 色 | 间距 |
|---|---|---|---|
| 0 · 品牌链 | 「念册」回首页 | 0.875rem · `--share-muted` 或 accent 弱链；**勿**抢标题 | 顶安全区下 **24px**（mobile）/ **32px**（≥768）起 |
| 1 · kicker | 主题名（`theme.name`） | 0.75–0.8125rem · letter-spacing 0.08–0.12em · `--share-muted` 或弱 accent | 品牌链下 **20–24px** |
| 2 · 标题 | `share.album.title`（`h1`，焦点落点） | clamp(1.75rem, 5vw, 2.25rem) · weight 600 · `--share-text` · tracking −0.03em | kicker 下 **6–8px**（贴 kicker，勿再大空） |
| 3 · 说明 | 「只读分享。图片地址大约 15 分钟内有效。」 | 0.9375–1rem · lh **1.55–1.65** · `--share-text` · max-width **28–32rem** | 标题下 **12–16px** |
| 4 · 刷新提示 | `refreshHint`（默认可并入说明句；若单独一行） | 0.875rem · `--share-muted` · lh 1.5 | 说明下 **4–8px**；**勿**另起大标题语气 |
| 5 · 照片墙 | 网格 | 见 §3 | 说明块下 **28–32px**（mobile）/ **36–40px**（desktop） |

**禁止：** 成功后再塞营销口号、大 CTA、「恭喜解锁」横幅、与挑战卡同宽的厚白卡片挡照片。

---

## 3. 布局节奏

| 项 | 规格 |
|---|---|
| 页边 | mobile 左右 **1.25rem**；上下底 **≥3rem** 含 safe-area |
| 内容柱 | max-width **60rem**（960）；标题/说明左对齐，勿居中长文 |
| 网格 | 成功墙以照片为主；gap **≥12px**（分享只读墙可略疏于库页 hairline）；圆角跟主题 `radius.card` |
| 文件名行 | 若保留：muted ≤0.8125rem；优先短日期/`照片`，**勿**把原始文件名当主角（对齐 album-preview 图注原则） |
| 入场 | 沿用 #45：整屏 `data-share-state="open"` opacity **280ms**；标题**不**再单独弹跳；cotton 可选 1× sparkle **≤400ms** 且 reduced 关掉 |

---

## 4. 三主题微调（只调权重，不换皮逻辑）

| 主题 | 成功屏注意 |
|---|---|
| cotton-candy | 标题可略圆润字感；说明勿粉洗底；sparkle 仅一次 |
| kyoto-lantern | 深底上标题对比 ≥4.5:1；kicker 金/弱 accent，勿粗金条 |
| magazine-heirloom / heirloom | 标题可略紧 tracking；顶可沿用 1px 金线薄规，**勿**成功横幅 |

---

## 5. 验收（375 / 768）

- [ ] 解锁后焦点在 `h1`；读屏顺序：品牌 → kicker → 标题 → 说明 →（提示）→ 照片  
- [ ] 标题明显大于说明；刷新提示不得看起来像第二标题  
- [ ] 说明 max-width 可读，不拉满 960 宽长行  
- [ ] 与 #45 交叉淡无冲突；reduced-motion 无位移/无 sparkle  
- [ ] 安全：无密码残留；文案不改限流/失败同态约定  
- [ ] 色值 `--share-*` / theme tokens via `shareThemeStyle`，禁硬编码红绿  

---

## 6. 非本次

| 排除 | 归属 |
|---|---|
| 挑战态布局 / 失败同态 | `share-unlock-mobile-spec` |
| 纹理差异 | `theme-textures.md` |
| 成册预览 CTA / 失败全链路 | 前端本轮笔记 9/10 |
| 侧栏 push | **W6 OOS**（见 `album-preview-sidebar-push-oos.md`） |

---

## 7. 前端交接

1. 优先把 `ShareGallery` inline 样式收进 `share-theme.css`（或 `.share-gallery-*`），挂 `--share-*`。  
2. 改皮不改 API / 文案语义；`refreshHint` 可与说明合并为一段，层级仍按 §2。  
3. 本地 typecheck/build 过即可开 PR。  

---

*文件：`specs/share-success-overture.md`*
