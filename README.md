# DSH Local Plugins

两个本地 DeepSeek Harness (DSH) 插件的源码备份，从回收站恢复后集中打包，便于版本管理与分享。

Two local DeepSeek Harness (DSH) plugins, recovered from the Recycle Bin and collected here for version control and sharing.

## 插件清单 / Plugins

| 目录 | 包名 | 类型 | 功能 |
|---|---|---|---|
| [`provider-inventory/`](provider-inventory/) | `@local/provider-inventory` | Host | 只读工具 `provider_inventory`：列出模型供应商、模型数量、插件条目，并诊断重复显示名、配置不匹配与多供应商重复模型 |
| [`model-picker-resizer/`](model-picker-resizer/) | `@local/model-picker-resizer` | Client (Web) | 放大对话模型选择器，支持拖动移动、右下角把手调整尺寸，尺寸与位置持久化到 `localStorage` |

两者均为 `private: true` 的本地 link 插件，通过 profile 的 `package.json` 以 `link:` 方式加载，不属于 npm 官方包。

## 安装 / Install

在 DSH profile 的 `package.json` 中加入依赖（路径按本机实际情况调整）：

```json
{
  "dependencies": {
    "@local/provider-inventory": "link:F:/minecraft/mod coding/provider-inventory",
    "@local/model-picker-resizer": "link:F:/minecraft/mod coding/model-picker-resizer"
  },
  "dsh": {
    "profile": {
      "bundles": ["@local/provider-inventory", "@local/model-picker-resizer"]
    }
  }
}
```

或在会话中调用（路径换成仓库内对应目录）：

```
plugin_manager install_bundle  <此仓库路径>/provider-inventory
plugin_manager install_bundle  <此仓库路径>/model-picker-resizer
```

安装后重启 DSH / 刷新 Web GUI 使 Client bundle 生效。

## 目录结构 / Layout

```
dsh-local-plugins/
├── README.md
├── provider-inventory/
│   ├── README.md
│   ├── package.json
│   ├── index.js            # Host 工具实现
│   ├── cordis.patch.yml    # bundle 注入声明
│   ├── icon.svg
│   └── locale/             # en.json, zh.json
└── model-picker-resizer/
    ├── README.md
    ├── package.json
    ├── index.js            # Host 侧 no-op
    ├── client.js           # Client 侧 UI 行为
    ├── cordis.patch.yml
    ├── icon.svg
    └── locale/             # en.json, zh.json
```

## 兼容性 / Compatibility

- 面向 DSH 0.2.3-alpha.2 的 plugin / bundle 规范。
- `provider-inventory` 依赖 `@deepseek-ai/dsh-tools` 提供的 `defineTool` 与 `tools` / `llm` / `pluginManager` 服务。
- `model-picker-resizer` 为纯 Client 插件（`dsh.client.platform: web`），在 Desktop Electron 与 Web GUI 共用同一渲染层。

## 许可 / License

源码按原样备份，未附加额外许可声明。
