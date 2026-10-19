# 分享页 · refresh muted 文案/节奏 · 终稿

> **状态：终稿** · 2026-10-19（Asia/Shanghai）· didi 下一格预告；与 `share-gallery-captions.md` **同模块同 PR**  
> 对照：`share-success-overture.md` §2 层 4「刷新提示」· #59 ShareGallery 落地  
> 表面：解锁成功后说明段旁的 **refresh / 再认证** 弱提示  
> **不改**挑战态、限流文案、密码框；动效桶不变

---

## 1. 目标

| # | 原则 | 落到念册 |
|---|---|---|
| A | 刷新提示 ≠ 第二标题 | 永远 muted、≤说明一档，勿加粗/勿独立大空 |
| B | 一句说清代价 | 默认语气：刷新后可能要再输密码 / 继续查看（沿用产品既有语义，不新造恐吓） |
| C | 能并则并 | 无动态 `refreshHint` 时，可并入说明段末句；有动态 hint 时单独一行 muted |

---

## 2. 文案

| 场景 | 文案 |
|---|---|
| 默认（并入说明） | 说明主句保持「只读分享。图片地址大约 15 分钟内有效。」；后缀可接「刷新页面即可继续查看。」（#59 直链合并态） |
| 动态 `refreshHint`（如需再输密码） | **单独一行**展示服务端/解锁流传入原文（经 `safeUserMessage` 思路：中文、无堆栈）；禁止改成营销句 |
| 禁止 | 「恭喜解锁」「请立即收藏链接」、感叹号堆叠、英文 raw exception |

---

## 3. 节奏（相对说明）

| 项 | 规格 |
|---|---|
| 说明 → 独立 refresh | margin-top **4–8px**（0.25–0.5rem）；现网 `.share-gallery-refresh` **0.375rem** 可保留 |
| 字阶 | **0.875rem** · lh 1.5 · `--share-muted` |
| 说明 | 0.9375–1rem · `--share-text` · max-width 28–32rem（已合则勿动） |
| 与网格 | refresh 仍属说明块；网格上边距仍按 overture（说明块下 28–32 / 36–40） |

---

## 4. 验收

- [ ] 独立 refresh 绝不看起来像 h2；对比度弱于说明  
- [ ] 无 refresh 动态时不出现空 `<p class="share-gallery-refresh">`  
- [ ] 文案无恐吓、无营销、无堆栈  
- [ ] 375/768 抽查：说明与 refresh 间距 ≤8px 视觉

---

## 5. 非本次

- 改 15 分钟 TTL 产品文案政策  
- 重做整段序章字阶（#59）  
- 图注规则（见 `share-gallery-captions.md`）
