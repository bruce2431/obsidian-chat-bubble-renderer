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

export function renderChatLog(markdown: string, fileMetas?: FileMeta[]): string {
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
			const isSelf = isSelfMessage(msg.name);
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
					const rendered = renderPlainText(part);
					if (isFileAttachment(part)) {
						fileHtml += renderFileCard(part, metaMap);
						isAllSystem = false;
					} else if (isMediaOnly(part)) {
						mediaHtml += rendered;
						isAllSystem = false;
					} else if (isSystemMessage(part)) {
						systemHtml += rendered + NL;
						isAllSystem = isAllSystem && true;
					} else {
						textHtml += rendered + NL;
						isAllSystem = false;
					}
				} else {
					// quote-reply or merge-forward — not system
					if (part.type === 'quote-reply') {
						quoteHtml = renderQuoteBar(part.sender, part.quote);
						textHtml += renderPlainText(part.reply);
					} else if (part.type === 'merge-forward') {
						forwardHtml += renderMergeForward(part);
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

/** Returns true if the text is purely a media reference (no surrounding text) */
function isMediaOnly(text: string): boolean {
	const trimmed = text.trim();
	if (!/^!\[\[.+?\]\]$/.test(trimmed)) return false;
	if (trimmed.includes('RESOLVED:')) {
		// RESOLVED data URIs are media; app:// could be file attachment — check extension
		if (trimmed.includes('data:audio/') || trimmed.includes('data:video/')) return true;
		// app:// URL — check if it's a media extension
		const mediaExts = /\.(png|jpe?g|gif|webp|bmp|svg|mp3|m4a|wav|ogg|aac|amr|silk|mp4|webm|mov|emoj)/i;
		return mediaExts.test(trimmed);
	}
	const mediaExts = /\.(png|jpe?g|gif|webp|bmp|svg|mp3|m4a|wav|ogg|aac|amr|silk|mp4|webm|mov|emoj)\b/i;
	return mediaExts.test(trimmed);
}

/** Returns true if the text is a file attachment (PDF, DOC, etc.) */
function isFileAttachment(text: string): boolean {
	const trimmed = text.trim();
	if (!/^!\[\[.+?\]\]$/.test(trimmed)) return false;
	const fileExts = /\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|7z)\b/i;
	return fileExts.test(trimmed);
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
	const clickAttr = ext === 'PDF' && url
		? ` onclick="(function(){var o=document.createElement('div');o.className='chat-file-overlay';o.addEventListener('click',function(e){if(e.target===o)o.remove()});var m=document.createElement('div');m.className='chat-file-modal';var x=document.createElement('div');x.className='chat-forward-modal-close';x.textContent='✕';x.addEventListener('click',function(){o.remove()});m.appendChild(x);var f=document.createElement('iframe');f.src='${url}';f.style.width='100%';f.style.height='75vh';f.style.border='none';f.style.borderRadius='0 0 12px 12px';m.appendChild(f);o.appendChild(m);document.body.appendChild(o)})()"`
		: '';

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

function isSelfMessage(name: string): boolean {
	const selfNames = ['自己', '我', 'me'];
	return selfNames.some(n => name.toLowerCase() === n.toLowerCase());
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
	return `(function(t){var o=document.createElement('div');o.className='chat-media-overlay';o.addEventListener('click',function(ev){if(ev.target===o)o.remove()});var m=document.createElement('div');m.className='chat-media-modal';var x=document.createElement('div');x.className='chat-forward-modal-close';x.textContent='✕';x.addEventListener('click',function(){o.remove()});m.appendChild(x);${el};m.appendChild(e);o.appendChild(m);document.body.appendChild(o)})(event.target)`.replace(/"/g, '&quot;');
}

/** 渲染引用条（仅 bar，不含回复正文） */
function renderQuoteBar(sender: string, quote: string): string {
	return `<div class="chat-quote-bar">${escapeHtml(sender)}: ${escapeHtml(quote)}</div>`;
}

function renderMergeForward(part: MergeForward): string {
	const uid = 'fw-' + Math.random().toString(36).slice(2, 8);

	let cardHtml = '<div class="chat-forward-card">';
	cardHtml += `<div class="forward-title">${escapeHtml(part.title)}</div>`;

	// Click to open modal — clone hidden template, wrap in overlay
	cardHtml += `<div class="forward-expand" onclick="(function(){var t=document.getElementById('${uid}'),c=t.cloneNode(true);c.style.display='';var o=document.createElement('div');o.className='chat-forward-overlay';o.addEventListener('click',function(e){if(e.target===o)o.remove()});var m=document.createElement('div');m.className='chat-forward-modal';m.appendChild(c);o.appendChild(m);document.body.appendChild(o)})()">查看全部聊天记录</div>`;
	cardHtml += '</div>';

	// Hidden template — all items rendered into modal
	cardHtml += `<div id="${uid}" class="forward-detail-template" style="display:none">`;
	cardHtml += `<div class="forward-detail-title">${escapeHtml(part.title)}</div>`;
	for (const item of part.items) {
		cardHtml += `<div class="forward-item">${escapeHtml(item)}</div>`;
	}
	cardHtml += '</div>';

	cardHtml += '<div class="forward-footer">聊天记录</div>';
	return cardHtml;
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
