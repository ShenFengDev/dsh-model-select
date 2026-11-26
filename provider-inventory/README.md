# Provider inventory

A Host-only, read-only DSH bundle that registers the `provider_inventory` tool. It answers "which model providers do I have, which plugins provide them, and where do they overlap" without changing anything.

## Usage

Call the tool in any session:

- `action: "overview"` (default) — every provider with display name, settings namespace, model count, plus configured providers with no live adapter.
- `action: "models", provider: "<id>", offset, limit` — one provider's model ids, paged.
- `action: "plugins", keyword, offset, limit` — installed plugin entries (module name, title, enabled, fiber phase), optionally keyword-filtered.
- `action: "diagnostics"` — duplicate display names, configured-but-unattached providers, adapters without settings entries, per-provider errors, and model ids reachable through two or more providers (top 50 by provider count).

Everything is read-only: the tool reads the `llm` and `pluginManager` services and never writes profile state.

只读的模型供应商清单工具。用法：overview 列出全部供应商与模型数量；models 分页查看单个供应商的模型；plugins 按关键字筛选已装插件；diagnostics 报告重复显示名、配置不匹配与多供应商重复提供的模型 ID。
