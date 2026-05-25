/**
 * 时长处理工具库
 * 用于解析和格式化时间长度，支持多种输入格式
 */

/**
 * 尝试解析各种格式的时长字符串为秒数
 * 支持的格式：
 * - "7" → 7分钟 (≤20的整数默认按分钟处理)
 * - "30" → 30秒 (>20的整数默认按秒处理)
 * - "1:30" → 90秒
 * - "1分30秒" → 90秒
 * - "1分钟30秒" → 90秒
 * - "1.5分钟" → 90秒
 * - "90s" → 90秒
 * - "1.5m" → 90秒
 * - "1m30s" → 90秒
 * - "1h30m" → 5400秒
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 尝试直接解析为数字（特殊逻辑：≤20为分钟，>20为秒）
  const numOnly = parseFloat(trimmed);
  if (!isNaN(numOnly) && /^\d*\.?\d*$/.test(trimmed)) {
    if (Number.isInteger(numOnly) && numOnly <= 20) {
      // ≤20的整数按分钟处理
      return Math.round(numOnly * 60);
    } else {
      // >20或小数按秒处理
      return Math.round(numOnly);
    }
  }

  // 尝试解析 HH:MM:SS 或 MM:SS 格式
  const timeFormatMatch = trimmed.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (timeFormatMatch) {
    const [, h, m, s] = timeFormatMatch;
    const hours = h ? parseInt(h, 10) : 0;
    const minutes = parseInt(m, 10);
    const seconds = s ? parseInt(s, 10) : 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  // 尝试解析中文格式（如 "1分30秒"）
  let totalSeconds = 0;
  let hasValidUnit = false;

  // 小时
  const hourMatch = trimmed.match(/(\d+\.?\d*)\s*(小时|时|h)/i);
  if (hourMatch) {
    totalSeconds += parseFloat(hourMatch[1]) * 3600;
    hasValidUnit = true;
  }

  // 分钟
  const minuteMatch = trimmed.match(/(\d+\.?\d*)\s*(分钟|分|m)/i);
  if (minuteMatch) {
    totalSeconds += parseFloat(minuteMatch[1]) * 60;
    hasValidUnit = true;
  }

  // 秒
  const secondMatch = trimmed.match(/(\d+\.?\d*)\s*(秒钟|秒|s)/i);
  if (secondMatch) {
    totalSeconds += parseFloat(secondMatch[1]);
    hasValidUnit = true;
  }

  if (hasValidUnit) {
    return Math.round(totalSeconds);
  }

  // 尝试解析 1m30s 格式
  const compactMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (compactMatch && (compactMatch[1] || compactMatch[2] || compactMatch[3])) {
    const h = compactMatch[1] ? parseInt(compactMatch[1], 10) : 0;
    const m = compactMatch[2] ? parseInt(compactMatch[2], 10) : 0;
    const s = compactMatch[3] ? parseInt(compactMatch[3], 10) : 0;
    return h * 3600 + m * 60 + s;
  }

  return null;
}

/**
 * 将秒数格式化为友好的显示字符串
 * 例如：90 → "1分30秒"
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);

  return parts.join("");
}

/**
 * 将秒数格式化为输入组件使用的分和秒
 */
export function durationToParts(seconds: number | null | undefined): { minutes: number; seconds: number } {
  if (seconds == null || isNaN(seconds) || seconds < 0) {
    return { minutes: 0, seconds: 0 };
  }
  return {
    minutes: Math.floor(seconds / 60),
    seconds: seconds % 60,
  };
}

/**
 * 将分和秒转换为总秒数
 */
export function partsToDuration(minutes: number, seconds: number): number {
  return Math.max(0, minutes * 60 + seconds);
}

/**
 * 格式化为 HH:MM:SS 或 MM:SS 格式
 */
export function formatDurationAsTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 向后兼容：解析旧的文本格式，尝试转换为秒数
 * 同时保留原始字符串作为备用（用于数据库迁移）
 */
export function parseLegacyDuration(text: string): { seconds: number | null; raw: string } {
  const seconds = parseDuration(text);
  return { seconds, raw: text };
}

/**
 * 安全解析：总是返回秒数，失败时返回 0
 */
export function parseDurationSafe(input: string): number {
  const result = parseDuration(input);
  return result ?? 0;
}
