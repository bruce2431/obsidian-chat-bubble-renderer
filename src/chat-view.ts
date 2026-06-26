/**
 * Chat View - 气泡对话框渲染器
 * 将解析后的聊天消息渲染为微信风格气泡 UI
 * 媒体文件（图片/音频/视频）不套气泡，直接渲染
 * 文件附件（PDF/DOC等）渲染为卡片，点击弹窗预览
 * 引用回复：quote bar 在气泡外侧（对方在上，自己在下）
 */

import { parseChatLog, MergeForward } from './chat-parser';

const NL = String.fromCharCode(10);

/** 系统消息关键词列表 — 匹配则渲染为居中浅灰系统提示 */
const SYSTEM_MSG_KEYWORDS = [
	'撤回了一条消息',
	'拍了拍',
	'加入了群聊',
	'移出了群聊',
	'修改群名为',
	'被管理员',
	'已成为新群主',
	'开启了朋友验证',
	'已经通过你的朋友验证',
];

/** 文件附件元数据（由 main.ts 传入） */
export interface FileMeta {
	name: string;
	size: string;
	url: string;
}

function isSystemMessage(text: string): boolean {
	const trimmed = text.trim();
	return SYSTEM_MSG_KEYWORDS.some(kw => trimmed.includes(kw));
}

export function renderChatLog(markdown: string, fileMetas?: FileMeta[], selfNames?: string[]): string {
	const { preamble, messages } = parseChatLog(markdown);

	// Build file metadata lookup by filename
	const metaMap = new Map<string, FileMeta>();
	if (fileMetas) {
		for (const fm of fileMetas) metaMap.set(fm.name, fm);
	}

	let html = '';

	if (preamble) {
		html += `<div class="chat-preamble">${escapeHtml(preamble.replace(/\n/g, '<br>'))}</div>`;
	}

	if (messages.length > 0) {
		html += '<div class="chat-container">';

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

			for (const part of msg.body) {
					if (typeof part === 'string') {
						if (!part.trim()) continue;
						// Audio-only → render as WeChat-style voice bubble
						if (isAudioMedia(part)) {
							mediaHtml += renderAudioBubble(part, side);
							isAllSystem = false;
							continue;
						}
						const rendered = classifyAndRender(part, metaMap, 'chat');
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
					// quote-reply or merge-forward — not system
					if (part.type === 'quote-reply') {
						quoteHtml = renderQuoteBar(part.sender, part.quote);
						textHtml += renderPlainText(part.reply);
					} else if (part.type === 'merge-forward') {
						forwardHtml += renderMergeForward(part, metaMap, selfNames);
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
				html += `<div class="chat-msg system">`;
				html += `<div class="chat-system-tip">${tipHtml}</div>`;
				html += '</div>';
				continue;
			}

			// ── 普通消息 ──
			html += `<div class="chat-msg ${side}">`;
			html += `<div class="chat-meta">${escapeHtml(msg.name)} · ${msg.time}</div>`;
			if (systemHtml) {
				textHtml += `<span class="chat-system-inline">${systemHtml}</span>`;
			}
			if (textHtml) {
				html += `<div class="chat-bubble">${textHtml}</div>`;
			}
			// Quote bar below the bubble
			if (quoteHtml) {
				html += quoteHtml;
			}
			html += mediaHtml;
			html += fileHtml;
			html += forwardHtml;
			html += '</div>';
		}

		html += '</div>';
	}

	return html;
}

/** Returns true if the text is purely an audio reference */
function isAudioMedia(text: string): boolean {
	const trimmed = text.trim();
	if (!/^!\[\[.+?\]\]$/.test(trimmed)) return false;
	if (trimmed.includes('data:audio/')) return true;
	return /\.(mp3|m4a|wav|ogg|aac|amr|silk)\b/i.test(trimmed);
}

/** Render audio as a WeChat-style voice bubble with click-to-play and duration display */
function renderAudioBubble(text: string, side: string): string {
	const match = text.match(/!\[\[(.+?)\]\]/);
	const resolved = match?.[1] || '';
	let uri = resolved.startsWith('RESOLVED:') ? resolved.slice(9) : resolved;
	const uid = 'au-' + Math.random().toString(36).slice(2, 8);
	// Hidden audio loads metadata for duration, same element used for playback
	return `<div class="chat-audio-msg ${side}" onclick="(function(t){var a=t.querySelector('audio');a.paused?a.play():a.pause()})(event.currentTarget)" style="cursor:pointer"><span class="chat-audio-icon">🔊</span><span class="chat-audio-text">语音消息</span><span class="chat-audio-dur"></span><audio id="${uid}" src="${uri}" hidden preload="metadata" onloadedmetadata="var d=Math.ceil(this.duration);var p=this.closest('.chat-audio-msg');p.querySelector('.chat-audio-dur').textContent=d+'&quot;';p.querySelector('.chat-audio-text').textContent='语音消息 '" onclick="event.stopPropagation()"></audio></div>`;
}
// Click handler in renderChatLog attaches dynamically — see below

/** Returns true if the text is purely a media reference (no surrounding text — images/video only, audio handled separately) */
function isMediaOnly(text: string): boolean {
	const trimmed = text.trim();
	if (!/^!\[\[.+?\]\]$/.test(trimmed)) return false;
	if (trimmed.includes('RESOLVED:')) {
		if (trimmed.includes('data:video/')) return true;
		const mediaExts = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|emoj)/i;
		return mediaExts.test(trimmed);
	}
	const mediaExts = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|emoj)\b/i;
	return mediaExts.test(trimmed);
}

