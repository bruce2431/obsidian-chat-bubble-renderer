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
