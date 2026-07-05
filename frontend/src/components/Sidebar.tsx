import type { ComponentChildren } from 'preact';
import type { Model } from '../model';
import { blast } from '../model';
import type { GraphNode, TestResult } from '../types';
import { plural, testLabel } from '../format';

function Item({
  id,
  nm,
  sub,
  cls,
  onSelect,
}: {
  id: string;
  nm: string;
  sub: string;
  cls?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div class={`fail-item ${cls || ''}`} onClick={() => onSelect(id)}>
      <div class="nm">{nm}</div>
      <div class="sub">{sub}</div>
    </div>
  );
}

function testSection(
  model: Model,
  title: string,
  pred: (t: TestResult) => boolean,
  onSelect: (id: string) => void,
  cls?: string,
): ComponentChildren {
  const groups: { node: GraphNode; tests: TestResult[] }[] = [];
  model.graph.nodes.forEach(n => {
    if (n.status === 'error') return; // listed under Model failures
    const tests = (n.tests || []).filter(pred);
    if (tests.length) groups.push({ node: n, tests });
  });
  if (!groups.length) return null;
  return (
    <>
      <div class="side-h" style="margin-top:14px">{title}</div>
      {groups.map(({ node, tests }) =>
        tests.length === 1 ? (
          <Item
            key={node.id}
            id={node.id}
            nm={testLabel(tests[0], node.name)}
            sub={`${node.name} · ${tests[0].failures || 0} rows`}
            cls={cls}
            onSelect={onSelect}
          />
        ) : (
          <Item
            key={node.id}
            id={node.id}
            nm={node.name}
            sub={`${plural(tests.length, 'test')} · ${tests.reduce((s, t) => s + (t.failures || 0), 0)} rows`}
            cls={cls}
            onSelect={onSelect}
          />
        ),
      )}
    </>
  );
}

export function Sidebar({ model, onSelect }: { model: Model; onSelect: (id: string) => void }) {
  const g = model.graph;
  const modelFails = g.nodes.filter(n => n.resource_type === 'model' && n.status === 'error');
  const stale = g.nodes.filter(
    n => n.resource_type === 'source' && (n.freshness_status === 'warn' || n.freshness_status === 'error'),
  );

  const failed = testSection(model, 'Failed tests', t => t.status === 'fail' || t.status === 'error', onSelect);
  const warned = testSection(model, 'Test warnings', t => t.status === 'warn', onSelect, 'warnish');

  const empty = !modelFails.length && !failed && !warned && !stale.length;

  return (
    <div id="side">
      {modelFails.length > 0 && (
        <>
          <div class="side-h">Model failures</div>
          {modelFails.map(n => (
            <Item
              key={n.id}
              id={n.id}
              nm={n.name}
              sub={`errored · skipped ${blast(model, n.id)} downstream`}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
      {failed}
      {warned}
      {stale.length > 0 && (
        <>
          <div class="side-h" style="margin-top:14px">Stale sources</div>
          {stale.map(n => (
            <Item
              key={n.id}
              id={n.id}
              nm={n.name}
              sub={`${n.freshness_status} · ${Math.round((n.freshness_age_seconds || 0) / 3600)}h old`}
              cls="warnish"
              onSelect={onSelect}
            />
          ))}
        </>
      )}
      {empty && <div class="hsub">No failures. All green.</div>}
    </div>
  );
}