/** Shared: generate PDF preview onclick JS */
function pdfOnClick(uri: string): string {
	return ` onclick="(function(){var o=document.createElement('div');o.className='chat-file-overlay';o.addEventListener('click',function(e){if(e.target===o)o.remove()});var m=document.createElement('div');m.className='chat-file-modal';var f=document.createElement('iframe');f.src='${uri}';f.style.width='100%';f.style.height='75vh';f.style.border='none';f.style.borderRadius='0 0 12px 12px';m.appendChild(f);o.appendChild(m);document.body.appendChild(o)})()"`;
}

/** Shared: render a compact file card (used in merge-forward) */
function renderFileCardMini(ext: string, filename: string, uri: string): string {
	const clickAttr = ext === 'PDF' && uri ? pdfOnClick(uri) : '';
	return `<span class="forward-file-card"${clickAttr}><span class="chat-quote-file-icon">${escapeHtml(ext)}</span>${escapeHtml(filename)}</span>`;
}

/** Returns true if the text is a file attachment (PDF, DOC, etc.) */
function isFileAttachment(text: string): boolean {
	const trimmed = text.trim();
	if (!/^!\[\[.+?\]\]$/.test(trimmed)) return false;
	const fileExts = /\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|7z)\b/i;
	return fileExts.test(trimmed);
}

type RenderedType = 'text' | 'media' | 'file' | 'system';

/** Classify content + render — shared by main chat and merge-forward */
function classifyAndRender(content: string, metaMap: Map<string, FileMeta>, cssPrefix: string): { html: string; type: RenderedType } {
	if (isFileAttachment(content)) {
		return { html: renderFileCard(content, metaMap), type: 'file' };
	}
	if (isMediaOnly(content)) {
		return { html: renderPlainText(content), type: 'media' };
	}
	if (isSystemMessage(content)) {
		return { html: renderPlainText(content), type: 'system' };
	}
	return { html: renderPlainText(content), type: 'text' };
}

