import type { TranscriptSegment, TranscriptWord } from "@/lib/ai/types";

export type SubtitleStyleName =
  | "KARAOKE"
  | "BOLD"
  | "MINIMAL"
  | "HIGHLIGHT_WORD"
  | "PODCAST"
  | "GAMING"
  | "MODERN"
  | "CLEAN";

export interface SubtitleSettings {
  style: SubtitleStyleName;
  fontFamily?: string;
  fontSize?: number;
  position?: "top" | "middle" | "bottom_safe";
  color?: string; // hex, e.g. "#FFFFFF"
  highlightColor?: string; // hex, active-word color for karaoke-style presets
  backgroundColor?: string | null; // hex, or null for no box
  outlineColor?: string;
  shadow?: boolean;
  wordsPerLine?: number;
  /** Bottom safe-area margin in px, at a 1920px-tall canvas, keeping text
   * clear of TikTok/Reels/Shorts UI chrome (spec section 9). Admin-configurable default. */
  safeAreaBottomPx?: number;
}

interface ResolvedPreset {
  fontFamily: string;
  fontSize: number;
  color: string;
  highlightColor: string;
  backgroundColor: string | null;
  outlineColor: string;
  outlineWidth: number;
  shadow: number;
  bold: boolean;
  italic: boolean;
  karaoke: boolean;
}

const STYLE_PRESETS: Record<SubtitleStyleName, ResolvedPreset> = {
  BOLD: {
    fontFamily: "Arial Black",
    fontSize: 84,
    color: "#FFFFFF",
    highlightColor: "#31D6C2",
    backgroundColor: null,
    outlineColor: "#000000",
    outlineWidth: 5,
    shadow: 0,
    bold: true,
    italic: false,
    karaoke: false,
  },
  MINIMAL: {
    fontFamily: "Helvetica",
    fontSize: 58,
    color: "#FFFFFF",
    highlightColor: "#FFFFFF",
    backgroundColor: null,
    outlineColor: "#000000",
    outlineWidth: 2,
    shadow: 0,
    bold: false,
    italic: false,
    karaoke: false,
  },
  KARAOKE: {
    fontFamily: "Arial Black",
    fontSize: 78,
    color: "#FFFFFF",
    highlightColor: "#31D6C2",
    backgroundColor: null,
    outlineColor: "#000000",
    outlineWidth: 4,
    shadow: 0,
    bold: true,
    italic: false,
    karaoke: true,
  },
  HIGHLIGHT_WORD: {
    fontFamily: "Arial Black",
    fontSize: 78,
    color: "#FFFFFF",
    highlightColor: "#F2B84B",
    backgroundColor: null,
    outlineColor: "#000000",
    outlineWidth: 4,
    shadow: 0,
    bold: true,
    italic: false,
    karaoke: true,
  },
  PODCAST: {
    fontFamily: "Georgia",
    fontSize: 62,
    color: "#FFFFFF",
    highlightColor: "#FFFFFF",
    backgroundColor: "#000000",
    outlineColor: "#000000",
    outlineWidth: 0,
    shadow: 0,
    bold: false,
    italic: false,
    karaoke: false,
  },
  GAMING: {
    fontFamily: "Impact",
    fontSize: 82,
    color: "#39FF14",
    highlightColor: "#FF3B3B",
    backgroundColor: null,
    outlineColor: "#000000",
    outlineWidth: 5,
    shadow: 0,
    bold: true,
    italic: true,
    karaoke: true,
  },
  MODERN: {
    fontFamily: "Helvetica Neue",
    fontSize: 66,
    color: "#FFFFFF",
    highlightColor: "#31D6C2",
    backgroundColor: null,
    outlineColor: "#00000000",
    outlineWidth: 0,
    shadow: 2,
    bold: true,
    italic: false,
    karaoke: false,
  },
  CLEAN: {
    fontFamily: "Helvetica",
    fontSize: 60,
    color: "#FFFFFF",
    highlightColor: "#FFFFFF",
    backgroundColor: null,
    outlineColor: "#000000",
    outlineWidth: 2,
    shadow: 0,
    bold: false,
    italic: false,
    karaoke: false,
  },
};

