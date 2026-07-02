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
 * > [引用者] 被引用内容
 * 回复内容
 * 
 * [合并转发|对话标题]
 *   发送者名 YYYY-MM-DD HH:MM
 *   消息内容
 * 
 * [链接|链接标题](URL)
 *   链接内容
 */

const NL = String.fromCharCode(10); // newline — avoids esbuild CRLF mangling

export interface ChatMessage {
	name: string;
	time: string;
	body: (string | QuoteReply | MergeForward | LinkCard | LocationCard | Card)[];
}

export interface QuoteReply {
	type: 'quote-reply';
	sender: string;
	quote: string;
	reply: string;
}

export interface ForwardItem {
	sender: string;
	time: string;
	content: string;
}

export interface ForwardPlainItem {
	plain: string;
}

export interface MergeForward {
	type: 'merge-forward';
	title: string;
	items: (ForwardItem | ForwardPlainItem)[];
}

export interface LinkCard {
	type: 'link-card';
	title: string;
	url: string;
}

export interface LocationCard {
	type: 'location';
	label: string;
	city?: string;
	lat?: number;
	lng?: number;
}

export interface Card {
	type: 'card';
	nickname: string;
	alias?: string;   // 微信号:xxx (personal only)
	sex?: string;     // personal only
	region?: string;  // province/city
}

export interface ParseResult {
	preamble: string;
	messages: ChatMessage[];
}

const HEADER_RE = /^\[(.*?)\]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
const QUOTE_REPLY_RE = /^>\s*\[(.+?)\]\s+(.+)/;
const MERGE_FORWARD_RE = /^\[合并转发\|(.+?)\]/;
const LINK_CARD_RE = /^\[链接\|(.+?)\]\((.+)\)$/;
export const LOCATION_RE = /^\[位置\|([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]/;
export const CARD_RE = /^\[名片\|([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]/;
const INDENT_CONTENT_RE = /^\s{2,}(.+)/;
/** Merge forward sender line: 名字 YYYY-M-D [上午/下午] H:MM[:SS] */
const FORWARD_SENDER_RE = /^(.+?)\s+(\d{4}-\d{1,2}-\d{1,2}\s+(?:上午|下午|凌晨|中午)?\s*\d{1,2}:\d{2}(?::\d{2})?)/;

export function parseChatLog(markdown: string): ParseResult {
	const lines = markdown.split(/\r?\n/);
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

			// ── Link card ──
			const linkMatch = trimmed.match(LINK_CARD_RE);
			if (linkMatch) {
				currentMsg.body.push({ type: 'link-card', title: linkMatch[1], url: linkMatch[2] });
				continue;
			}

			// ── Location card ──
			const locMatch = trimmed.match(LOCATION_RE);
			if (locMatch) {
				const label = locMatch[1];
				const city = locMatch[2] || undefined;
				let lat: number | undefined;
				let lng: number | undefined;
				// Pipe-separated: wetrace message.go [label|city|lat|lng]
				// Comma-separated: wetrace2md [label|city|lng,lat]
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
				currentMsg.body.push({ type: 'location', label, city, lat, lng });
				continue;
			}

			// ── Card (contact card) ──
			const cardMatch = trimmed.match(CARD_RE);
			if (cardMatch) {
				const nickname = cardMatch[1];
				const f2 = cardMatch[2] || '';
				const f3 = cardMatch[3] || '';
				const f4 = cardMatch[4] || '';
				// Distinguish personal card vs official account
				// Personal: [名片|昵称|微信号:xxx|性别|地区]  — 4 fields after nickname
				// Official: [名片|昵称|地区]  — 2 fields after nickname
				const isPersonal = f2.includes('微信号') || (!!f2 && !!f3);
				currentMsg.body.push({
					type: 'card',
					nickname,
					alias: isPersonal ? f2 || undefined : undefined,
					sex: isPersonal ? f3 || undefined : undefined,
					region: isPersonal ? f4 || f2 || undefined : f2 || undefined,
				});
				continue;
			}

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
				// Merge sender lines with following content (greedy: consume all non-sender lines)
				const mergedItems: (ForwardItem | ForwardPlainItem)[] = [];
				for (let k = 0; k < cardLines.length; k++) {
					const sm = cardLines[k].match(FORWARD_SENDER_RE);
					if (sm) {
						let content = '';
						while (k + 1 < cardLines.length && !FORWARD_SENDER_RE.test(cardLines[k + 1])) {
							k++;
							if (content) content += '\n';
							content += cardLines[k];
						}
						mergedItems.push({ sender: sm[1], time: sm[2], content });
					} else {
						mergedItems.push({ plain: cardLines[k] });
					}
				}
				currentMsg.body.push({ type: 'merge-forward', title, items: mergedItems });
				i = j - 1;
				continue;
			}

			// ── Quote reply ──
			if (QUOTE_REPLY_RE.test(line)) {
				const m = line.match(QUOTE_REPLY_RE)!;
				const sender = m[1];
				const quote = m[2];
				let replyContent = '';
				let j = i + 1;
				while (j < lines.length) {
					const nl = lines[j].trim();
					if (!nl || HEADER_RE.test(nl)) break;
					if (replyContent) replyContent += NL;
					replyContent += nl;
					j++;
				}
				currentMsg.body.push({ type: 'quote-reply', sender, quote, reply: replyContent });
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

	const preambleText = preamble.join(NL).trim();
	return { preamble: preambleText, messages };
}
