export const correctionFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export interface ParsedCorrection {
  bands: number[];
  clamped: boolean;
}
const filterLine = /^Filter (\d+): ON PK Fc (\d+) Hz Gain (-?\d+(?:\.\d+)?) dB Q (\d+(?:\.\d+)?)$/;
export function parseFixedBandEq(text: string): ParsedCorrection | null {
  const filters = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => filterLine.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  if (filters.length !== correctionFrequencies.length) return null;
  let clamped = false;
  const bands: number[] = [];
  for (const [index, match] of filters.entries()) {
    const number = Number(match[1]);
    const frequency = Number(match[2]);
    const gain = Number(match[3]);
    if (number !== index + 1 || frequency !== correctionFrequencies[index]) return null;
    const rounded = Math.round(gain * 10) / 10;
    const limited = Math.min(12, Math.max(-12, rounded));
    if (limited !== rounded) clamped = true;
    bands.push(limited);
  }
  return { bands, clamped };
}
