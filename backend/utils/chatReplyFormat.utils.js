/**
 * Customer-facing chat replies must be plain text (no markdown or JSON chips).
 */

const JSON_FENCE_REGEX = /```[\s\S]*?```/g;

/** JSON array of strings only, e.g. ["Book Service"] — leaked action chips */
const ACTION_CHIP_ARRAY_REGEX = /\[\s*(?:"[^"]+"\s*(?:,\s*"[^"]+"\s*)*)\]/g;

function stripActionChipArrays(text) {
  return text.replace(ACTION_CHIP_ARRAY_REGEX, (match) => {
    try {
      const parsed = JSON.parse(match);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === 'string')) {
        return '';
      }
    } catch {
      /* keep non-JSON bracket text */
    }
    return match;
  });
}

/** Strip markdown and machine artifacts so replies read professionally in the widget. */
export function sanitizeChatReply(text = '') {
  if (!text || typeof text !== 'string') return '';

  let out = text.replace(JSON_FENCE_REGEX, '').trim();
  out = stripActionChipArrays(out);

  // Links: [label](url) → label
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Bold / italic
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');

  // Headings and inline code
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/`([^`]+)`/g, '$1');

  // List markers → bullet character (no asterisk)
  out = out.replace(/^[*\-]\s+/gm, '• ');

  // Stray markdown characters
  out = out.replace(/\*\*/g, '');
  out = out.replace(/__/g, '');

  // Trailing colons / whitespace left after chip removal
  out = out.replace(/[ \t]+$/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/** Parse optional action chips from model output (not shown in widget — stripped from text). */
export function extractActionChipsFromReply(reply = '') {
  let text = reply;
  let actionChips = [];

  const fenced = text.match(/```json\n?(\[[\s\S]*?\])\n?```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]);
      if (Array.isArray(parsed)) actionChips = parsed.filter((item) => typeof item === 'string');
      text = text.replace(fenced[0], '').trim();
    } catch {
      /* ignore */
    }
  }

  const trailing = text.match(/\n?\s*(\[\s*"[^"]+"(?:\s*,\s*"[^"]+")*\s*\])\s*$/);
  if (trailing) {
    try {
      const parsed = JSON.parse(trailing[1]);
      if (Array.isArray(parsed)) {
        actionChips = parsed.filter((item) => typeof item === 'string');
        text = text.replace(trailing[0], '').trim();
      }
    } catch {
      /* ignore */
    }
  }

  return { reply: sanitizeChatReply(text), actionChips };
}
