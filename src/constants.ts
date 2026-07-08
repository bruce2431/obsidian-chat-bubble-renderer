/**
 * Shared constants — extension lists used by both main.ts and chat-view.ts
 */

export const AUDIO_EXTS = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'amr', 'silk'];
export const VIDEO_EXTS = ['mp4', 'webm', 'mov'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
export const FILE_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar', '7z'];

/** Precompiled regex using the above lists (used by chat-view.ts for per-message checks) */
export const FILE_EXT_RE = new RegExp(`\\.(${FILE_EXTS.join('|')})\\b`, 'i');
