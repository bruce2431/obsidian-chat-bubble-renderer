/**
 * Chat View - 气泡对话框渲染器
 * 将解析后的聊天消息渲染为微信风格气泡 UI
 * 媒体文件（图片/音频/视频）不套气泡，直接渲染
 * 文件附件（PDF/DOC等）渲染为卡片，点击弹窗预览
 * 链接卡片（[链接|...]）渲染为微信风格链接卡片
 * 引用回复：quote bar 在气泡外侧（对方在上，自己在下）
 *
 * 交互通过事件委托处理（setupChatBubbleEvents），
 * 不在 HTML 中嵌入 onclick — 安全且可维护。
 */

import { parseChatLog, MergeForward, LinkCard, LocationCard, LOCATION_RE } from './chat-parser';
import maplibregl from 'maplibre-gl';

const NL = String.fromCharCode(10);
const locationMaps = new WeakMap<HTMLElement, maplibregl.Map>();

/** 系统消息正则 — 匹配则渲染为居中浅灰系统提示 */
const SYSTEM_MSG_RE = /撤回了一条消息|拍了拍|加入了群聊|移出了群聊|修改群名为|被管理员|已成为新群主|开启了朋友验证|已经通过你的朋友验证/;

/** 扩展名常量 — 统一引用，避免各处列表不一致 */
const AUDIO_EXTS = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'amr', 'silk'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
const FILE_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar', '7z'];

/** 预编译正则 — 避免每条消息重复构造 */
const AUDIO_EXT_RE = new RegExp(`\\.(${AUDIO_EXTS.join('|')})\\b`, 'i');
const MEDIA_EXT_RE = new RegExp(`\\.(${[...IMAGE_EXTS, ...VIDEO_EXTS, 'emoj'].join('|')})\\b`, 'i');
const MEDIA_EXT_NB_RE = new RegExp(`\\.(${[...IMAGE_EXTS, ...VIDEO_EXTS, 'emoj'].join('|')})`, 'i'); // no \\b boundary for RESOLVED: URIs
const FILE_EXT_RE = new RegExp(`\\.(${FILE_EXTS.join('|')})\\b`, 'i');
const IMAGE_EXT_RE = new RegExp(`\\.(${IMAGE_EXTS.join('|')})\\b`, 'i');
const VIDEO_EXT_RE = new RegExp(`\\.(${VIDEO_EXTS.join('|')})\\b`, 'i');
const WIKILINK_ONLY_RE = /^!\[\[.+?\]\]$/;

/** 合并转发项解析已移至 chat-parser.ts — 直接消费结构化 ForwardItem */

/** 文件附件元数据（由 main.ts 传入） */
export interface FileMeta {
	name: string;
	size: string;
	url: string;
}

// ────────────────────────────────────
// 事件委托 — 所有交互统一入口
// ────────────────────────────────────

/**
 * 在容器上绑定事件委托，处理所有聊天 UI 交互。
 * main.ts 在创建 overlay 后调用此函数。
 */
export function setupChatBubbleEvents(container: HTMLElement) {
	container.addEventListener('click', (e) => {
		if (!(e.target instanceof Element)) return;
		const el = e.target.closest<HTMLElement>('[data-action]');
		if (!el) return;

		const action = el.dataset.action!;

		switch (action) {
			case 'toggle-audio': {
				const audio = container.querySelector<HTMLAudioElement>(`#${el.dataset.audioId}`);
				if (audio) {
					if (audio.paused) { void audio.play(); } else { void audio.pause(); }
				}
				return;
			}
			case 'preview-media': {
				const type = el.dataset.type as 'img' | 'video';
				const uri = el.dataset.uri || (el as HTMLImageElement | HTMLVideoElement).src;
				openMediaOverlay(type, uri);
				return;
			}
			case 'preview-pdf': {
				openPdfOverlay(el.dataset.uri!);
				return;
			}
			case 'expand-forward': {
						openForwardOverlay(container, el.dataset.id!);
						return;
					}
				case 'open-geo': {
						const geo = (el.closest('[data-geo]') as HTMLElement)?.dataset.geo;
						if (geo) window.open(geo, '_blank', 'noopener');
						return;
					}
				}
	});

	// Update voice bubble duration when audio metadata loads
	container.addEventListener('loadedmetadata', (e) => {
		const audio = e.target as HTMLAudioElement;
		if (audio.tagName !== 'AUDIO') return;
		const wrapper = audio.closest('.chat-audio-msg');
		if (!wrapper) return;
		const dur = Math.ceil(audio.duration);
		const durEl = wrapper.querySelector('.chat-audio-dur');
		const textEl = wrapper.querySelector('.chat-audio-text');
		if (durEl) durEl.textContent = dur + '"';
		if (textEl) textEl.textContent = '语音消息 ';
	}, true); // capture — 'loadedmetadata' doesn't bubble
	container.addEventListener('error', (e) => {
		const el = e.target as HTMLElement;
		if (el.matches('.chat-bare-audio, .chat-bare-video, .chat-bare-img')) el.hidden = true;
	}, true);
}

