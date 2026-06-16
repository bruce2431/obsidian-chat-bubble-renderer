# Chat Bubble Renderer

> Render Markdown chat logs as WeChat-style bubble dialogs directly in Obsidian.
> 将聊天记录渲染为微信风格气泡对话框。

[![Release](https://img.shields.io/github/v/release/bruce2431/obsidian-chat-bubble-renderer?include_prereleases&style=flat)](https://github.com/bruce2431/obsidian-chat-bubble-renderer/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **Auto-detect** — Files tagged with `聊天记录` or `chat` are identified automatically
- **Parse** — Standard message headers `[Sender] YYYY-MM-DD HH:MM:SS`, quoted replies, merge-forward cards, and Obsidian internal links `![[file.ext]]`
- **Render** — WeChat-style bubbles: others left (gray), yourself right (green); quoted replies with gray bar; merge-forward cards with click-to-expand; images/audio/video inline
- **Theme-aware** — Follows Obsidian's dark/light theme automatically
- **Fullscreen overlay** — `Ctrl+P` → "Render as Chat Bubbles" / "Exit Chat Bubbles"

## Usage

Tag your Markdown file with `tags: [聊天记录]`, then `Ctrl+P` → "Render as Chat Bubbles".

### Chat Log Format

```markdown
---
tags:
  - 聊天记录
---

[自己] 2026-06-15 08:00:00
早上好

[对方] 2026-06-15 08:01:00
早！今天有什么安排？
```

See the [example chat log](#) or the in-plugin help for full format support (quote replies, merge-forward, splat, etc.).

## Installation

**Community Plugin Store**: Search "Chat Bubble Renderer" in Obsidian → Community plugins.

**Manual**: `npm install && npm run build` → copy `main.js`, `styles.css`, `manifest.json` to `.obsidian/plugins/chat-bubble-renderer/`.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Self Identifiers | Names that identify "you" in chat logs | bruceMTY, 我, me, 自己 |

## License

MIT
