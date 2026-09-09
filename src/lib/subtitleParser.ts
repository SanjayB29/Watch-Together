export interface SubtitleCue {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

/**
 * Parses simple SRT and WebVTT subtitle text into timed cues
 */
export function parseSRTOrVTT(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block || block === 'WEBVTT') continue;

    const lines = block.split('\n');
    let timeLineIdx = 0;

    // Check if first line is a numeric sequence counter (SRT format)
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIdx = 1;
    }

    if (!lines[timeLineIdx]) continue;
    const timeMatch = lines[timeLineIdx].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );

    if (timeMatch) {
      const start =
        parseInt(timeMatch[1], 10) * 3600 +
        parseInt(timeMatch[2], 10) * 60 +
        parseInt(timeMatch[3], 10) +
        parseInt(timeMatch[4], 10) / 1000;

      const end =
        parseInt(timeMatch[5], 10) * 3600 +
        parseInt(timeMatch[6], 10) * 60 +
        parseInt(timeMatch[7], 10) +
        parseInt(timeMatch[8], 10) / 1000;

      const text = lines.slice(timeLineIdx + 1).join(' ').trim();
      if (text) {
        cues.push({
          id: `cue_${i}`,
          start,
          end,
          text,
        });
      }
    }
  }

  return cues;
}

/**
 * Finds the currently active subtitle cue for a given playback time
 */
export function getActiveCue(cues: SubtitleCue[], currentTime: number): SubtitleCue | null {
  return cues.find((c) => currentTime >= c.start && currentTime <= c.end) || null;
}
