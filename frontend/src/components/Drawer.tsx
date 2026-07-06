import { useState } from 'preact/hooks';
import type { Model } from '../model';
import { blast } from '../model';
import type { GraphNode, TestResult } from '../types';
import { STATUS, badgeState } from '../status';
import { relTime, fmtTime, testLabel } from '../format';

function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (e) {
      reject(e);
    } finally {
      document.body.removeChild(ta);
    }
  });
}

function Columns({ node }: { node: GraphNode }) {
  if (!node.columns || !node.columns.length) return null;
  return (
    <>
      <div class="cols-h">
        <span>Columns</span>
        <span>{node.columns.length}</span>
      </div>
      {node.columns.map((c, i) => (
        <div class="col-row" key={i}>
          <span class="cname">{c.name}</span>
          <span class="ctype">{c.data_type || ''}</span>
        </div>
      ))}
    </>
  );
}

function fmtWindow(w?: { count: number | null; period: string } | null): string | null {
  if (!w || w.count == null) return null;
  const unit: Record<string, string> = { minute: 'm', hour: 'h', day: 'd' };
  return `${w.count}${unit[w.period] || ' ' + w.period}`;
}

function SourceBody({ node }: { node: GraphNode }) {
  const fresh = node.freshness_status;
  const isStale = fresh === 'warn' || fresh === 'error';
  const isFresh = fresh === 'pass';
  const known = isFresh || isStale;
  const blockClass = isStale ? 'block-cas' : isFresh ? 'block-ok' : 'block-neutral';
  const lblColor = isStale ? '#e8b34a' : isFresh ? '#3ecf8e' : '#9aa0ab';
  const crit = node.freshness_criteria;
  const warn = fmtWindow(crit?.warn_after);
  const err = fmtWindow(crit?.error_after);
  const threshold = [warn && `warn after ${warn}`, err && `error after ${err}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <div class={`block ${blockClass}`}>
        <div class="block-lbl" style={{ color: lblColor }}>Freshness</div>
        <div style="font-size:11px;color:#c3c6cd">
          {known
            ? `${fresh} · loaded ~${Math.round((node.freshness_age_seconds || 0) / 3600)}h ago`
            : 'not checked'}
        </div>
        {threshold && (
          <div style="font-size:10px;color:#8a8f99;margin-top:4px">stale threshold: {threshold}</div>
        )}
      </div>
      <Columns node={node} />
    </>
  );
}

function SuccessBody({ node }: { node: GraphNode }) {
  const rel = relTime(node.completed_at);
  const ts = fmtTime(node.completed_at);
  return (
    <>
      {ts && (
        <div class="block block-ok">
          <div class="built">
            <div>
              <div class="block-lbl" style="color:#3ecf8e">● Built</div>
              {rel && <div class="when">{rel}</div>}
            </div>
            <div class="ts">{ts}</div>
          </div>
        </div>
      )}
      <div class="tiles">
        <div class="tile">
          <div class="k">Materialization</div>
          <div class="v">{node.materialization || '-'}</div>
        </div>
        <div class="tile">
          <div class="k">Exec time</div>
          <div class="v">{node.execution_time != null ? `${node.execution_time.toFixed(2)}s` : '-'}</div>
        </div>
      </div>
      <Columns node={node} />
    </>
  );
}

function FailureBody({ model, node }: { model: Model; node: GraphNode }) {
  const gated = blast(model, node.id);
  return (
    <>
      {node.status === 'error' && node.message && (
        <div class="block block-err">
          <div class="block-lbl" style="color:#f2555a">Compilation error</div>
          <pre>{node.message}</pre>
        </div>
      )}
      {node.analysis ? (
        <Analysis node={node} />
      ) : node.failure_class === 'suspect' ? (
        <div class="block block-cas">
          <div class="block-lbl" style="color:#f0a24e">Suspect · inlined</div>
          <div style="font-size:11px;color:#c3c6cd">
            Ephemeral, so it never ran on its own. dbt inlined it into <span class="mono">{model.byId[node.blamed_root_cause || '']?.name || node.blamed_root_cause}</span>, which failed. The error may originate in this model's SQL.
          </div>
        </div>
      ) : node.failure_class === 'casualty' ? (
        <div class="block block-cas">
          <div class="block-lbl" style="color:#f0a24e">Casualty</div>
          <div style="font-size:11px;color:#c3c6cd">
            Skipped because <span class="mono">{model.byId[node.blamed_root_cause || '']?.name || node.blamed_root_cause}</span> upstream failed.
          </div>
        </div>
      ) : node.test_status === 'fail' || node.test_status === 'error' ? (
        <div class="block block-err">
          <div class="block-lbl" style="color:#f2555a">Failed test</div>
          <div style="font-size:11px;color:#c3c6cd">
            {`This model built successfully, but a data test on it failed${gated ? ` and gates ${gated} downstream model(s)` : ' (nothing downstream depends on it)'}.`}
          </div>
        </div>
      ) : null}
      <Columns node={node} />
    </>
  );
}

function TestRow({ test, modelName }: { test: TestResult; modelName: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const failing = test.status === 'fail' || test.status === 'error';
  const b = failing ? 'b-fail' : test.status === 'pass' ? 'b-pass' : 'b-warn';
  const hasQuery = failing && !!test.compiled_sql;
  const copy = () => {
    copyText(test.compiled_sql || '')
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <>
      <div class="tests-row">
        <span class="tname">{testLabel(test, modelName)}</span>
        <span class={`badge ${b}`}>{`${test.status}${test.failures ? ` · ${test.failures}` : ''}`}</span>
      </div>
      {hasQuery && (
        <>
          <div class="test-q-toggle" onClick={() => setOpen(o => !o)}>
            {open ? '▾' : '▸'} compiled query · run to see the failing rows
          </div>
          {open && (
            <div class="test-q-wrap">
              <button class="test-q-copy" onClick={copy}>{copied ? 'copied ✓' : 'copy'}</button>
              <pre class="test-q">{test.compiled_sql}</pre>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Tests({ node }: { node: GraphNode }) {
  if (!node.tests || !node.tests.length) return null;
  return (
    <div class="block" style="border:1px solid rgba(255,255,255,0.08)">
      <div class="block-lbl" style="color:#9aa0ab">Tests</div>
      {node.tests.map((t, i) => (
        <TestRow key={i} test={t} modelName={node.name} />
      ))}
    </div>
  );
}

function withInlineCode(text: string) {
  return text.split('`').map((part, i) => (i % 2 === 1 ? <code class="inline-code">{part}</code> : part));
}

function Analysis({ node }: { node: GraphNode }) {
  if (!node.analysis) return null;
  return (
    <div class="block block-root">
      <div class="block-lbl" style="color:#ff9d7a">✦ Claude's analysis</div>
      <div class="analysis">{withInlineCode(node.analysis)}</div>
    </div>
  );
}

export function Drawer({ model, node, onClose }: { model: Model; node: GraphNode | null; onClose: () => void }) {
  if (!node) return <div id="drawer" />;
  const st = STATUS[badgeState(node)];
  const typeLabel =
    node.resource_type === 'source' ? 'Source' : `Model${node.materialization ? ` · ${node.materialization}` : ''}`;

  let body;
  if (node.resource_type === 'source') {
    body = <SourceBody node={node} />;
  } else {
    const testFailed = node.test_status === 'fail' || node.test_status === 'error';
    const isSuccess =
      node.status !== 'error' &&
      node.failure_class !== 'casualty' &&
      node.failure_class !== 'suspect' &&
      !testFailed;
    body = (
      <>
        {isSuccess ? <SuccessBody node={node} /> : <FailureBody model={model} node={node} />}
        <Tests node={node} />
      </>
    );
  }

  return (
    <div id="drawer" class="open">
      <div class="d-head">
        <span class={`badge b-lg ${st.badge[1]}`}>{st.badge[0]}</span>
        <span class="d-type">{typeLabel}</span>
        <span class="x" onClick={onClose}>×</span>
      </div>
      <div class="d-title">{node.name}</div>
      {node.path && <div class="d-path">{node.path}</div>}
      {body}
    </div>
  );
}
