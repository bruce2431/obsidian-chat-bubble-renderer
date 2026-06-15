/**
 * Chat Parser - 解析 #聊天记录 Markdown 文件
 * 
 * 输入格式：
 * ---
 * tags:
 *   - 类别/聊天记录
 * ---
 * 
 * [发送者名] YYYY-MM-DD HH:MM:SS
 * 消息内容
 * 
 * > 引用者(wxid_xxx) MM-DD HH:MM
 * > 被引用内容
 * > > [引用]
 * 回复内容
 * 
 * [合并转发|对话标题]
 *   发送者名 YYYY-MM-DD HH:MM
 *   消息内容
 */

export interface ChatMessage {
	name: string;
	time: string;
	body: (string | QuoteReply | MergeForward)[];
}

export interface QuoteReply {
	type: 'quote-reply';
	sender: string;
	quote: string;
	reply: string;
}

export interface MergeForward {
	type: 'merge-forward';
	title: string;
	items: string[];
}

export interface ParseResult {
	preamble: string;
	messages: ChatMessage[];
}

const HEADER_RE = /^\[(.+?)\]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
const QUOTE_REPLY_RE = /^>\s+(.+?)\(wxid_[^)]+\)\s+\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s*$/;
const QUOTE_CONTENT_RE = /^>\s+(.+)/;
const QUOTE_REF_RE = /^>\s*>\s*\[引用\]/;
const MERGE_FORWARD_RE = /^\[合并转发\|(.+?)\]/;
const INDENT_CONTENT_RE = /^\s{2,}(.+)/;

export function parseChatLog(markdown: string): ParseResult {
	const lines = markdown.split('\n');
	const preamble: string[] = [];
	const messages: ChatMessage[] = [];
	let currentMsg: ChatMessage | null = null;

	// Skip YAML frontmatter
	let startIdx = 0;
	if (lines.length > 0 && lines[0].trim() === '---') {
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				startIdx = i + 1;
				break;
			}
		}
	}

	for (let i = startIdx; i < lines.length; i++) {
		const line = lines[i];
		const m = line.match(HEADER_RE);

		if (m) {
			// New message header
			if (currentMsg) messages.push(currentMsg);
			currentMsg = { name: m[1], time: m[2], body: [] };
			const rest = line.slice(m[0].length).trim();
			if (rest) currentMsg.body.push(rest);
		} else if (currentMsg) {
			const trimmed = line.trim();

			// ── Merge forward card ──
			const forwardMatch = line.match(MERGE_FORWARD_RE);
			if (forwardMatch) {
				const title = forwardMatch[1];
				const cardLines: string[] = [];
				let j = i + 1;
				while (j < lines.length) {
					const next = lines[j];
					if (HEADER_RE.test(next) || next.trim() === '') {
						if (next.trim() === '') { j++; continue; }
						break;
					}
					const indentMatch = next.match(INDENT_CONTENT_RE);
					if (indentMatch) {
						cardLines.push(indentMatch[1]);
					}
					j++;
				}
				// Merge sender lines with following content
				const mergedItems: string[] = [];
				const senderRe = /^(.+?)\s+\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/;
				for (let k = 0; k < cardLines.length; k++) {
					if (senderRe.test(cardLines[k]) && k + 1 < cardLines.length && !senderRe.test(cardLines[k + 1])) {
						const senderName = cardLines[k].match(senderRe)![1];
						mergedItems.push(senderName + ': ' + cardLines[k + 1]);
						k++;
					} else {
						mergedItems.push(cardLines[k]);
					}
				}
				currentMsg.body.push({ type: 'merge-forward', title, items: mergedItems });
				i = j - 1;
				continue;
			}

			// ── Quote reply ──
			if (QUOTE_REPLY_RE.test(line)) {
				const senderMatch = line.match(QUOTE_REPLY_RE)!;
				const sender = senderMatch[1];
				let quoteContent = '';
				let j = i + 1;
				while (j < lines.length) {
					const nl = lines[j].trim();
					if (QUOTE_REF_RE.test(nl)) { j++; continue; }
					if (nl.startsWith('> ')) {
						const contentMatch = nl.match(QUOTE_CONTENT_RE);
						if (contentMatch) {
							if (quoteContent) quoteContent += '\n';
							quoteContent += contentMatch[1];
						}
						j++;
					} else {
						break;
					}
				}
				let replyContent = '';
				while (j < lines.length) {
					const nl = lines[j].trim();
					if (!nl || HEADER_RE.test(nl)) break;
					if (replyContent) replyContent += '\n';
					replyContent += nl;
					j++;
				}
				currentMsg.body.push({ type: 'quote-reply', sender, quote: quoteContent, reply: replyContent });
				i = j - 1;
				continue;
			}

			// ── Plain content ──
			if (trimmed) {
				currentMsg.body.push(line);
			} else if (currentMsg.body.length > 0) {
				currentMsg.body.push('');
			}
		} else {
			preamble.push(line);
		}
	}
	if (currentMsg) messages.push(currentMsg);

	const preambleText = preamble.join('\n').trim();
	return { preamble: preambleText, messages };
}
