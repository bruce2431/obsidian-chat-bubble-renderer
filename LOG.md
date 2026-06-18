---
创建日期: 2026-06-15T16:40:00
| 最后一次修改: 2026-06-19 00:39
---

# Chat Bubble Renderer — 开发日志

> 内部 LOG，公开 README 见 [README.md](README.md)

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
| [2026-06-15-17:15] | 样式修复：对方气泡 #f2f3f5（微信灰），自己气泡 #95ec69（微信绿+黑字） |
| [2026-06-15-17:20] | 滚动修复：改替换 .markdown-preview-sizer（保留滚动容器结构） |
| [2026-06-15-17:20] | 可用：Ctrl+P → 渲染为聊天气泡，在阅读视图下工作正常 |
| [2026-06-15-17:30] | 滚动持久化：fixed 全屏 overlay（position:fixed; z-index:10），不再替换 Obsidian DOM |
| [2026-06-15-17:30] | 自适应界面：全屏铺满，气泡居中 max-width:800px，底部留白 80px |
| [2026-06-15-17:30] | 退出机制：右上角 ✕ 按钮 + Ctrl+P「退出聊天气泡」命令 + onunload 自动清理 |
| [2026-06-15-17:35] | 重构：零触碰 Obsidian DOM，纯 fixed overlay 挂在 document.body |
| [2026-06-15-17:40] | docs: README 示例去真实姓名，用「自己」「对方」替代；push to GitHub |
| [2026-06-15-17:45] | fix: esbuild CRLF 破坏 '\n' — 全改用 String.fromCharCode(10) |
| [2026-06-15-17:50] | fix: ![[媒体文件]] 通过 vault.getResourcePath 转为 Obsidian app:// URI |
| [2026-06-15-17:55] | fix: 媒体全 vault 文件名 map 搜索（getFirstLinkpathDest 跨目录解析不全） |
| [2026-06-15-18:00] | refactor: 纯媒体消息不套气泡直接渲染 |
| [2026-06-15-18:10] | fix: audio/video 文件读为 base64 data URI |
| [2026-06-15-18:15] | fix: isMediaOnly 识别 RESOLVED: 前缀 |
| [2026-06-15-18:20] | fix: data URI 检测改用 MIME 前缀 |
| [2026-06-15-22:00] | feat: 系统消息居中浅灰渲染 |
| [2026-06-15-20:10] | fix: HEADER_RE 支持 [] 空发送者 |
| [2026-06-15-20:20] | fix: 短文本气泡自适应宽度（fit-content） |
| [2026-06-15-20:30] | fix: 跳过空白 body 行；补 .amr .silk 语音格式 |
| [2026-06-16-11:19] | 准备上架：完善 manifest.json，更新 README |
| [2026-06-16 12:05] | SubPj1-上架社区市场：新建上架子项目 |
| [2026-06-16 12:10] | release.yml 修复：移除 --draft；Release v1.0.0 创建 |
| [2026-06-16 12:16] | fork obsidianmd/obsidian-releases → bruce2431/obsidian-chat-bubble-renderer-releases |
| [2026-06-16 12:24] | 发现新提交流程：community.obsidian.md 取代旧 PR 方式 |
| [2026-06-16 12:30] | 修复：tag v1.0.0 → 1.0.0（去掉 v 前缀，匹配 manifest.json version） |
| [2026-06-16 12:37] | fix: deploy 脚本清理本地路径隐私泄露 |
| [2026-06-16 12:52] | v1.0.1：修复审核 7 个问题（innerHTML→DOMParser, style→CSS class, activeDocument, setHeading, unused vars, description 标点） |
| [2026-06-16 12:56] | v1.0.2：修复 settings heading 含插件名/"settings" 字样 + any-typed tags |
| [2026-06-16 13:05] | v1.0.3：移除 settings heading（General 也不允许） |
| [2026-06-16 13:15] | 拆分 README → README.md（公开）+ LOG.md（内部日志） |
| [2026-06-19-00:39] | 引用渲染重构：简化解析器 regex、quote bar 移至气泡下方独立换行；wetrace2md 回滚为单行引用格式；README 添加 exp.png |
