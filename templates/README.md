# W6 可分享 MVP 主题

W6 可分享 MVP 带这三套主题。目录 id 固定为 `cotton-candy`、`kyoto-lantern`、`magazine-heirloom`，不要改名，也不要另加第四套。

| id | 中文名 | 轨 |
|----|--------|----|
| `cotton-candy` | 棉花糖日记 | 情侣可爱 |
| `kyoto-lantern` | 京都纸灯 | 旅行 / 复古 |
| `magazine-heirloom` | 杂志 Heirloom | 编辑 |

每套目录里：

- `theme.json`：完整设计（`tokens`、`slots`、`fillRules`、`decorations`、`shareCopyDefaults`）。`$schema` 指向 `../theme.schema.json`。
- `assets/`：装饰 SVG。对象键前缀是 `templates/{id}/assets/`。

`name` 是 `{ zh, en }`。色板在 `tokens.colors`，不在顶层 `colors`。Web / API 目前不读取这些文件；正式 schema 已允许双语名和 `tokens`。
