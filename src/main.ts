import {
	Plugin,
	TFile,
	MarkdownView,
	Notice,
} from 'obsidian';
import { DEFAULT_SETTINGS, ChatBubbleSettings, ChatBubbleSettingTab } from './settings';
import { renderChatLog, FileMeta, setupChatBubbleEvents, initLocationMaps, destroyLocationMaps } from './chat-view';

export default class ChatBubblePlugin extends Plugin {
	settings!: ChatBubbleSettings;
	private rendering = false;
	private nameMap: Map<string, TFile> = new Map();

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
			if (evt.key === 'Escape') {
				// Close overlay modals first, then the bubble view itself
				const modals = activeDocument.querySelectorAll(
					'.chat-media-overlay, .chat-file-overlay, .chat-forward-overlay'
				);
				if (modals.length > 0) {
					modals.forEach(el => el.remove());
				} else {
					this.closeBubbles();
				}
			}
		});

		// Auto-render on tab switch (with brief delay for metadata to load)
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				window.setTimeout(() => this.autoRenderIfTagged(), 100);
			})
		);
		// Catch source/preview mode toggle (Ctrl+E) — debounced to avoid resize spam
		let layoutTimer: number | null = null;
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				if (layoutTimer) window.clearTimeout(layoutTimer);
				layoutTimer = window.setTimeout(() => this.autoRenderIfTagged(), 200);
			})
		);

		this.addSettingTab(new ChatBubbleSettingTab(this.app, this));

		// Cache vault file name→TFile mapping, kept in sync via events
		// Uses first-registered semantics — duplicate filenames won't overwrite
		this.rebuildNameMap();
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (file instanceof TFile && !this.nameMap.has(file.name)) this.nameMap.set(file.name, file);
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile) {
				// Only remove if no other file with the same name exists
				if (!this.app.vault.getFiles().some(f => f.name === file.name && f.path !== file.path)) {
					this.nameMap.delete(file.name);
				}
			}
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) {
				const oldName = oldPath.split('/').pop() || '';
				this.nameMap.delete(oldName);
				if (!this.nameMap.has(file.name)) this.nameMap.set(file.name, file);
			}
		}));
	}

		/** Check if a file has the #聊天记录 frontmatter tag */
		private isChatLog(file: TFile): boolean {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache?.frontmatter?.tags as string[] | string | undefined;
			if (!tags) return false;
			const tagArray = Array.isArray(tags) ? tags : [tags];
			return tagArray.some((t: string) => t.includes('聊天记录'));
		}

		autoRenderIfTagged() {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) { this.closeBubbles(); return; }

			const file = view.file;
			if (!(file instanceof TFile)) { this.closeBubbles(); return; }

			// Only in reading (preview) mode — close if not
			if (view.getMode() !== 'preview') { this.closeBubbles(); return; }

			// Already rendered — skip
			if (view.containerEl.querySelector('.chat-bubble-overlay')) return;

			if (!this.isChatLog(file)) { this.closeBubbles(); return; }

		void this.doRender(view);
		}

		async renderCurrentView() {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) { new Notice('请在 Markdown 文件中使用'); return; }

			const file = view.file;
			if (!(file instanceof TFile)) return;

			if (!this.isChatLog(file)) {
				new Notice('此文件没有 #聊天记录 标签'); return;
			}

			if (view.getMode() !== 'preview') {
				new Notice('请先切换到阅读视图（Ctrl+E）'); return;
			}

			new Notice('正在渲染聊天气泡...');
			await this.doRender(view);
			new Notice('聊天气泡已开启 | esc 关闭');
		}

		async doRender(view: MarkdownView) {
			if (this.rendering) return;
			this.rendering = true;
			try {
				const content = view.data;
				if (!content) return;

				const nameMap = this.nameMap;
				const { resolvedContent, fileMetas } = await this.processContent(content, nameMap);
				const chatHtml = renderChatLog(resolvedContent, fileMetas, this.settings.selfNames);

				this.closeBubbles();

				const overlay = view.containerEl.createDiv({ cls: 'chat-bubble-overlay' });
					const contentEl = overlay.createDiv({ cls: 'chat-bubble-content' });
					const parser = new DOMParser();
					const chatDoc = parser.parseFromString(chatHtml, 'text/html');
					while (chatDoc.body.firstChild) {
						contentEl.appendChild(chatDoc.body.firstChild);
					}
					setupChatBubbleEvents(contentEl);
				initLocationMaps(contentEl);
			} finally {
				this.rendering = false;
			}
		}

	closeBubbles() {
			activeDocument.querySelectorAll('.chat-bubble-overlay').forEach(el => { destroyLocationMaps(el as HTMLElement); el.remove(); });
		}

	onunload() { this.closeBubbles(); }

	private rebuildNameMap() {
		this.nameMap.clear();
		for (const f of this.app.vault.getFiles()) {
			// First file with a given name wins — duplicates skipped
			if (!this.nameMap.has(f.name)) this.nameMap.set(f.name, f);
		}
	}

		/**
		 * Single-pass: collect file attachment metas + resolve all ![[file]] links
		 * (audio→base64 data URI, images/video/docs→resource URI).
		 */
		async processContent(content: string, nameMap: Map<string, TFile>): Promise<{ resolvedContent: string; fileMetas: FileMeta[] }> {
				const audioExts = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'amr', 'silk'];
				const fileExts = /\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|7z)\b/i;
				const re = /!\[\[(.+?)\]\]/g;

				const metas: FileMeta[] = [];
				interface Segment { index: number; pattern: string; pending: Promise<string> }
				const segments: Segment[] = [];
				let m: RegExpExecArray | null;

				while ((m = re.exec(content)) !== null) {
					const linktext = m[1];
					const file = nameMap.get(linktext);
					if (!file) continue;

					const pattern = m[0];
					const index = m.index;

					// Collect file attachment metadata (PDF, DOC, etc.)
					if (fileExts.test(linktext)) {
						const size = this.formatFileSize(file.stat.size);
						const url = this.app.vault.getResourcePath(file);
						metas.push({ name: linktext, size, url });
					}

					const ext = file.extension.toLowerCase();

					const pending: Promise<string> = audioExts.includes(ext)
						? (async () => {
							try {
								const buf = await this.app.vault.readBinary(file);
								const mime = ext === 'mp3' ? 'audio/mpeg' :
									ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`;
								const b64 = this.arrayBufferToBase64(buf);
								return `![[RESOLVED:data:${mime};base64,${b64}]]`;
							} catch {
								return `![[RESOLVED:${this.app.vault.getResourcePath(file)}]]`;
							}
						})()
						: Promise.resolve(`![[RESOLVED:${this.app.vault.getResourcePath(file)}]]`);

					segments.push({ index, pattern, pending });
				}

				// Await all async, then build result by slicing between match positions — no second regex pass
				const resolved = await Promise.all(segments.map(s => s.pending.then(r => ({ index: s.index, pattern: s.pattern, replacement: r }))));
				let resolvedContent = '';
				let lastIdx = 0;
				for (const r of resolved) {
					resolvedContent += content.slice(lastIdx, r.index) + r.replacement;
					lastIdx = r.index + r.pattern.length;
				}
				resolvedContent += content.slice(lastIdx);

				return { resolvedContent, fileMetas: metas };
				}

			formatFileSize(bytes: number): string {
			if (bytes < 1024) return bytes + 'B';
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
			return (bytes / (1024 * 1024)).toFixed(1) + 'M';
			}

			arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		const CHUNK = 4096;
		const parts: string[] = [];
		for (let i = 0; i < bytes.length; i += CHUNK) {
			const chunk = bytes.subarray(i, i + CHUNK);
			let chunkStr = '';
			for (let j = 0; j < chunk.length; j++) {
				chunkStr += String.fromCharCode(chunk[j]);
			}
			parts.push(chunkStr);
		}
		return btoa(parts.join(''));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ChatBubbleSettings>);
	}

	async saveSettings() { await this.saveData(this.settings); }
}