function resolvePreset(settings: SubtitleSettings): ResolvedPreset {
  const base = STYLE_PRESETS[settings.style];
  return {
    ...base,
    fontFamily: settings.fontFamily ?? base.fontFamily,
    fontSize: settings.fontSize ?? base.fontSize,
    color: settings.color ?? base.color,
    highlightColor: settings.highlightColor ?? base.highlightColor,
    backgroundColor:
      settings.backgroundColor !== undefined
        ? settings.backgroundColor
        : base.backgroundColor,
    outlineColor: settings.outlineColor ?? base.outlineColor,
  };
}

/** "#RRGGBB" -> ASS's "&HAABBGGRR" (alpha 00 = opaque). */
function hexToAss(hex: string, alpha = "00"): string {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "&H00FFFFFF";
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function groupWords(
  words: TranscriptWord[],
  wordsPerLine: number,
): TranscriptWord[][] {
  const groups: TranscriptWord[][] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    groups.push(words.slice(i, i + wordsPerLine));
  }
  return groups;
}

function buildKaraokeLine(words: TranscriptWord[]): string {
  return words
    .map((w) => {
      const centiseconds = Math.max(
        1,
        Math.round((w.end - w.start) * 100),
      );
      return `{\\k${centiseconds}}${escapeAssText(w.word)}`;
    })
    .join(" ");
}

function escapeAssText(text: string): string {
  return text.replace(/\{/g, "(").replace(/\}/g, ")");
}

export function buildAssSubtitle(
  segments: TranscriptSegment[],
  settings: SubtitleSettings,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const preset = resolvePreset(settings);
  const wordsPerLine = settings.wordsPerLine ?? 3;
  const safeAreaBottom = settings.safeAreaBottomPx ?? Math.round(canvasHeight * 0.14);

  const alignment = settings.position === "top" ? 8 : settings.position === "middle" ? 5 : 2;
  const marginV = settings.position === "top" ? Math.round(canvasHeight * 0.08) : safeAreaBottom;

  const primary = preset.karaoke
    ? hexToAss(preset.color)
    : hexToAss(preset.color);
  const secondary = hexToAss(preset.highlightColor);
  const outline = hexToAss(preset.outlineColor);
  const back = preset.backgroundColor
    ? hexToAss(preset.backgroundColor, "40")
    : "&H00000000";
  const borderStyle = preset.backgroundColor ? 3 : 1;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvasWidth}
PlayResY: ${canvasHeight}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${preset.fontFamily},${preset.fontSize},${primary},${secondary},${outline},${back},${preset.bold ? -1 : 0},${preset.italic ? -1 : 0},0,0,100,100,0,0,${borderStyle},${preset.outlineWidth},${preset.shadow},${alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];

  for (const segment of segments) {
    if (preset.karaoke && segment.words && segment.words.length > 0) {
      for (const group of groupWords(segment.words, wordsPerLine)) {
        const first = group[0];
        const last = group[group.length - 1];
        if (!first || !last) continue;
        const text = buildKaraokeLine(group);
        lines.push(
          `Dialogue: 0,${formatAssTime(first.start)},${formatAssTime(last.end)},Default,,0,0,0,,${text}`,
        );
      }
    } else {
      // No word-level timing available (or a non-karaoke style): render the
      // whole segment as one static line, word-wrapped by wordsPerLine.
      const words = segment.text.trim().split(/\s+/);
      const groups: string[][] = [];
      for (let i = 0; i < words.length; i += wordsPerLine) {
        groups.push(words.slice(i, i + wordsPerLine));
      }
      const duration = segment.end - segment.start;
      const perGroup = duration / Math.max(1, groups.length);
      groups.forEach((group, i) => {
        const start = segment.start + i * perGroup;
        const end = segment.start + (i + 1) * perGroup;
        lines.push(
          `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${escapeAssText(group.join(" "))}`,
        );
      });
    }
  }

  return header + lines.join("\n") + "\n";
}

// ── Plain SRT / VTT export (spec section 21/37 — "Subtitle File" option) ─

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function buildSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text.trim()}\n`,
    )
    .join("\n");
}

export function buildVtt(segments: TranscriptSegment[]): string {
  const body = segments
    .map(
      (seg) =>
        `${formatSrtTime(seg.start).replace(",", ".")} --> ${formatSrtTime(seg.end).replace(",", ".")}\n${seg.text.trim()}\n`,
    )
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
