# 相册预览 · 侧栏 push · W6 结论（OOS）

> **状态：W6 不做** · 2026-10-19（Asia/Shanghai）· didi 要结论：进 W6 则挂刀，不进写 OOS  
> 对照：stealbook **#7**「组间呼吸 + zoom-to-fill + **可选**侧栏 push」· `#50` 已合呼吸/zoom · Frame.io / Félix info push  

---

## 结论

**侧栏 push（元信息板从侧推开网格）不进 W6。**

理由（执行向）：

1. steal #7 已把 push 标成**可选**；W6 成片主战场以 `#50` 组间呼吸 + zoom-to-fill 收口即可感知「杂志节奏」。  
2. owned 预览本轮前端优先：**CTA 单主动词** + **失败全链路**（didi 笔记 9/10）；再开 push 会与工具栏/灯箱抢交互面。  
3. 移动端侧栏 push 需折叠策略与安全区，工期与回归面大于收益；桌面可后补。  
4. 与老板「列任务、快执行」一致：砍可选、保已签刀落地。

---

## W6 已覆盖（相关）

| 项 | 状态 |
|---|---|
| 组间呼吸 + zoom-to-fill | `#50` 已合 |
| 成册预览 CTA / 壳 / 图注等 | `album-preview-tweaks.md` + 前端跟笔记 9 |
| 分享成功轻序章字阶 | `share-success-overture.md`（并行挂） |

---

## 以后若做（非本里程碑）

- 桌面：右侧 info 板 push，网格 `transform` 让位；仅 opacity/transform；默认收起。  
- 移动：改为底抽或全屏 meta，**不做**侧推挤网格。  
- 内容：拍摄日 / 张数 / 主题名；不泄文件名。  
- 另开刀稿与 PR；本文件保持 OOS 标记直至 didi 改口。

---

## 前端 / 编程

- **勿**在 W6 开侧栏 push 实现或半成品开关。  
- 评审遇到 Félix「info panel push」引用 → 指向本文。

---

*文件：`specs/album-preview-sidebar-push-oos.md`*
