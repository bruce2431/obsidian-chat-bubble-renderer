/**
 * Chat View - 气泡对话框渲染器
 * 将解析后的聊天消息渲染为微信风格气泡 UI
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
			const bodyHtml = renderMessageBody(msg);

			html += `<div class="chat-msg ${side}">`;
			html += `<div class="chat-meta">${escapeHtml(msg.name)} · ${msg.time}</div>`;
			html += `<div class="chat-bubble">${bodyHtml}</div>`;
			html += '</div>';
		}

		html += '</div>';
	}

	return html;
}

function isSelfMessage(name: string): boolean {
	const selfNames = ['自己', '我', 'me'];
	return selfNames.some(n => name.toLowerCase() === n.toLowerCase());
}

function renderMessageBody(msg: ChatMessage): string {
	let html = '';
	for (const part of msg.body) {
		if (typeof part === 'string') {
			html += renderPlainText(part) + NL;
		} else if (part.type === 'quote-reply') {
			html += renderQuoteReply(part);
		} else if (part.type === 'merge-forward') {
			html += renderMergeForward(part);
		}
	}
	return html;
}

function renderPlainText(text: string): string {
	let result = escapeHtml(text);

	result = result.replace(/!\[\[(.+?)(?:\|(\d+))?\]\]/g, (_m, file: string, w: string) => {
		file = file.trim();
		const ext = file.split('.').pop()?.toLowerCase() || '';

		if (['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(ext)) {
			return `<div class="chat-media"><audio controls src="${encodeURI(file)}" style="max-width:260px;height:32px;" onerror="this.style.display='none'"></audio></div>`;
		}
		if (['mp4', 'webm', 'mov'].includes(ext)) {
			return `<div class="chat-media"><video controls src="${encodeURI(file)}" style="max-width:280px;max-height:200px;" onerror="this.style.display='none'"></video></div>`;
		}
		const width = w ? ` width="${w}"` : '';
		return `<div class="chat-img"><img src="${encodeURI(file)}"${width} loading="lazy" onerror="this.style.display='none'"></div>`;
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