function openMediaOverlay(type: 'img' | 'video', uri: string) {
	const overlay = activeDocument.createElement('div');
	overlay.className = 'chat-media-overlay';
	overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });

	const modal = activeDocument.createElement('div');
	modal.className = 'chat-media-modal';

	if (type === 'img') {
		const img = activeDocument.createElement('img');
		img.src = uri;
		img.className = 'chat-media-full';
		modal.appendChild(img);
	} else {
		const video = activeDocument.createElement('video');
		video.src = uri;
		video.controls = true;
		video.className = 'chat-media-full';
		void video.play();
		modal.appendChild(video);
	}
	overlay.appendChild(modal);
	activeDocument.body.appendChild(overlay);
}

function openPdfOverlay(uri: string) {
	const overlay = activeDocument.createElement('div');
	overlay.className = 'chat-file-overlay';
	overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });

	const modal = activeDocument.createElement('div');
	modal.className = 'chat-file-modal';
	const iframe = activeDocument.createElement('iframe');
	iframe.src = uri;
	iframe.className = 'chat-pdf-iframe';
	modal.appendChild(iframe);
	overlay.appendChild(modal);
	activeDocument.body.appendChild(overlay);
}

function openForwardOverlay(container: HTMLElement, templateId: string) {
	const template = container.querySelector<HTMLElement>(`#${templateId}`);
	if (!template) return;
	const clone = template.cloneNode(true) as HTMLElement;
	clone.classList.remove('forward-detail-template');

	const overlay = activeDocument.createElement('div');
	overlay.className = 'chat-forward-overlay';
	overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });

	const modal = activeDocument.createElement('div');
	modal.className = 'chat-forward-modal';
	modal.appendChild(clone);
	overlay.appendChild(modal);
	activeDocument.body.appendChild(overlay);

	// Re-bind event delegation on the modal so media/PDF clicks inside the popup work
	setupChatBubbleEvents(modal);
}

// ────────────────────────────────────
// 渲染引擎
// ────────────────────────────────────