/** Render a file attachment as a card with name, size, type icon — click to preview */
function renderFileCard(part: string, metaMap: Map<string, FileMeta>): string {
	const match = part.match(/!\[\[(.+?)\]\]/);
	if (!match) return escapeHtml(part);

	const linkText = match[1];
		let displayName: string;
		let url = '';

		if (linkText.startsWith('RESOLVED:')) {
			url = linkText.slice(9);
			displayName = decodeURIComponent(url.split('?')[0].split('/').pop() || url);
		} else {
			displayName = linkText;
			url = linkText;
		}

	const meta = metaMap.get(displayName);
	const ext = displayName.split('.').pop()?.toUpperCase() || 'FILE';
	const size = meta?.size || '';

	// PDF: click to open preview modal; other files: no preview
	const clickAttr = ext === 'PDF' && url ? pdfOnClick(url) : '';

	let html = `<div class="chat-file-card"${clickAttr}>`;

	html += '<div class="chat-file-info">';
	html += `<div class="chat-file-name">${escapeHtml(displayName)}</div>`;
	if (size) html += `<div class="chat-file-size">${escapeHtml(size)}</div>`;
	html += '</div>';

	html += '<div class="chat-file-icon">';
	html += `<div class="chat-file-icon-box"><span class="chat-file-ext">${escapeHtml(ext)}</span></div>`;
	html += '</div>';

	html += '</div>';
	return html;
}

function isSelfMessage(name: string, selfNames?: string[]): boolean {
	const names = selfNames?.length ? selfNames : ['自己', '我', 'me'];
	return names.some(n => name.toLowerCase() === n.toLowerCase());
}

