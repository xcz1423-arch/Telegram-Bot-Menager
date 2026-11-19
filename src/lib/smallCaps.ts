const SMALL_CAPS_MAP: Record<string, string> = {
  a: 'ᴀ',
  b: 'ʙ',
  c: 'ᴄ',
  d: 'ᴅ',
  e: 'ᴇ',
  f: 'ғ',
  g: 'ɢ',
  h: 'ʜ',
  i: 'ɪ',
  j: 'ᴊ',
  k: 'ᴋ',
  l: 'ʟ',
  m: 'ᴍ',
  n: 'ɴ',
  o: 'ᴏ',
  p: 'ᴘ',
  q: 'ǫ',
  r: 'ʀ',
  s: 's',
  t: 'ᴛ',
  u: 'ᴜ',
  v: 'ᴠ',
  w: 'ᴡ',
  x: 'x',
  y: 'ʏ',
  z: 'ᴢ',
};

const PRESERVE_SEGMENT_RE = /(https?:\/\/[^\s]+|sandbox:[^\s]+|@[a-zA-Z0-9_]{2,}|\b\d{6,}:[A-Za-z0-9_-]{10,}\b)/g;

function convertWordChars(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    const mapped = SMALL_CAPS_MAP[lower];
    out += mapped ?? ch;
  }
  return out;
}

/**
 * Converts standard English letters into Unicode Small Capitals (e.g. "Target" -> "ᴛᴀʀɢᴇᴛ")
 * while preserving URLs, @usernames, sandbox tokens, and Telegram bot tokens intact.
 */
export function toSmallCaps(input: string): string {
  if (!input) return input;

  let result = '';
  let lastIndex = 0;
  PRESERVE_SEGMENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PRESERVE_SEGMENT_RE.exec(input)) !== null) {
    if (match.index > lastIndex) {
      result += convertWordChars(input.slice(lastIndex, match.index));
    }
    result += match[0];
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    result += convertWordChars(input.slice(lastIndex));
  }

  return result;
}