export function renderChatLog(markdown: string, fileMetas?: FileMeta[], selfNames?: string[]): string {
	const { preamble, messages } = parseChatLog(markdown);

	// Build file metadata lookup by filename
	const metaMap = new Map<string, FileMeta>();
	if (fileMetas) {
		for (const fm of fileMetas) metaMap.set(fm.name, fm);
	}

	const parts: string[] = [];

	if (preamble) {
		parts.push(`<div class="chat-preamble">${escapeHtml(preamble).replace(/\n/g, '<br>')}</div>`);
	}

	if (messages.length > 0) {
		parts.push('<div class="chat-container">');

		for (const msg of messages) {
			const isSelf = isSelfMessage(msg.name, selfNames);
			const side = isSelf ? 'self' : 'other';

			let isAllSystem = true;
			let systemHtml = '';
			let textHtml = '';
			let mediaHtml = '';
			let quoteHtml = '';
			let forwardHtml = '';
			let fileHtml = '';
			let linkCardHtml = '';
				let locationHtml = '';

				for (const part of msg.body) {
				if (typeof part === 'string') {
					if (!part.trim()) continue;
					// Audio-only → render as WeChat-style voice bubble
					if (isAudioMedia(part)) {
						mediaHtml += renderAudioBubble(part, side);
						isAllSystem = false;
						continue;
					}
					const rendered = classifyAndRender(part, metaMap);
					if (rendered.type === 'file') {
						fileHtml += rendered.html;
						isAllSystem = false;
					} else if (rendered.type === 'media') {
						mediaHtml += rendered.html;
						isAllSystem = false;
					} else if (rendered.type === 'system') {
						systemHtml += rendered.html + NL;
						isAllSystem = isAllSystem && true;
					} else {
						textHtml += rendered.html + NL;
						isAllSystem = false;
					}
				} else {
					// quote-reply, merge-forward, or link-card — not system
					if (part.type === 'quote-reply') {
						quoteHtml = renderQuoteBar(part.sender, part.quote);
						textHtml += renderPlainText(part.reply);
					} else if (part.type === 'merge-forward') {
						forwardHtml += renderMergeForward(part, metaMap, selfNames);
					} else if (part.type === 'link-card') {
								linkCardHtml += renderLinkCard(part, isSelf);
							} else if (part.type === 'location') {
								locationHtml += renderLocationCard(part);
							}
							isAllSystem = false;
				}
			}

			// System messages: empty-sender or all-body-is-system
			const isSystemSender = !msg.name || msg.name.trim() === '';
			if (isSystemSender || (isAllSystem && systemHtml)) {
				let tipHtml = '';
				tipHtml += `<span class="chat-system-time">${escapeHtml(msg.time)}</span>` + NL;
				tipHtml += systemHtml || textHtml;
				parts.push('<div class="chat-msg system">');
				parts.push(`<div class="chat-system-tip">${tipHtml}</div>`);
				parts.push('</div>');
				continue;
			}

			// ── 普通消息 ──
			parts.push(`<div class="chat-msg ${side}">`);
			parts.push(`<div class="chat-meta">${escapeHtml(msg.name)} · ${msg.time}</div>`);
			if (systemHtml) {
				textHtml += `<span class="chat-system-inline">${systemHtml}</span>`;
			}
			// Text in bubble, link card outside bubble (or standalone if no text)
			if (textHtml) {
				parts.push(`<div class="chat-bubble">${textHtml}</div>`);
			}
			// Link card after bubble (or standalone if no text)
			if (linkCardHtml) {
				parts.push(linkCardHtml);
			}
			// Quote bar below the bubble
			if (quoteHtml) {
				parts.push(quoteHtml);
			}
			parts.push(mediaHtml);
			parts.push(fileHtml);
			parts.push(forwardHtml);
				parts.push(locationHtml);
				parts.push('</div>');
		}

		parts.push('</div>');
	}

	return parts.join('');
}

/** Returns true if the text is purely an audio reference */
function isAudioMedia(text: string): boolean {
	const trimmed = text.trim();
	if (!WIKILINK_ONLY_RE.test(trimmed)) return false;
	if (trimmed.includes('data:audio/')) return true;
	return AUDIO_EXT_RE.test(trimmed);
}

/** Render audio as a WeChat-style voice bubble — interaction via event delegation */
function renderAudioBubble(text: string, side: string): string {
	const match = text.match(/!\[\[(.+?)\]\]/);
	const resolved = match?.[1] || '';
	const uri = resolved.startsWith('RESOLVED:') ? resolved.slice(9) : resolved;
	const uid = 'au-' + Math.random().toString(36).slice(2, 8);
	return `<div class="chat-audio-msg ${side}" data-action="toggle-audio" data-audio-id="${uid}" ><span class="chat-audio-icon">🔊</span><span class="chat-audio-text">语音消息</span><span class="chat-audio-dur"></span><audio id="${uid}" src="${uri}" hidden preload="metadata"></audio></div>`;
}

type RenderedType = 'text' | 'media' | 'file' | 'system';

/** Single-pass content classification — avoid re-trim + re-test WIKILINK_ONLY_RE */
function classifyContent(text: string): RenderedType {
	const trimmed = text.trim();
	if (WIKILINK_ONLY_RE.test(trimmed)) {
		if (FILE_EXT_RE.test(trimmed)) return 'file';
		if (trimmed.includes('data:video/')) return 'media';
		if (trimmed.includes('RESOLVED:')) {
			if (MEDIA_EXT_NB_RE.test(trimmed)) return 'media';
		} else if (MEDIA_EXT_RE.test(trimmed)) {
			return 'media';
		}
		return 'text';
	}
	if (SYSTEM_MSG_RE.test(trimmed)) return 'system';
	return 'text';
}

/** Classify content + render — shared by main chat and merge-forward */
function classifyAndRender(content: string, metaMap: Map<string, FileMeta>): { html: string; type: RenderedType } {
	const type = classifyContent(content);
	if (type === 'file') return { html: renderFileCard(content, metaMap), type: 'file' };
	return { html: renderPlainText(content), type };
}

