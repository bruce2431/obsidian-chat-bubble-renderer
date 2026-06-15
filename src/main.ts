import {
	Plugin,
	TFile,
	MarkdownView,
	Notice,
} from 'obsidian';
import { DEFAULT_SETTINGS, ChatBubbleSettings, ChatBubbleSettingTab } from './settings';
import { renderChatLog } from './chat-view';

export default class ChatBubblePlugin extends Plugin {
	settings!: ChatBubbleSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'render-chat-bubbles',
			name: '渲染为聊天气泡',
			callback: () => this.renderCurrentView(),
		});

		this.addCommand({
			id: 'close-chat-bubbles',
			name: '退出聊天气泡',
			callback: () => this.closeBubbles(),
		});

		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Escape') this.closeBubbles();
		});

		this.addSettingTab(new ChatBubbleSettingTab(this.app, this));
	}

	renderCurrentView() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) { new Notice('请在 Markdown 文件中使用'); return; }

		const file = view.file;
		if (!(file instanceof TFile)) return;

		const cache = this.app.metadataCache.getFileCache(file);
		const tags = cache?.frontmatter?.tags;
		if (!tags) { new Notice('此文件没有 #聊天记录 标签'); return; }

		const tagArray = Array.isArray(tags) ? tags : [tags];
		if (!tagArray.some((t: string) => t.includes('聊天记录'))) {
			new Notice('此文件没有 #聊天记录 标签'); return;
		}

		if (view.getMode() !== 'preview') {
			new Notice('请先切换到阅读视图（Ctrl+E）'); return;
		}

		const content = view.data;
		if (!content) { new Notice('无法读取文件内容'); return; }

		// Resolve ![[media]] → Obsidian resource URIs
		const resolved = this.resolveMediaLinks(content, file);
		const chatHtml = renderChatLog(resolved);

		this.closeBubbles();

		const overlay = document.body.createDiv('chat-bubble-overlay');
		overlay.style.cssText =
			'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100;' +
			'overflow-y:auto;box-sizing:border-box;' +
			'background:var(--background-primary);';

		const closeBtn = overlay.createDiv('chat-bubble-close');
		closeBtn.innerHTML = '\u2715';
		closeBtn.style.cssText =
			'position:fixed;top:16px;right:20px;z-index:101;' +
			'font-size:22px;color:var(--text-muted);cursor:pointer;' +
			'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
			'border-radius:50%;transition:background .15s;';
		closeBtn.onmouseenter = () => closeBtn.style.background = 'var(--background-modifier-hover)';
		closeBtn.onmouseleave = () => closeBtn.style.background = '';
		closeBtn.onclick = () => this.closeBubbles();

		const contentEl = overlay.createDiv('chat-bubble-content');
		contentEl.innerHTML = chatHtml;
		contentEl.style.cssText = 'max-width:800px;margin:0 auto;padding:40px 20px 80px;';

		new Notice('聊天气泡已开启 | Esc 关闭');
	}

	closeBubbles() {
		document.querySelectorAll('.chat-bubble-overlay').forEach(el => el.remove());
	}

	onunload() { this.closeBubbles(); }

	resolveMediaLinks(content: string, sourceFile: TFile): string {
		// Build a filename→TFile map once (expensive, do once per render)
		const allFiles = this.app.vault.getFiles();
		const nameMap = new Map<string, TFile>();
		for (const f of allFiles) {
			// Map by basename (with ext) for ![[file.mp3]] style links
			nameMap.set(f.name, f);
		}

		return content.replace(/!\[\[(.+?)\]\]/g, (_full: string, linktext: string) => {
			// Try direct filename match first (handles media/ subdirs)
			const match = nameMap.get(linktext);
			if (match) {
				return `![[RESOLVED:${this.app.vault.getResourcePath(match)}]]`;
			}
			// Fallback: Obsidian's native resolution
			const resolved = this.app.metadataCache.getFirstLinkpathDest(linktext, sourceFile.path);
			if (resolved instanceof TFile) {
				return `![[RESOLVED:${this.app.vault.getResourcePath(resolved)}]]`;
			}
			return _full;
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ChatBubbleSettings>);
	}

	async saveSettings() { await this.saveData(this.settings); }
}
