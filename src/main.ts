import {
	Plugin,
	TFile,
	MarkdownView,
	Notice,
} from 'obsidian';
import { DEFAULT_SETTINGS, ChatBubbleSettings, ChatBubbleSettingTab } from './settings';
import { renderChatLog, FileMeta } from './chat-view';

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

					// Build vault file lookup once
					const nameMap = this.buildNameMap();

					const fileMetas = await this.buildFileMetas(content, nameMap);
					const resolved = await this.resolveMediaLinks(content, nameMap);
					const chatHtml = renderChatLog(resolved, fileMetas);

		this.closeBubbles();

		const overlay = view.containerEl.createDiv({ cls: 'chat-bubble-overlay' });

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

	buildNameMap(): Map<string, TFile> {
		const map = new Map<string, TFile>();
		for (const f of this.app.vault.getFiles()) map.set(f.name, f);
		return map;
	}

		/**
		 * Build FileMeta[] for document attachments (PDF, DOC, etc.)
		 */
		async buildFileMetas(content: string, nameMap: Map<string, TFile>): Promise<FileMeta[]> {
			const metas: FileMeta[] = [];
			const fileExts = /\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|7z)\b/i;
			const re = /!\[\[(.+?)\]\]/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(content)) !== null) {
				const linktext = m[1];
				if (!fileExts.test(linktext)) continue;

				const file = nameMap.get(linktext);
					if (!file) continue;

				const size = this.formatFileSize(file.stat.size);
				const url = this.app.vault.getResourcePath(file);
				metas.push({ name: linktext, size, url });
			}
			return metas;
		}

		formatFileSize(bytes: number): string {
			if (bytes < 1024) return bytes + 'B';
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
			return (bytes / (1024 * 1024)).toFixed(1) + 'M';
		}

		/**
		 * Replace ![[file.ext]] with:
	 *   - images: ![[RESOLVED:app://...]] (resource URI works for <img>)
	 *   - audio/video: ![[RESOLVED:data:audio/...;base64,...]] (base64 data URI)
	 */
	async resolveMediaLinks(content: string, nameMap: Map<string, TFile>): Promise<string> {
		const audioExts = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'amr', 'silk'];
		const videoExts = ['mp4', 'webm', 'mov'];

		const replacements: { pattern: string; replacement: string }[] = [];

		const re = /!\[\[(.+?)\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			const linktext = m[1];
			const file = nameMap.get(linktext);
			if (!file) continue;

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
		const CHUNK = 4096;
		const parts: string[] = [];
		for (let i = 0; i < bytes.length; i += CHUNK) {
			const chunk = bytes.subarray(i, i + CHUNK);
			parts.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
		}
		return btoa(parts.join(''));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ChatBubbleSettings>);
	}

	async saveSettings() { await this.saveData(this.settings); }
}