/** Render a file attachment as a card — PDF preview via event delegation */
function renderFileCard(part: string, metaMap: Map<string, FileMeta>): string {
	const match = part.match(/!\[\[(.+?)\]\]/);
	if (!match) return escapeHtml(part);

	const linkText = match[1];
	const { displayName, uri: url, ext } = resolveFileLink(linkText);
	const truncatedName = middleTruncate(displayName, 28);

	const meta = metaMap.get(displayName);
	const size = meta?.size || '';

	const actionAttr = ext === 'PDF' && url
		? ` data-action="preview-pdf" data-uri="${escapeAttr(url)}"`
		: '';

	return `<div class="chat-file-card"${actionAttr}>`
		+ '<div class="chat-file-info">'
		+ `<div class="chat-file-name" title="${escapeAttr(displayName)}">${escapeHtml(truncatedName)}</div>`
		+ (size ? `<div class="chat-file-size">${escapeHtml(size)}</div>` : '')
		+ '</div>'
		+ '<div class="chat-file-icon">'
		+ `<div class="chat-file-icon-box"><span class="chat-file-ext">${escapeHtml(ext)}</span></div>`
		+ '</div>'
		+ '</div>';
}

/** Render a compact file card (used in merge-forward) */
function renderFileCardMini(ext: string, filename: string, uri: string): string {
	const actionAttr = ext === 'PDF' && uri
		? ` data-action="preview-pdf" data-uri="${escapeAttr(uri)}"`
		: '';
	return `<span class="forward-file-card"${actionAttr}><span class="chat-quote-file-icon">${escapeHtml(ext)}</span>${escapeHtml(filename)}</span>`;
}

/** Render a WeChat-style link card — shared link with domain */
function renderLinkCard(link: LinkCard, isSelf: boolean): string {
	let domain = '';
	try { domain = new URL(link.url).hostname; } catch {
		// Leave the domain blank for malformed links; the card itself still renders.
	}

	const sideClass = isSelf ? 'self' : 'other';
	return `<a href="${safeHrefAttr(link.url)}" class="chat-link-card ${sideClass}" target="_blank" rel="noopener">
		<span class="chat-link-card-icon">🔗</span>
		<span class="chat-link-card-body">
			<span class="chat-link-card-title">${escapeHtml(link.title)}</span>
			<span class="chat-link-card-domain">${escapeHtml(domain)}</span>
		</span>
	</a>`;
}

/** Render a WeChat-style location card */
let _locMapId = 0;
function renderLocationCard(loc: LocationCard): string {
	const addr = (loc.city && !loc.label.includes(loc.city)) ? `${loc.city} ${loc.label}` : loc.label;
	const hasCoords = loc.lat !== undefined && loc.lng !== undefined && !isNaN(loc.lat) && !isNaN(loc.lng);
	const mid = 'lm' + (_locMapId++);
	const geoUrl = hasCoords
		? `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}&zoom=15`
		: '';
	const mapArea = hasCoords
		? `<div class="chat-location-map-wrap" data-action="open-geo" data-geo="${escapeAttr(geoUrl)}">
			<div id="${mid}" class="chat-location-map" data-lat="${loc.lat}" data-lng="${loc.lng}"></div>
			<span class="chat-location-map-pin">📍</span>
		</div>`
		: `<div class="chat-location-map-wrap"><div class="chat-location-map"></div><span class="chat-location-map-pin">📍</span></div>`;
	return `<div class="chat-location-card">
		<span class="chat-location-icon">📍</span>
		<span class="chat-location-body">
			<span class="chat-location-title">${escapeHtml(loc.label)}</span>
			<span class="chat-location-addr">${escapeHtml(addr)}</span>
		</span>
		${mapArea}
	</div>`;
}

