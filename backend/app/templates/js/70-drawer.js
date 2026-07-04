class Drawer {
  constructor(model, onClose){
    this.model = model;
    this.el = document.getElementById('drawer');
    this.el.addEventListener('click', e => { if(e.target.closest('.x')) onClose(); });
  }

  select(n){
    this.el.classList.add('open');
    setHTML(this.el, this._html(n));
  }

  close(){ this.el.classList.remove('open'); }

  _cols(n){
    if(!n.columns || !n.columns.length) return '';
    return html`<div class="cols-h"><span>Columns</span><span>${n.columns.length}</span></div>${
      n.columns.map(c => html`<div class="col-row"><span class="cname">${c.name}</span><span class="ctype">${c.data_type||''}</span></div>`)}`;
  }

  _source(n){
    return html`<div class="block ${raw(n.freshness_status==='pass' ? '' : 'block-cas')}"><div class="block-lbl" style="color:#e8b34a">Freshness</div>
        <div style="font-size:11px;color:#c3c6cd">${(n.freshness_status||'unknown')} · loaded ~${Math.round((n.freshness_age_seconds||0)/3600)}h ago</div></div>${this._cols(n)}`;
  }

  _success(n){
    const rel = relTime(n.completed_at), ts = fmtTime(n.completed_at);
    return html`<div class="block block-ok"><div class="built">
        <div><div class="block-lbl" style="color:#3ecf8e">● Last built</div>${rel ? html`<div class="when">${rel}</div>` : ''}</div>${ts ? html`<div class="ts">${ts}</div>` : ''}</div></div>
      <div class="tiles">
        <div class="tile"><div class="k">Materialization</div><div class="v">${n.materialization||'—'}</div></div>
        <div class="tile"><div class="k">Exec time</div><div class="v">${n.execution_time!=null ? n.execution_time.toFixed(2)+'s' : '—'}</div></div>
      </div>${this._cols(n)}`;
  }

  _failure(n){
    const parts = [];
    if(n.status==='error' && n.message)
      parts.push(html`<div class="block block-err"><div class="block-lbl" style="color:#f2555a">Compilation error</div><pre>${n.message}</pre></div>`);
    if(n.status==='error')
      parts.push(html`<div class="block block-root"><div class="block-lbl" style="color:#ff9d7a">Root cause <span class="badge" style="background:rgba(255,157,122,0.16);color:#ff9d7a">computed</span></div>
        <div style="font-size:11px;color:#c3c6cd">This model ran and errored — its parents were fine, so it's the origin of the failure. Skipped ${this.model.blast(n.id)} downstream model(s).</div></div>`);
    else if(n.failure_class==='casualty')
      parts.push(html`<div class="block block-cas"><div class="block-lbl" style="color:#f0a24e">Casualty</div>
        <div style="font-size:11px;color:#c3c6cd">Skipped because <span class="mono">${(this.model.byId[n.blamed_root_cause]||{}).name || n.blamed_root_cause}</span> upstream failed.</div></div>`);
    else if(n.test_status==='fail'||n.test_status==='error'){
      const gated = this.model.blast(n.id);
      parts.push(html`<div class="block block-err"><div class="block-lbl" style="color:#f2555a">Failed test</div>
        <div style="font-size:11px;color:#c3c6cd">This model built successfully, but a data test on it failed${
          raw(gated ? ` and gates ${gated} downstream model(s)` : ` (nothing downstream depends on it)`)}.</div></div>`);
    }
    parts.push(this._cols(n));
    return html`${parts}`;
  }

  _tests(n){
    if(!n.tests || !n.tests.length) return '';
    return html`<div class="block" style="border:1px solid rgba(255,255,255,0.08)"><div class="block-lbl" style="color:#9aa0ab">Tests</div>${
      n.tests.map(t => {
        const b = t.status==='fail'||t.status==='error' ? 'b-fail' : t.status==='warn' ? 'b-warn' : 'b-pass';
        return html`<div class="tests-row"><span class="tname">${testLabel(t, n.name)}</span><span class="badge ${raw(b)}">${t.status}${raw(t.failures ? (' · '+t.failures) : '')}</span></div>`;
      })}</div>`;
  }

  _ask(n){
    const hasFailure = n.resource_type!=='source' && (n.status==='error'||n.test_status==='fail'||n.test_status==='error');
    if(!hasFailure) return '';
    return html`<div class="ask"><div class="ask-lbl">✦ Ask Claude · this node</div>
      <div class="ask-box"><input placeholder="Ask about this failure…" disabled><span style="color:#ff9d7a">↑</span></div></div>`;
  }

  _body(n){
    if(n.resource_type==='source') return this._source(n);
    const testFailed = (n.test_status==='fail'||n.test_status==='error');
    const isSuccess = n.status!=='error' && n.failure_class!=='casualty' && !testFailed;
    return html`${isSuccess ? this._success(n) : this._failure(n)}${this._tests(n)}`;
  }

  _html(n){
    const st = STATUS[badgeState(n)];
    const typeLabel = n.resource_type==='source' ? 'Source' : ('Model'+(n.materialization ? ' · '+n.materialization : ''));
    return html`<div class="d-head"><span class="badge b-lg ${raw(st.badge[1])}">${st.badge[0]}</span><span class="d-type">${typeLabel}</span><span class="x">×</span></div>
      <div class="d-title">${n.name}</div>${n.path ? html`<div class="d-path">${n.path}</div>` : ''}${this._body(n)}${this._ask(n)}`;
  }
}