function renderPlainText(text: string): string {
	let result = escapeHtml(text);

	result = result.replace(/!\[\[(.+?)(?:\|(\d+))?\]\]/g, (_m, file: string, w: string) => {
		file = file.trim();

		if (file.startsWith('RESOLVED:')) {
			const uri = file.slice(9);
			if (uri.startsWith('data:audio/')) {
				return `<audio controls preload="auto" src="${uri}" class="chat-bare-audio" onerror="this.style.display='none'"></audio>`;
			}
			if (uri.startsWith('data:video/')) {
				return `<video controls preload="auto" src="${uri}" class="chat-bare-video" onclick="${mediaClick('video')}" style="cursor:pointer" onerror="this.style.display='none'"></video>`;
			}
			const width = w ? ` width="${w}"` : '';
			return `<img src="${uri}" class="chat-bare-img"${width} loading="lazy" onclick="${mediaClick('img')}" style="cursor:pointer" onerror="this.style.display='none'">`;
		}

		const ext = file.split('.').pop()?.toLowerCase() || '';
		if (['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(ext)) {
			return `<audio controls preload="auto" src="${encodeURI(file)}" class="chat-bare-audio" onerror="this.style.display='none'"></audio>`;
		}
		if (['mp4', 'webm', 'mov'].includes(ext)) {
			return `<video controls preload="auto" src="${encodeURI(file)}" class="chat-bare-video" onclick="${mediaClick('video')}" style="cursor:pointer" onerror="this.style.display='none'"></video>`;
		}
		const width = w ? ` width="${w}"` : '';
		return `<img src="${encodeURI(file)}" class="chat-bare-img"${width} loading="lazy" onclick="${mediaClick('img')}" style="cursor:pointer" onerror="this.style.display='none'">`;
	});

	return result;
}

/** Generate onclick JS for media preview modal (img or video) */
function mediaClick(type: 'img' | 'video'): string {
	const el = type === 'img'
		? "var e=document.createElement('img');e.src=t.src;e.className='chat-media-full'"
		: "var e=document.createElement('video');e.src=t.src;e.controls=true;e.className='chat-media-full';e.play()";
	return `(function(t){var o=document.createElement('div');o.className='chat-media-overlay';o.addEventListener('click',function(ev){if(ev.target===o)o.remove()});var m=document.createElement('div');m.className='chat-media-modal';${el};m.appendChild(e);o.appendChild(m);document.body.appendChild(o)})(event.target)`.replace(/"/g, '&quot;');
}

/** Generate onclick JS for media preview modal — accepts explicit URI (for quote bar where element has no src) */
function mediaClickUri(type: 'img' | 'video', uri: string): string {
	const el = type === 'img'
		? `var e=document.createElement('img');e.src='${uri}';e.className='chat-media-full'`
		: `var e=document.createElement('video');e.src='${uri}';e.controls=true;e.className='chat-media-full';e.play()`;
	return `(function(){var o=document.createElement('div');o.className='chat-media-overlay';o.addEventListener('click',function(ev){if(ev.target===o)o.remove()});var m=document.createElement('div');m.className='chat-media-modal';${el};m.appendChild(e);o.appendChild(m);document.body.appendChild(o)})()`.replace(/"/g, '&quot;');
}

/** Generate onclick JS for inline audio playback in quote bar — plays via Audio() without DOM change */
function audioPlayInline(uri: string): string {
	return `(function(){var a=new Audio('${uri}');a.play()})()`.replace(/"/g, '&quot;');
}

/** 渲染引用条（仅 bar，不含回复正文） */
function renderQuoteBar(sender: string, quote: string): string {
	// Detect media reference: ![[RESOLVED:data:image/...]] or ![[RESOLVED:app://...file.mp4]]
	const mediaMatch = quote.match(/!\[\[RESOLVED:(.+?)\]\]/);
	if (mediaMatch) {
		const resolved = mediaMatch[1];
		const isVideo = resolved.startsWith('data:video/') || /\.(mp4|webm|mov)\b/i.test(resolved);
		const isAudio = resolved.startsWith('data:audio/') || /\.(mp3|m4a|wav|ogg|aac|amr|silk)\b/i.test(resolved);
		const isImage = resolved.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|bmp)\b/i.test(resolved);
		const isFile = /\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|7z)\b/i.test(resolved);

		let preview = '';
		if (isImage) {
			preview = `<img src="${resolved}" class="chat-quote-thumb" onclick="${mediaClickUri('img', resolved)}" style="cursor:pointer">`;
		} else if (isVideo) {
			preview = `<video src="${resolved}" class="chat-quote-video-thumb" onclick="${mediaClickUri('video', resolved)}" style="cursor:pointer" muted preload="metadata"></video>`;
		} else if (isAudio) {
			const isDataUri = resolved.startsWith('data:');
			if (isDataUri) {
				preview = `<span class="chat-quote-audio-bar" onclick="${audioPlayInline(resolved)}" style="cursor:pointer"><span class="chat-quote-audio-icon">🔊</span>语音消息</span>`;
			} else {
				const raw = resolved.split('?')[0].split('/').pop() || 'audio';
				const name = safeDecodeURI(raw);
				preview = `<span class="chat-quote-audio-bar" onclick="${audioPlayInline(resolved)}" style="cursor:pointer"><span class="chat-quote-audio-icon">🔊</span>${escapeHtml(name)}</span>`;
			}
		} else if (isFile) {
			const filename = quote.match(/!\[\[(.+?)\]\]/)?.[1] || '';
			const raw = filename.replace(/^RESOLVED:/, '').split('?')[0].split('/').pop() || filename;
			const name = safeDecodeURI(raw);
			const ext = (name.split('.').pop() || '').toUpperCase();
			const clickAttr = ext === 'PDF' ? pdfOnClick(resolved) + ' style="cursor:pointer"' : '';
			preview = `<span class="chat-quote-file"${clickAttr}><span class="chat-quote-file-icon">${escapeHtml(ext)}</span>${escapeHtml(name)}</span>`;
		} else {
			preview = escapeHtml(quote.replace(/!\[\[RESOLVED:.*?\]\]/, ''));
		}
		return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span>${preview}</div>`;
	}

	// Check for plain ![[file.ext]]
	const plainMatch = quote.match(/!\[\[(.+?)\]\]/);
	if (plainMatch) {
		const filename = plainMatch[1];
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		if (['mp4', 'webm', 'mov'].includes(ext)) return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span><span class="chat-quote-video-icon">▶</span></div>`;
		if (['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(ext)) return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span><span class="chat-quote-audio-icon">🔊</span></div>`;
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span>[图片]</div>`;
		const extUpper = (filename.split('.').pop() || '').toUpperCase();
		return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span><span class="chat-quote-file"><span class="chat-quote-file-icon">${escapeHtml(extUpper)}</span>${escapeHtml(filename)}</span></div>`;
	}

	return `<div class="chat-quote-bar"><span class="chat-quote-sender">${escapeHtml(sender)}</span>${escapeHtml(quote)}</div>`;
}

function renderMergeForward(part: MergeForward, metaMap: Map<string, FileMeta>, selfNames?: string[]): string {
	const uid = 'fw-' + Math.random().toString(36).slice(2, 8);

	let cardHtml = '<div class="chat-forward-card">';
	cardHtml += `<div class="forward-title">${escapeHtml(part.title)}</div>`;

	// Click to open modal — clone hidden template, wrap in overlay
	cardHtml += `<div class="forward-expand" onclick="(function(){var t=document.getElementById('${uid}'),c=t.cloneNode(true);c.style.display='';var o=document.createElement('div');o.className='chat-forward-overlay';o.addEventListener('click',function(e){if(e.target===o)o.remove()});var m=document.createElement('div');m.className='chat-forward-modal';m.appendChild(c);o.appendChild(m);document.body.appendChild(o)})()">查看全部聊天记录</div>`;
	cardHtml += '</div>';

	// Hidden template — items rendered as mini bubbles
	cardHtml += `<div id="${uid}" class="forward-detail-template" style="display:none">`;
	cardHtml += `<div class="forward-detail-title">${escapeHtml(part.title)}</div>`;
	for (const item of part.items) {
		// Format: senderName|timestamp: content  OR  plain text
		const pipeIdx = item.indexOf('|');
		if (pipeIdx > 0) {
			const sender = item.slice(0, pipeIdx).trim();
			const rest = item.slice(pipeIdx + 1).trimStart();
			const colonIdx = rest.indexOf(': ');
			const time = colonIdx > 0 ? rest.slice(0, colonIdx) : '';
			const content = colonIdx > 0 ? rest.slice(colonIdx + 2) : rest;
			const isSelf = isSelfMessage(sender, selfNames);
				const side = isSelf ? 'self' : 'other';
			cardHtml += `<div class="forward-item ${side}"><span class="forward-sender">${escapeHtml(sender)} <span class="forward-time">${escapeHtml(time)}</span></span>`;

			// Classify and render — shared logic with main chat
			const sr = classifyAndRender(content, metaMap, 'forward');
			if (sr.type === 'file') {
				// Merge-forward uses compact file card
				const raw = content.match(/!\[\[(.+?)\]\]/)?.[1] || '';
				const uri = raw.startsWith('RESOLVED:') ? raw.slice(9).split('?')[0] : '';
				const filename = raw.replace(/^RESOLVED:/, '').split('?')[0].split('/').pop() || raw;
				const ext = (filename.split('.').pop() || '').toUpperCase();
				cardHtml += `<div class="forward-media">${renderFileCardMini(ext, safeDecodeURI(filename), uri)}</div>`;
			} else if (sr.type === 'media') {
				cardHtml += `<div class="forward-media">${sr.html}</div>`;
			} else {
				cardHtml += `<div class="forward-bubble">${sr.html}</div>`;
			}
			cardHtml += '</div>';
		} else {
			cardHtml += `<div class="forward-item system"><span class="forward-plain">${escapeHtml(item)}</span></div>`;
		}
	}
	cardHtml += '</div>';

	cardHtml += '<div class="forward-footer">聊天记录</div>';
	return cardHtml;
}

function safeDecodeURI(str: string): string {
	try { return decodeURIComponent(str); } catch { return str; }
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function encodeURI(str: string): string {
	return encodeURIComponent(str).replace(/%2F/g, '/');
}
