import type { Model } from '../model';
import { STATUS } from '../status';
import { plural } from '../format';

function chips(model: Model): [string, string][] {
  const s = model.graph.summary;
  const out: [string, string][] = [];
  const errored = model.graph.nodes.filter(n => n.resource_type === 'model' && n.status === 'error').length;
  if (!model.isTestRun) {
    if (errored) out.push([STATUS.failed.color, `${plural(errored, 'model')} failed`]);
    const cas = s.by_failure_class.casualty || 0;
    if (cas) out.push([STATUS.skipped.color, `${plural(cas, 'model')} skipped`]);
  }
  if (s.failing_tests) out.push([STATUS.failed.color, `${plural(s.failing_tests, 'test')} failed`]);
  if (s.stale_sources) out.push([STATUS.stale.color, `${plural(s.stale_sources, 'source')} stale`]);
  if (!out.length) out.push([STATUS.passed.color, 'all passed']);
  return out;
}

export function Header({ model }: { model: Model }) {
  const s = model.graph.summary;
  return (
    <header>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="brand">d</div>
        <div>
          <div class="htitle">dbt-debug · Lineage</div>
          <div class="hsub mono">
            {`${model.graph.command || 'run'} · ${s.models} models · ${s.sources} sources`}
          </div>
        </div>
      </div>
      <div class="chips">
        {chips(model).map((c, i) => (
          <span class="chip" key={i}>
            <span class="dot" style={{ background: c[0] }} />
            <span style={{ color: c[0] }}>{c[1]}</span>
          </span>
        ))}
      </div>
    </header>
  );
}
