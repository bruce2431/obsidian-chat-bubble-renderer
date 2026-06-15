---
创建日期: 2026-06-15T16:40:00
最后一次修改: 2026-06-15T16:44:00
---

# Pj4-聊天记录气泡渲染插件

**类型**：Obsidian 社区插件

**功能**：将带有 `#聊天记录` 标签的 Markdown 文件自动渲染为微信风格的气泡对话框格式

**灵感来源**：Pj1-李京瑾行为模拟/SubPj4-时间线工具（v3/v4 中实现了微信风格渲染）

**项目状态**：v1.0.0 可用

## 项目结构

```
Pj4-聊天记录气泡渲染插件/
├── README.md               # 本文件
├── src/                    # 插件源码
│   ├── main.ts             # 插件入口 — post-processor 注册
│   ├── chat-parser.ts      # 聊天记录解析器（YAML跳过、header、quote-reply、merge-forward）
│   ├── chat-view.ts        # 气泡对话框渲染（HTML生成、Obsidian 内部链接转换）
│   └── settings.ts         # 设置界面（自定义"自己"标识名）
├── manifest.json           # Obsidian 插件清单
├── package.json            # 依赖管理
├── esbuild.config.mjs      # 构建配置
├── styles.css              # 微信风格气泡样式（深色/浅色主题自适应）
├── tsconfig.json           # TypeScript 配置
├── version-bump.mjs        # 版本号递增脚本
└── versions.json           # 版本兼容性映射
```

## 功能

1. **识别**：自动检测 YAML frontmatter 中 `tags` 包含 `聊天记录` 或 `chat` 的文件
2. **解析**：
   - 标准消息头 `[发送者] YYYY-MM-DD HH:MM:SS`
   - 引用回复 `> 发送者(wxid_xxx) MM-DD HH:MM`
   - 合并转发卡片 `[合并转发|标题]`
   - Obsidian 内部链接 `![[文件名.ext]]`（图片/音频/视频）
3. **渲染**：
   - 对方消息靠左（灰底），自己消息靠右（主题色）
   - 引用回复带灰色引用条
   - 合并转发卡片：预览 3 条 + 点击展开全文
   - 图片/音频/视频内嵌播放
4. **自适应**：自动跟随 Obsidian 的深色/浅色主题

## 聊天记录格式

预期的 Markdown 输入格式：

```markdown
---
tags:
  - 类别/聊天记录
---

## 2026-06-15

[自己] 2026-06-15 08:00:00
早上好

[对方] 2026-06-15 08:01:00
早！今天有什么安排？

[对方] 2026-06-15 08:02:00
> 自己(wxid_xxx) 06-15 08:00
> 早上好
> > [引用]
刚醒，还没想好

[自己] 2026-06-15 08:05:00
[合并转发|聊天记录]
   自己 2026-06-15 08:03
  发了个表情包
    对方 2026-06-15 08:03
  哈哈笑死
    对方 2026-06-15 08:04
  这是哪部番
```

## 聊天记录渲染

聊天记录将自动渲染为微信风格气泡对话框：

- 对方（左）：灰色气泡 + 左下圆角
- 自己（右）：主题色气泡 + 右下圆角
- 引用回复：灰色引用条
- 合并转发：卡片预览+展开

## 安装方法

1. 构建：`npm run build`（生成 `main.js` + `styles.css`）
2. 复制 `main.js`、`styles.css`、`manifest.json` 到 vault 的 `.obsidian/plugins/chat-bubble-renderer/`
3. 在 Obsidian 设置中启用插件
4. 在设置中配置"自己"的标识名称（默认为 bruceMTY, 我, me, 自己）

## 开发

```bash
npm install       # 安装依赖
npm run dev       # 开发模式（watch）
npm run build     # 构建生产版本
npm run lint      # ESLint 检查
```

# LOG

[2026-06-15-16:40]: 项目创建，从 obsidianmd/obsidian-sample-plugin 复制模板
[2026-06-15-16:42]: 完成 chat-parser.ts（解析 YAML 跳过、消息头、引用回复、合并转发）
[2026-06-15-16:43]: 完成 chat-view.ts（气泡渲染、Obsidian 内部链接转换、HTML 转义）
[2026-06-15-16:43]: 完成 main.ts（MarkdownPostProcessor 注册，检测 #聊天记录 标签）
[2026-06-15-16:43]: 完成 styles.css（微信风格气泡样式、深浅主题自适应）
[2026-06-15-16:44]: 完成 settings.ts（自定义"自己"标识名）
[2026-06-15-16:44]: 构建成功（tsc ✅ → esbuild ✅），v1.0.0 就绪
[2026-06-15-16:45]: 修复：砍掉 vaultBasePath 参数，renderChatLog 简化为单参数
[2026-06-15-17:05]: 重构：从 post-processor 改为 Ctrl+P 命令手动触发渲染，避免 Obsidian section 分块触发问题
[2026-06-15-17:10]: 修复：用 view.data 替代 cachedRead，避免中文路径 ENOENT 错误
[2026-06-15-17:15]: 样式修复：对方气泡改为 #f2f3f5（微信灰），自己气泡改为 #95ec69（微信绿+黑字）
[2026-06-15-17:20]: 滚动修复：改替换 .markdown-preview-sizer（保留滚动容器结构），force overflow-y
[2026-06-15-17:20]: 可用：Ctrl+P → 渲染为聊天气泡，在阅读视图下工作正常
[2026-06-15-17:30]: 滚动持久化修复：改为独立 fixed 全屏 overlay（position:fixed; z-index:10），不再替换 Obsidian DOM；sizer 用 height:0 隐藏而非 display:none（避免内部 "content div not found" 警告）
[2026-06-15-17:30]: 自适应界面：全屏铺满，气泡居中 max-width:800px，底部留白 80px
[2026-06-15-17:30]: 退出机制：右上角 ✕ 按钮 + Ctrl+P「退出聊天气泡」命令 + onunload 自动清理
[2026-06-15-17:35]: 重构：零触碰 Obsidian DOM（不隐藏 sizer），纯 fixed overlay 挂在 document.body，z-index:100；Obsidian 底部任意重绘不影响气泡；Esc 键退出
[2026-06-15-17:40]: docs: README 示例去真实姓名，用「自己」「对方」替代；push to GitHub
[2026-06-15-17:45]: fix: esbuild CRLF 破坏 '\\n' — 全改用 String.fromCharCode(10) / split(/\\r?\\n/)
[2026-06-15-17:50]: fix: ![[媒体文件]] 通过 vault.getResourcePath 转为 Obsidian app:// URI 加载