import type { TestResult } from './types';

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const HUMAN_TEST: Record<string, string> = {
  not_null: 'not null',
  unique: 'unique',
  accepted_values: 'accepted values',
  relationships: 'relationships',
};

export const humanTest = (t?: string) => HUMAN_TEST[t || ''] || (t || 'test').replace(/_/g, ' ');

export function testLabel(t: TestResult, modelName: string): string {
  const nm = t.name || '';
  const pre = `${t.test_type || ''}_${modelName}_`;
  let col = nm.indexOf(pre) === 0 ? nm.slice(pre.length) : nm;
  col = col.replace(/__.*$/, '');
  return humanTest(t.test_type) + (col && col !== nm ? ` · ${col}` : '');
}

export function relTime(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