/** Initialize MapLibre GL maps on location cards and quote map thumbnails */
export function initLocationMaps(container: HTMLElement) {
	// Wait for layout: DOMParser-created elements need a frame to compute dimensions
	window.requestAnimationFrame(() => {
		const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
		const maps = container.querySelectorAll<HTMLElement>('.chat-location-map, .chat-quote-map-thumb');

		maps.forEach(el => {
			const lat = parseFloat(el.dataset.lat || '');
			const lng = parseFloat(el.dataset.lng || '');
			const w = el.offsetWidth, h = el.offsetHeight;
			if (!lat || !lng || !w || !h) return;

			try {
				const isQuoteThumb = el.classList.contains('chat-quote-map-thumb');
				const map = new maplibregl.Map({
					container: el,
					style: STYLE_URL,
					center: [lng, lat],
					zoom: isQuoteThumb ? 9 : 14,
					interactive: false,
					attributionControl: false,
				});
				// Only add marker for full-size location cards (not tiny quote thumbs)
				if (!isQuoteThumb) {
					new maplibregl.Marker({ color: '#e74c3c' })
						.setLngLat([lng, lat])
						.addTo(map);
				}
				locationMaps.set(el, map);
			} catch {
				// Style/tile load failed — placeholder remains
			}
		});
	});
}

/** Destroy all MapLibre GL maps in a container */
export function destroyLocationMaps(container: HTMLElement) {
	container.querySelectorAll<HTMLElement>('.chat-location-map, .chat-quote-map-thumb').forEach(el => {
		locationMaps.get(el)?.remove();
		locationMaps.delete(el);
	});
}

function isSelfMessage(name: string, selfNames?: string[]): boolean {
	const names = selfNames?.length ? selfNames : ['自己', '我', 'me'];
	return names.some(n => name.toLowerCase() === n.toLowerCase());
}

function renderPlainText(text: string): string {
	let result = escapeHtml(text);

	// Convert Markdown links [text](url) → clickable <a>
	result = result.replace(/\[(.+?)\]\(([^)]+)\)/g, (_m, linkText: string, url: string) => {
		const safeUrl = safeHrefAttr(url);
		return `<a href="${safeUrl}" class="chat-link" target="_blank" rel="noopener">${linkText}</a>`;
	});

	result = result.replace(/!\[\[(.+?)(?:\|(\d+))?\]\]/g, (_m, file: string, w: string) => {
		file = file.trim();

		if (file.startsWith('RESOLVED:')) {
			const uri = file.slice(9);
			if (uri.startsWith('data:audio/')) {
				return `<audio controls preload="auto" src="${escapeAttr(uri)}" class="chat-bare-audio"></audio>`;
			}
			if (uri.startsWith('data:video/')) {
				return `<video controls preload="auto" src="${escapeAttr(uri)}" class="chat-bare-video" data-action="preview-media" data-type="video" data-uri="${escapeAttr(uri)}"></video>`;
			}
			// Resource URIs (app://...) — check extension for audio/video
			if (!uri.startsWith('data:')) {
				const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() || '';
				if (AUDIO_EXTS.includes(ext)) {
					return `<audio controls preload="auto" src="${escapeAttr(uri)}" class="chat-bare-audio"></audio>`;
				}
				if (VIDEO_EXTS.includes(ext)) {
					return `<video controls preload="auto" src="${escapeAttr(uri)}" class="chat-bare-video" data-action="preview-media" data-type="video" data-uri="${escapeAttr(uri)}"></video>`;
				}
			}
			const width = w ? ` width="${w}"` : '';
			return `<img src="${escapeAttr(uri)}" class="chat-bare-img"${width} loading="lazy" data-action="preview-media" data-type="img" data-uri="${escapeAttr(uri)}">`;
		}

		const ext = file.split('.').pop()?.toLowerCase() || '';
		if (AUDIO_EXTS.includes(ext)) {
			return `<audio controls preload="auto" src="${escapeAttr(safeEncodeURI(file))}" class="chat-bare-audio"></audio>`;
		}
		if (VIDEO_EXTS.includes(ext)) {
			return `<video controls preload="auto" src="${escapeAttr(safeEncodeURI(file))}" class="chat-bare-video" data-action="preview-media" data-type="video" data-uri="${escapeAttr(safeEncodeURI(file))}"></video>`;
		}
		const width = w ? ` width="${w}"` : '';
		return `<img src="${escapeAttr(safeEncodeURI(file))}" class="chat-bare-img"${width} loading="lazy" data-action="preview-media" data-type="img" data-uri="${escapeAttr(safeEncodeURI(file))}">`;
	});

	return result;
}

