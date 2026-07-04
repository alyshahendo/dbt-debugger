class Sidebar {
  constructor(model, onItemClick){
    this.model = model;
    this.el = document.getElementById('side');
    this._build();
    this.el.addEventListener('click', e => {
      const item = e.target.closest('[data-id]');
      if(item) onItemClick(item.dataset.id);
    });
  }

  _item(id, nm, sub, cls){
    return html`<div class="fail-item ${raw(cls||'')}" data-id="${id}"><div class="nm">${nm}</div><div class="sub">${sub}</div></div>`;
  }

  _testSection(parts, title, pred, cls){
    const groups = [];
    this.model.graph.nodes.forEach(n => {
      if(n.status==='error') return;  // an errored model is listed under Model failures, not here
      const tests = (n.tests||[]).filter(pred);
      if(tests.length) groups.push({node:n, tests});
    });
    if(!groups.length) return;
    parts.push(html`<div class="side-h" style="margin-top:14px">${title}</div>`);
    groups.forEach(({node, tests}) => {
      if(tests.length === 1){
        parts.push(this._item(node.id, testLabel(tests[0], node.name), node.name+' · '+(tests[0].failures||0)+' rows', cls));
      } else {
        const rows = tests.reduce((s,t) => s + (t.failures||0), 0);
        parts.push(this._item(node.id, node.name, plural(tests.length,'test')+' · '+rows+' rows', cls));
      }
    });
  }

  _build(){
    const g = this.model.graph, parts = [];

    const modelFails = g.nodes.filter(n => n.resource_type==='model' && n.status==='error');
    if(modelFails.length){
      parts.push(html`<div class="side-h">Model failures</div>`);
      modelFails.forEach(n => parts.push(this._item(n.id, n.name, 'errored · skipped '+this.model.blast(n.id)+' downstream')));
    }

    this._testSection(parts, 'Failed tests', t => t.status==='fail'||t.status==='error');
    this._testSection(parts, 'Test warnings', t => t.status==='warn', 'warnish');

    const stale = g.nodes.filter(n => n.resource_type==='source' && (n.freshness_status==='warn'||n.freshness_status==='error'));
    if(stale.length){
      parts.push(html`<div class="side-h" style="margin-top:14px">Stale sources</div>`);
      stale.forEach(n => parts.push(this._item(n.id, n.name, n.freshness_status+' · '+Math.round((n.freshness_age_seconds||0)/3600)+'h old', 'warnish')));
    }

    setHTML(this.el, parts.length ? html`${parts}` : html`<div class="hsub">No failures — all green.</div>`);
  }
}
