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
	avatar?: string;  // card avatar image (peeked from next line)
}

export interface ForwardItem {
	sender: string;
	time: string;
	content: string | MergeForward;
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
	cover?: string;  // optional cover image URL (e.g. bilibili thumbnail)
	desc?: string;   // optional description (e.g. author·duration·views)
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
	avatar?: string;  // ![[filename]] on next line
}

export interface ParseResult {
	preamble: string;
	messages: ChatMessage[];
}

const HEADER_RE = /^\[(.*?)\]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
export const QUOTE_REPLY_RE = /^>\s*\[(.+?)\]\s+(.+)/;
const MERGE_FORWARD_RE = /^\[合并转发\|(.+?)\]/;
const LINK_CARD_RE = /^\[(?:链接|小程序)\|([^\]]+)\]\((.+)\)$/;
export { LINK_CARD_RE };
export const LOCATION_RE = /^\[位置\|([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]/;
export const CARD_RE = /^\[名片\|([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]/;
export const QUOTE_CARD_RE = /^\[名片\](.+)/;  // quote format: [名片]昵称
/** Merge forward sender line: 名字 YYYY-M-D [上午/下午] H:MM[:SS] */
const FORWARD_SENDER_RE = /^(.+?)\s+(\d{4}-\d{1,2}-\d{1,2}\s+(?:上午|下午|凌晨|中午)?\s*\d{1,2}:\d{2}(?::\d{2})?)/;

interface CardLine { indent: number; text: string; }

/** Recursively parse forward items, detecting nested merge-forwards by indent depth */
function parseForwardItems(lines: CardLine[], baseIndent: number): (ForwardItem | ForwardPlainItem)[] {
	const items: (ForwardItem | ForwardPlainItem)[] = [];
	for (let k = 0; k < lines.length; k++) {
		const { indent, text } = lines[k];
		const sm = text.match(FORWARD_SENDER_RE);
		if (sm) {
			// Check if sender's content is a nested merge-forward
			if (k + 1 < lines.length) {
				const next = lines[k + 1];
				const nm = next.text.match(MERGE_FORWARD_RE);
				if (nm && next.indent >= indent) {
					k++; // consume [合并转发|...] line
					const nestedLines: CardLine[] = [];
					const nestedBase = next.indent;
					while (k + 1 < lines.length && lines[k + 1].indent > nestedBase) {
						k++;
						nestedLines.push(lines[k]);
					}
					items.push({
						sender: sm[1], time: sm[2],
						content: {
							type: 'merge-forward',
							title: nm[1],
							items: parseForwardItems(nestedLines, nestedBase)
						}
					});
					continue;
				}
			}
			// Normal text content
			let content = '';
			while (k + 1 < lines.length) {
				const next = lines[k + 1];
				if (next.indent <= indent && (FORWARD_SENDER_RE.test(next.text) || MERGE_FORWARD_RE.test(next.text))) break;
				k++;
				if (content) content += '\n';
				content += next.text;
			}
			items.push({ sender: sm[1], time: sm[2], content });
		} else {
			items.push({ plain: text });
		}
	}
	return items;
}

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
			const linkCard = parseLinkString(trimmed);
			if (linkCard) { currentMsg.body.push(linkCard); continue; }

			// ── Location card ──
			const locCard = parseLocationString(trimmed);
			if (locCard) { currentMsg.body.push(locCard); continue; }

			// ── Card (contact card) ──
			const cardObj = parseCardString(trimmed);
			if (cardObj) {
				// Peek next line for avatar (if not already on the same line)
				if (!cardObj.avatar && i + 1 < lines.length) {
					const next = lines[i + 1].trim();
					const imgMatch = next.match(/^!\[\[(.+?)\]\]$/);
					if (imgMatch) { cardObj.avatar = imgMatch[1]; i++; }
				}
				currentMsg.body.push(cardObj);
				continue;
			}

			// ── Merge forward card ──
			const forwardMatch = line.match(MERGE_FORWARD_RE);
			if (forwardMatch) {
				const title = forwardMatch[1];
				const cardLines: CardLine[] = [];
				let j = i + 1;
				while (j < lines.length) {
					const next = lines[j];
					if (HEADER_RE.test(next) || next.trim() === '') {
						if (next.trim() === '') { j++; continue; }
						break;
					}
					const cm = next.match(/^(\s*)(.+)/);
					if (cm && cm[1].length >= 2) {
						cardLines.push({ indent: cm[1].length, text: cm[2] });
					}
					j++;
				}
				const mergedItems = parseForwardItems(cardLines, 2);
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
				let avatar: string | undefined;
				let j = i + 1;
				while (j < lines.length) {
					const nl = lines[j].trim();
					if (!nl || HEADER_RE.test(nl)) break;
					// If quote is a card (pipe format or [名片]昵称) and next line is an image
					if (!replyContent && !avatar && (CARD_RE.test(quote) || QUOTE_CARD_RE.test(quote))) {
						const imgMatch = nl.match(/^!\[\[(.+?)\]\]$/);
						if (imgMatch) { avatar = imgMatch[1]; j++; continue; }
					}
					if (replyContent) replyContent += NL;
					replyContent += nl;
					j++;
				}
				currentMsg.body.push({ type: 'quote-reply', sender, quote, reply: replyContent, avatar });
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

/**
 * Parse a [链接|小程序|title|cover?|desc?](url) line into a LinkCard.
 * Exported for reuse by chat-view.ts renderQuoteBar and renderMergeForward.
 */
export function parseLinkString(content: string): LinkCard | null {
	const m = content.trim().match(LINK_CARD_RE);
	if (!m) return null;
	const parts = m[1].split('|');
	const secondIsUrl = parts.length >= 2 && /^https?:\/\//i.test(parts[1].trim());
	return {
		type: 'link-card',
		title: parts[0],
		url: m[2],
		cover: secondIsUrl ? parts[1].trim() : undefined,
		desc: secondIsUrl ? parts[2]?.trim() || undefined : (parts.length >= 2 ? parts[1] : undefined),
	};
}

/**
 * Parse a [位置|label|city|lat|lng] line into a LocationCard.
 * Exported for reuse by chat-view.ts renderQuoteBar and renderMergeForward.
 */
export function parseLocationString(content: string): LocationCard | null {
	const m = content.trim().match(LOCATION_RE);
	if (!m) return null;
	const label = m[1];
	const city = m[2] || undefined;
	let lat: number | undefined;
	let lng: number | undefined;
	const c3 = m[3];
	const c4 = m[4];
	if (c3 && c4) { lat = parseFloat(c3); lng = parseFloat(c4); }
	else if (c3 && c3.includes(',')) { const [a, b] = c3.split(','); lng = parseFloat(a); lat = parseFloat(b); }
	return { type: 'location', label, city, lat, lng };
}

/**
 * Parse a [名片|nickname|alias|sex|region] line into a Card.
 * Checks for trailing ![[avatar]] on the same line; caller should also peek next line.
 */
export function parseCardString(content: string): Card | null {
	const trimmed = content.trim();
	const m = trimmed.match(CARD_RE);
	if (!m) return null;
	const f2 = m[2] || '';
	const f3 = m[3] || '';
	const f4 = m[4] || '';
	const isPersonal = f2.includes('微信号') || (!!f2 && !!f3);
	let avatar: string | undefined;
	const after = trimmed.slice(m[0].length);
	const imgMatch = after.match(/^!\[\[(.+?)\]\]/);
	if (imgMatch) avatar = imgMatch[1];
	return {
		type: 'card',
		nickname: m[1],
		alias: isPersonal ? f2 || undefined : undefined,
		sex: isPersonal ? f3 || undefined : undefined,
		region: isPersonal ? (f4 || f2 || undefined) : (f2 || undefined),
		avatar,
	};
}

/** Build city+label address string, avoiding duplicate city in label */
export function formatLocationAddress(label: string, city?: string): string {
	return (city && !label.includes(city)) ? `${city} ${label}` : label;
}

/** Build OSM URL for a lat/lng pair */
export function buildGeoUrl(lat: number, lng: number): string {
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=15`;
}
