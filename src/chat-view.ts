/**
 * Chat View - 气泡对话框渲染器
 * 将解析后的聊天消息渲染为微信风格气泡 UI
 * 媒体文件（图片/音频/视频）不套气泡，直接渲染
 */

import { parseChatLog, ChatMessage, QuoteReply, MergeForward } from './chat-parser';

const NL = String.fromCharCode(10);

export function renderChatLog(markdown: string): string {
	const { preamble, messages } = parseChatLog(markdown);

	let html = '';

	if (preamble) {
		html += `<div class="chat-preamble">${escapeHtml(preamble.replace(/\n/g, '<br>'))}</div>`;
	}

	if (messages.length > 0) {
		html += '<div class="chat-container">';

		for (const msg of messages) {
			const isSelf = isSelfMessage(msg.name);
			const side = isSelf ? 'self' : 'other';

			// Split parts: text → bubble, media → bare
			let textHtml = '';
			let mediaHtml = '';

			for (const part of msg.body) {
				if (typeof part === 'string') {
					const rendered = renderPlainText(part);
					if (isMediaOnly(part)) {
						mediaHtml += rendered;
					} else if (rendered.trim()) {
						textHtml += rendered + NL;
					}
				} else if (part.type === 'quote-reply') {
					textHtml += renderQuoteReply(part);
				} else if (part.type === 'merge-forward') {
					textHtml += renderMergeForward(part);
				}
			}

			html += `<div class="chat-msg ${side}">`;
			html += `<div class="chat-meta">${escapeHtml(msg.name)} · ${msg.time}</div>`;
			if (textHtml) {
				html += `<div class="chat-bubble">${textHtml}</div>`;
			}
			html += mediaHtml;
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
	// RESOLVED: prefix = already handled audio/video/image (base64 or app://)
	if (trimmed.includes('RESOLVED:')) return true;
	// Fallback: filename with known media extension
	const mediaExts = /\.(png|jpe?g|gif|webp|bmp|svg|mp3|m4a|wav|ogg|aac|mp4|webm|mov|emoj)\b/i;
	return mediaExts.test(trimmed);
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
			const ext = uri.split('.').pop()?.toLowerCase() || '';
			if (['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(ext)) {
				return `<audio controls preload="auto" src="${uri}" class="chat-bare-audio" onerror="this.style.display='none'"></audio>`;
			}
			if (['mp4', 'webm', 'mov'].includes(ext)) {
				return `<video controls preload="auto" src="${uri}" class="chat-bare-video" onerror="this.style.display='none'"></video>`;
			}
			const width = w ? ` width="${w}"` : '';
			return `<img src="${uri}" class="chat-bare-img"${width} loading="lazy" onerror="this.style.display='none'">`;
		}

		const ext = file.split('.').pop()?.toLowerCase() || '';
		if (['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(ext)) {
			return `<audio controls preload="auto" src="${encodeURI(file)}" class="chat-bare-audio" onerror="this.style.display='none'"></audio>`;
		}
		if (['mp4', 'webm', 'mov'].includes(ext)) {
			return `<video controls preload="auto" src="${encodeURI(file)}" class="chat-bare-video" onerror="this.style.display='none'"></video>`;
		}
		const width = w ? ` width="${w}"` : '';
		return `<img src="${encodeURI(file)}" class="chat-bare-img"${width} loading="lazy" onerror="this.style.display='none'">`;
	});

	return result;
}

function renderQuoteReply(part: QuoteReply): string {
	let html = '';
	html += `<div>${renderPlainText(part.reply)}</div>`;
	html += `<div class="chat-quote-bar">${escapeHtml(part.sender)}: ${renderPlainText(part.quote)}</div>`;
	return html;
}

function renderMergeForward(part: MergeForward): string {
	let cardHtml = '<div class="chat-forward-card">';
	cardHtml += `<div class="forward-title">${escapeHtml(part.title)}</div>`;

	const preview = part.items.slice(0, 3);
	for (const item of preview) {
		cardHtml += `<div class="forward-item">${escapeHtml(item)}</div>`;
	}
	if (part.items.length > 3) {
		cardHtml += `<div class="forward-more">… 共 ${part.items.length} 条消息</div>`;
	}

	const uid = 'fw-' + Math.random().toString(36).slice(2, 8);
	cardHtml += `<div class="forward-expand" onclick="document.getElementById('${uid}').classList.toggle('open')">查看全部聊天记录</div>`;
	cardHtml += `<div class="forward-full" id="${uid}">`;
	for (const item of part.items) {
		cardHtml += `<div class="forward-item">${escapeHtml(item)}</div>`;
	}
	cardHtml += '</div></div>';
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
