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

		this.registerDomEvent(activeDocument, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Escape') this.closeBubbles();
		});

		// Auto-render when switching to reading view on tagged files
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.autoRenderIfTagged())
		);
				// Also catch source/preview mode toggle (Ctrl+E)
					this.registerInterval(window.setInterval(() => {
						const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
						if (!activeView) { this.closeBubbles(); return; }
						if (activeView.getMode() !== 'preview') { this.closeBubbles(); return; }
						this.autoRenderIfTagged();
					}, 300));

		this.addSettingTab(new ChatBubbleSettingTab(this.app, this));
	}

		autoRenderIfTagged() {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) { this.closeBubbles(); return; }

			const file = view.file;
			if (!(file instanceof TFile)) { this.closeBubbles(); return; }

			// Already rendered — skip
			if (view.containerEl.querySelector('.chat-bubble-overlay')) return;

			// Only in reading (preview) mode
			if (view.getMode() !== 'preview') { this.closeBubbles(); return; }

			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache?.frontmatter?.tags as string[] | undefined;
			if (!tags) { this.closeBubbles(); return; }

			const tagArray = Array.isArray(tags) ? tags : [tags];
			if (!tagArray.some((t: string) => t.includes('聊天记录'))) { this.closeBubbles(); return; }

			// Auto-render silently
			this.doRender(view);
		}

	async renderCurrentView() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) { new Notice('请在 Markdown 文件中使用'); return; }

		const file = view.file;
		if (!(file instanceof TFile)) return;

		const cache = this.app.metadataCache.getFileCache(file);
		const tags = cache?.frontmatter?.tags as string[] | undefined;
		if (!tags) { new Notice('此文件没有 #聊天记录 标签'); return; }

		const tagArray = Array.isArray(tags) ? tags : [tags];
		if (!tagArray.some((t: string) => t.includes('聊天记录'))) {
			new Notice('此文件没有 #聊天记录 标签'); return;
		}

		if (view.getMode() !== 'preview') {
			new Notice('请先切换到阅读视图（Ctrl+E）'); return;
		}

		new Notice('正在渲染聊天气泡...');
		this.doRender(view);
		new Notice('聊天气泡已开启 | Esc 关闭');
	}

	async doRender(view: MarkdownView) {
		const content = view.data;
		if (!content) return;

		const file = view.file;
		if (!(file instanceof TFile)) return;

		const resolved = await this.resolveMediaLinks(content, file);
		const chatHtml = renderChatLog(resolved);

		this.closeBubbles();

		const overlay = view.containerEl.createDiv({ cls: 'chat-bubble-overlay' });

		const closeBtn = overlay.createDiv({ cls: 'chat-bubble-close' });
		closeBtn.setText('\u2715');
		closeBtn.onclick = () => this.closeBubbles();

		const contentEl = overlay.createDiv({ cls: 'chat-bubble-content' });
		const parser = new DOMParser();
		const chatDoc = parser.parseFromString(chatHtml, 'text/html');
		while (chatDoc.body.firstChild) {
			contentEl.appendChild(chatDoc.body.firstChild);
		}
	}

	closeBubbles() {
		activeDocument.querySelectorAll('.chat-bubble-overlay').forEach(el => el.remove());
	}

	onunload() { this.closeBubbles(); }

	/**
	 * Replace ![[file.ext]] with:
	 *   - images: ![[RESOLVED:app://...]] (resource URI works for <img>)
	 *   - audio/video: ![[RESOLVED:data:audio/...;base64,...]] (base64 data URI)
	 */
	async resolveMediaLinks(content: string, sourceFile: TFile): Promise<string> {
		const allFiles = this.app.vault.getFiles();
		const nameMap = new Map<string, TFile>();
		for (const f of allFiles) nameMap.set(f.name, f);

		const audioExts = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'amr', 'silk'];
		const videoExts = ['mp4', 'webm', 'mov'];

		const replacements: { pattern: string; replacement: string }[] = [];

		// Collect all matches first, then process (regex replace with async is messy)
		const re = /!\[\[(.+?)\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			const linktext = m[1];
			const file = nameMap.get(linktext) ||
				this.app.metadataCache.getFirstLinkpathDest(linktext, sourceFile.path);

			if (!(file instanceof TFile)) continue;

			const ext = file.extension.toLowerCase();

			if (audioExts.includes(ext) || videoExts.includes(ext)) {
				try {
					const buf = await this.app.vault.readBinary(file);
					const mime = ext === 'mp3' ? 'audio/mpeg' :
						ext === 'm4a' ? 'audio/mp4' :
						ext === 'mp4' ? 'video/mp4' :
						ext === 'webm' ? 'video/webm' :
							`${audioExts.includes(ext) ? 'audio' : 'video'}/${ext}`;
					const b64 = this.arrayBufferToBase64(buf);
					const dataUri = `data:${mime};base64,${b64}`;
					replacements.push({ pattern: m[0], replacement: `![[RESOLVED:${dataUri}]]` });
				} catch {
					// Fallback to resource path
					replacements.push({ pattern: m[0], replacement: `![[RESOLVED:${this.app.vault.getResourcePath(file)}]]` });
				}
			} else {
				replacements.push({ pattern: m[0], replacement: `![[RESOLVED:${this.app.vault.getResourcePath(file)}]]` });
			}
		}

		let out = content;
		for (const r of replacements) {
			out = out.replace(r.pattern, r.replacement);
		}
		return out;
	}

	arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ChatBubbleSettings>);
	}

	async saveSettings() { await this.saveData(this.settings); }
}