/** 渲染引用条 */
function renderQuoteBar(sender: string, quote: string): string {
	const mediaMatch = quote.match(/!\[\[RESOLVED:(.+?)\]\]/);
	if (mediaMatch) {
		const resolved = mediaMatch[1];
		const isVideo = resolved.startsWith('data:video/') || VIDEO_EXT_RE.test(resolved);
		const isAudio = resolved.startsWith('data:audio/') || AUDIO_EXT_RE.test(resolved);
		const isImage = resolved.startsWith('data:image/') || IMAGE_EXT_RE.test(resolved);
		const isFile = FILE_EXT_RE.test(resolved);

		let preview = '';
		if (isImage) {
			preview = `<img src="${escapeAttr(resolved)}" class="chat-quote-thumb" data-action="preview-media" data-type="img" data-uri="${escapeAttr(resolved)}" >`;
		} else if (isVideo) {
			preview = `<video src="${escapeAttr(resolved)}" class="chat-quote-video-thumb" data-action="preview-media" data-type="video" data-uri="${escapeAttr(resolved)}"  muted preload="metadata"></video>`;
		} else if (isAudio) {
			const uid = 'au-' + Math.random().toString(36).slice(2, 8);
			const label = resolved.startsWith('data:') ? '语音消息' : (safeDecodeURI(resolved.split('?')[0].split('/').pop() || 'audio'));
			preview = `<span class="chat-quote-audio-bar" data-action="toggle-audio" data-audio-id="${uid}" ><span class="chat-quote-audio-icon">🔊</span>${escapeHtml(label)}<audio id="${uid}" src="${escapeAttr(resolved)}" hidden preload="metadata"></audio></span>`;
		} else if (isFile) {
			const filename = quote.match(/!\[\[(.+?)\]\]/)?.[1] || '';
			const raw = filename.replace(/^RESOLVED:/, '').split('?')[0].split('/').pop() || filename;
			const name = safeDecodeURI(raw);
			const ext = (name.split('.').pop() || '').toUpperCase();
			const actionAttr = ext === 'PDF' ? ` data-action="preview-pdf" data-uri="${escapeAttr(resolved)}" ` : '';
			preview = `<span class="chat-quote-file"${actionAttr}><span class="chat-quote-file-icon">${escapeHtml(ext)}</span>${escapeHtml(name)}</span>`;
		} else {
			preview = escapeHtml(quote.replace(/!\[\[RESOLVED:.*?\]\]/, ''));
		}
		return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span>${preview}</div>`;
	}

	// Check for location reference: [位置|label|city|lat|lng]
	const locMatch = quote.match(LOCATION_RE);
	if (locMatch) {
		const label = locMatch[1];
		const city = locMatch[2] || undefined;
		let lat: number | undefined;
		let lng: number | undefined;
		const c3 = locMatch[3];
		const c4 = locMatch[4];
		if (c3 && c4) {
			lat = parseFloat(c3);
			lng = parseFloat(c4);
		} else if (c3 && c3.includes(',')) {
			const [a, b] = c3.split(',');
			lng = parseFloat(a);
			lat = parseFloat(b);
		}
		const hasCoords = lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng);
		const addr = (city && !label.includes(city)) ? `${city} ${label}` : label;
		const geoUrl = hasCoords
			? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=15`
			: '';

		const preview = hasCoords
			? `<div class="chat-quote-thumb chat-quote-map-thumb" data-lat="${lat}" data-lng="${lng}" data-action="open-geo" data-geo="${escapeAttr(geoUrl)}"></div>`
			: `<span class="chat-quote-location-marker">📍</span>${escapeHtml(addr)}`;

		return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span>${preview}</div>`;
	}

	const plainMatch = quote.match(/!\[\[(.+?)\]\]/);
	if (plainMatch) {
		const filename = plainMatch[1];
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		if (VIDEO_EXTS.includes(ext)) return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span><span class="chat-quote-video-icon">▶</span></div>`;
		if (AUDIO_EXTS.includes(ext)) {
			const uid = 'au-' + Math.random().toString(36).slice(2, 8);
			return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span><span class="chat-quote-audio-bar" data-action="toggle-audio" data-audio-id="${uid}" ><span class="chat-quote-audio-icon">🔊</span>语音消息<audio id="${uid}" src="${escapeAttr(safeEncodeURI(filename))}" hidden preload="metadata"></audio></span></div>`;
		}
		if (IMAGE_EXTS.includes(ext)) return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span>[图片]</div>`;
		const extUpper = (filename.split('.').pop() || '').toUpperCase();
		return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span><span class="chat-quote-file"><span class="chat-quote-file-icon">${escapeHtml(extUpper)}</span>${escapeHtml(filename)}</span></div>`;
	}

	return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span>${escapeHtml(quote)}</div>`;
}

function renderMergeForward(part: MergeForward, metaMap: Map<string, FileMeta>, selfNames?: string[]): string {
	const uid = 'fw-' + Math.random().toString(36).slice(2, 8);

	let cardHtml = '<div class="chat-forward-card">';
	cardHtml += `<div class="forward-title">${escapeHtml(part.title)}</div>`;

	cardHtml += `<div class="forward-expand" data-action="expand-forward" data-id="${uid}">查看全部聊天记录</div>`;
	cardHtml += '</div>';

	// Hidden template — items rendered as mini bubbles
	cardHtml += `<div id="${uid}" class="forward-detail-template">`;
	cardHtml += `<div class="forward-detail-title">${escapeHtml(part.title)}</div>`;
	for (const item of part.items) {
		if ('plain' in item) {
			cardHtml += `<div class="forward-item system"><span class="forward-plain">${escapeHtml(item.plain)}</span></div>`;
			continue;
		}
		const { sender, time, content } = item;
		const isSelf = isSelfMessage(sender, selfNames);
		const side = isSelf ? 'self' : 'other';
		cardHtml += `<div class="forward-item ${side}"><span class="forward-sender">${escapeHtml(sender)} <span class="forward-time">${escapeHtml(time)}</span></span>`;

		const sr = classifyAndRender(content, metaMap);
		if (sr.type === 'file') {
			const raw = content.match(/!\[\[(.+?)\]\]/)?.[1] || '';
			const { displayName, uri, ext } = resolveFileLink(raw);
			cardHtml += `<div class="forward-media">${renderFileCardMini(ext, displayName, uri)}</div>`;
		} else if (sr.type === 'media') {
			cardHtml += `<div class="forward-media">${sr.html}</div>`;
		} else {
			cardHtml += `<div class="forward-bubble">${sr.html}</div>`;
		}
		cardHtml += '</div>';
	}
	cardHtml += '</div>';

	cardHtml += '<div class="forward-footer">聊天记录</div>';
	return cardHtml;
}

// ────────────────────────────────────
// 工具函数
// ────────────────────────────────────

/** Resolve a wikilink reference into display-friendly components */
function resolveFileLink(filename: string): { displayName: string; uri: string; ext: string } {
	let uri = '';
	let displayName: string;
	if (filename.startsWith('RESOLVED:')) {
		uri = filename.slice(9);
		displayName = decodeURIComponent(uri.split('?')[0].split('/').pop() || uri);
	} else {
		displayName = filename;
		uri = filename;
	}
	const ext = displayName.split('.').pop()?.toUpperCase() || 'FILE';
	return { displayName, uri, ext };
}

function safeDecodeURI(str: string): string {
	try { return decodeURIComponent(str); } catch { return str; }
}

/** Truncate filename in middle, preserving extension */
function middleTruncate(name: string, maxLen: number): string {
	if (name.length <= maxLen) return name;
	const dot = name.lastIndexOf('.');
	const ext = dot > 0 ? name.slice(dot) : '';
	const base = dot > 0 ? name.slice(0, dot) : name;
	const avail = maxLen - ext.length - 3; // 3 for "..."
	if (avail <= 0) return name.slice(0, maxLen - 3) + '...';
	const half = Math.floor(avail / 2);
	return base.slice(0, half) + '...' + base.slice(-(avail - half)) + ext;
}

/** Escape HTML entities */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/** Escape a value for use in an HTML attribute (double-quoted) */
function escapeAttr(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function safeHrefAttr(url: string): string {
	const trimmed = url.trim();
	if (hasControlChar(trimmed)) return '#';

	const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
	if (schemeMatch) {
		const scheme = schemeMatch[1].toLowerCase();
		if (!['http', 'https', 'mailto', 'obsidian'].includes(scheme)) return '#';
	}

	return escapeAttr(trimmed);
}

function hasControlChar(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code <= 0x1F || code === 0x7F) return true;
	}
	return false;
}

/** URL-encode path segments, preserving slashes */
function safeEncodeURI(str: string): string {
	return encodeURIComponent(str).replace(/%2F/g, '/');
}
