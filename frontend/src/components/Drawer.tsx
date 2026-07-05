import { useState } from 'preact/hooks';
import type { Model } from '../model';
import { blast } from '../model';
import type { GraphNode } from '../types';
import { STATUS, badgeState } from '../status';
import { relTime, fmtTime, testLabel } from '../format';

function buildPrompt(model: Model, node: GraphNode): string {
  const gated = blast(model, node.id);
  const lines: string[] = [];
  if (node.status === 'error') {
    lines.push(`My dbt model \`${node.name}\` failed to build.`, '');
    if (node.message) lines.push('Error:', node.message, '');
    lines.push(`It is the root cause of the failure${gated ? ` and gated ${gated} downstream model(s)` : ''}.`);
    if (node.path) lines.push(`Its SQL is at ${node.path}.`);
    lines.push('', 'Explain why it failed and how to fix it.');
  } else {
    const failing = (node.tests || []).filter(t => t.status === 'fail' || t.status === 'error');
    const names = failing.map(t => testLabel(t, node.name)).join(', ');
    const rows = failing.reduce((s, t) => s + (t.failures || 0), 0);
    const noun = failing.length === 1 ? 'a data test' : `${failing.length} data tests`;
    lines.push(
      `My dbt model \`${node.name}\` built successfully, but ${noun} failed: ${names}${rows ? ` (${rows} failing rows)` : ''}.`,
    );
    if (node.path) lines.push(`Its SQL is at ${node.path}.`);
    lines.push('', 'Explain what the test checks, why it is failing, and how to investigate and fix it.');
  }
  return lines.join('\n');
}

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

function SourceBody({ node }: { node: GraphNode }) {
  const fresh = node.freshness_status;
  const isStale = fresh === 'warn' || fresh === 'error';
  const known = fresh === 'pass' || isStale;
  return (
    <>
      <div class={`block ${isStale ? 'block-cas' : ''}`}>
        <div class="block-lbl" style={{ color: isStale ? '#e8b34a' : '#9aa0ab' }}>Freshness</div>
        <div style="font-size:11px;color:#c3c6cd">
          {known
            ? `${fresh} · loaded ~${Math.round((node.freshness_age_seconds || 0) / 3600)}h ago`
            : 'not checked'}
        </div>
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
          <div class="v">{node.materialization || '—'}</div>
        </div>
        <div class="tile">
          <div class="k">Exec time</div>
          <div class="v">{node.execution_time != null ? `${node.execution_time.toFixed(2)}s` : '—'}</div>
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
      {node.status === 'error' ? (
        <div class="block block-root">
          <div class="block-lbl" style="color:#ff9d7a">
            Root cause <span class="badge" style="background:rgba(255,157,122,0.16);color:#ff9d7a">computed</span>
          </div>
          <div style="font-size:11px;color:#c3c6cd">
            {`This model ran and errored — its parents were fine, so it's the origin of the failure. Skipped ${gated} downstream model(s).`}
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

function Tests({ node }: { node: GraphNode }) {
  if (!node.tests || !node.tests.length) return null;
  return (
    <div class="block" style="border:1px solid rgba(255,255,255,0.08)">
      <div class="block-lbl" style="color:#9aa0ab">Tests</div>
      {node.tests.map((t, i) => {
        const b = t.status === 'fail' || t.status === 'error' ? 'b-fail' : t.status === 'warn' ? 'b-warn' : 'b-pass';
        return (
          <div class="tests-row" key={i}>
            <span class="tname">{testLabel(t, node.name)}</span>
            <span class={`badge ${b}`}>{`${t.status}${t.failures ? ` · ${t.failures}` : ''}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function Ask({ model, node }: { model: Model; node: GraphNode }) {
  const hasFailure =
    node.resource_type !== 'source' &&
    (node.status === 'error' || node.test_status === 'fail' || node.test_status === 'error');
  const [copied, setCopied] = useState(false);
  if (!hasFailure) return null;
  const prompt = buildPrompt(model, node);
  const onCopy = () => {
    copyText(prompt)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  };
  return (
    <div class="ask">
      <div class="ask-lbl">✦ Ask Claude · this failure</div>
      <div class="ask-prompt mono">{prompt}</div>
      <button class="ask-copy" onClick={onCopy}>
        {copied ? 'Copied ✓ — paste into Claude Code' : 'Copy prompt for Claude'}
      </button>
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
    const isSuccess = node.status !== 'error' && node.failure_class !== 'casualty' && !testFailed;
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
      <Ask model={model} node={node} />
    </div>
  );
}
