import type { Model } from '../model';
import { STATUS } from '../status';

export function Legend({ model }: { model: Model }) {
  const entries: [string, string][] = model.isTestRun
    ? [
        [STATUS.passed.color, 'test passed'],
        [STATUS.failed.color, 'test failed'],
        [STATUS.warn.color, 'warning'],
      ]
    : [
        [STATUS.passed.color, 'model passed'],
        [STATUS.failed.color, 'model failed'],
        [STATUS.skipped.color, 'skipped'],
        [STATUS.warn.color, 'warning'],
      ];
  return (
    <div class="legend">
      {entries.map((c, i) => (
        <span class="chip" style="font-size:10px" key={i}>
          <span class="dot" style={{ background: c[0] }} />
          <span>{c[1]}</span>
        </span>
      ))}
    </div>
  );
}
