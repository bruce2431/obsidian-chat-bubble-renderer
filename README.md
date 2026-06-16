---
创建日期: 2026-06-15T16:40:00
最后一次修改: 2026-06-16 11:19
---

# Chat Bubble Renderer

> Render Markdown chat logs as WeChat-style bubble dialogs directly in Obsidian.
> 将带有 `#聊天记录` 标签的 Markdown 文件自动渲染为微信风格气泡对话框。

![Obsidian Downloads](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian)
![Version](https://img.shields.io/github/v/release/bruce2431/obsidian-chat-bubble-renderer)

## Features

1. **Auto-detect** — Files tagged with `聊天记录` or `chat` in YAML frontmatter are identified automatically
2. **Parse** — Standard message headers `[Sender] YYYY-MM-DD HH:MM:SS`, quoted replies, merge-forward cards, and Obsidian internal links `![[file.ext]]`
3. **Render** — 
   - Others (left): gray bubbles
   - Yourself (right): themed-color bubbles (WeChat green by default)
   - Quoted replies with gray reference bar
   - Merge-forward cards: preview first 3 lines + click to expand
   - Images/audio/video embedded inline
4. **Theme-aware** — Automatically follows Obsidian's dark/light theme
5. **Fullscreen overlay** — Press `Ctrl+P` → "Render as Chat Bubbles" / "Exit Chat Bubbles"; works in both edit and reading views

## Usage

Tag your Markdown file with `tags: [类别/聊天记录]` or `tags: [chat]`, then open it in Obsidian and run `Ctrl+P` → "Render as Chat Bubbles".

### Chat Log Format

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

## Installation

### From Obsidian Community Plugin Store (recommended)
Search "Chat Bubble Renderer" in Obsidian settings → Community plugins → Browse.

### Manual
1. Clone this repo
2. `npm install && npm run build`
3. Copy `main.js`, `styles.css`, `manifest.json` to your vault's `.obsidian/plugins/chat-bubble-renderer/`
4. Enable in Obsidian settings
5. Configure your own display name(s) in plugin settings (defaults: bruceMTY, 我, me, 自己)

## Development

```bash
npm install       # Install dependencies
npm run dev       # Watch mode
npm run build     # Production build
npm run lint      # ESLint
```

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Self Identifiers | Comma-separated list of names that identify "you" in chat logs | bruceMTY, 我, me, 自己 |

## License

MIT

---

# LOG

| [2026-06-15-16:40] | 项目创建，从 obsidianmd/obsidian-sample-plugin 复制模板 |
| [2026-06-15-16:42] | 完成 chat-parser.ts（解析 YAML 跳过、消息头、引用回复、合并转发） |
| [2026-06-15-16:43] | 完成 chat-view.ts（气泡渲染、Obsidian 内部链接转换、HTML 转义） |
| [2026-06-15-16:43] | 完成 main.ts（MarkdownPostProcessor 注册，检测 #聊天记录 标签） |
| [2026-06-15-16:43] | 完成 styles.css（微信风格气泡样式、深浅主题自适应） |
| [2026-06-15-16:44] | 完成 settings.ts（自定义"自己"标识名） |
| [2026-06-15-16:44] | 构建成功（tsc ✅ → esbuild ✅），v1.0.0 就绪 |
| [2026-06-15-16:45] | 修复：砍掉 vaultBasePath 参数，renderChatLog 简化为单参数 |
| [2026-06-15-17:05] | 重构：从 post-processor 改为 Ctrl+P 命令手动触发渲染，避免 Obsidian section 分块触发问题 |
| [2026-06-15-17:10] | 修复：用 view.data 替代 cachedRead，避免中文路径 ENOENT 错误 |
| [2026-06-15-17:15] | 样式修复：对方气泡改为 #f2f3f5（微信灰），自己气泡改为 #95ec69（微信绿+黑字） |
| [2026-06-15-17:20] | 滚动修复：改替换 .markdown-preview-sizer（保留滚动容器结构），force overflow-y |
| [2026-06-15-17:20] | 可用：Ctrl+P → 渲染为聊天气泡，在阅读视图下工作正常 |
| [2026-06-15-17:30] | 滚动持久化修复：改为独立 fixed 全屏 overlay（position:fixed; z-index:10），不再替换 Obsidian DOM |
| [2026-06-15-17:30] | 自适应界面：全屏铺满，气泡居中 max-width:800px，底部留白 80px |
| [2026-06-15-17:30] | 退出机制：右上角 ✕ 按钮 + Ctrl+P「退出聊天气泡」命令 + onunload 自动清理 |
| [2026-06-15-17:35] | 重构：零触碰 Obsidian DOM，纯 fixed overlay 挂在 document.body |
| [2026-06-15-17:40] | docs: README 示例去真实姓名，用「自己」「对方」替代；push to GitHub |
| [2026-06-15-17:45] | fix: esbuild CRLF 破坏 '\\n' — 全改用 String.fromCharCode(10) |
| [2026-06-15-17:50] | fix: ![[媒体文件]] 通过 vault.getResourcePath 转为 Obsidian app:// URI |
| [2026-06-15-17:55] | fix: 媒体全 vault 文件名 map 搜索（getFirstLinkpathDest 跨目录解析不全） |
| [2026-06-15-18:00] | refactor: 纯媒体消息不套气泡直接渲染 |
| [2026-06-15-18:10] | fix: audio/video 文件读为 base64 data URI（绕过 app:// 协议限制） |
| [2026-06-15-18:15] | fix: isMediaOnly 识别 RESOLVED: 前缀 |
| [2026-06-15-18:20] | fix: data URI 检测改用 MIME 前缀 data:audio/\|data:video/\|data:image/ |
| [2026-06-15-22:00] | feat: 系统消息（撤回/拍一拍/进群等）居中浅灰渲染 |
| [2026-06-15-20:10] | fix: HEADER_RE 支持 [] 空发送者（系统消息） |
| [2026-06-15-20:20] | fix: 短文本气泡自适应宽度（fit-content） |
| [2026-06-15-20:30] | fix: 跳过空白 body 行，补 .amr .silk 语音格式识别 |
| [2026-06-16-11:19] | 准备上架 Obsidian 社区市场：完善 manifest.json，更新 README（英文+中文） |
