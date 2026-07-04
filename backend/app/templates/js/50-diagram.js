class Diagram {
  constructor(model, onNodeClick){
    this.model = model;
    this.onNodeClick = onNodeClick;
    this.canvas = document.getElementById('canvas');
    this.svg = document.getElementById('edges');
    this.nodeEls = {};
    this.hidden = new Set();

    this.canvas.style.width = model.width+'px';
    this.canvas.style.height = model.height+'px';
    this._buildNodes();
    this._initEdges();
    this.drawEdges();
  }

  _sub(n){
    if(n.resource_type==='source')
      return (n.freshness_status==='warn'||n.freshness_status==='error') ? 'source · stale' : 'source';
    let sub = n.materialization || 'model';
    if(n.status==='error') sub += ' · failed';
    else if(n.failure_class==='casualty') sub += ' · skipped';
    else if(n.test_status==='fail'||n.test_status==='error') sub += ' · test failed';
    return sub;
  }

  _buildNodes(){
    this.model.graph.nodes.forEach(n => {
      const p = this.model.pos[n.id];
      const st = STATUS[nodeState(n, this.model.isTestRun)];
      const el = document.createElement('div');
      el.className = 'node '+st.node;
      el.style.left = p.x+'px';
      el.style.top = p.y+'px';
      setHTML(el, html`<span class="ico">${st.icon}</span><span class="nm">${n.name}</span><span class="sub">${this._sub(n)}</span>`);
      el.onclick = () => this.onNodeClick(n.id);
      this.canvas.appendChild(el);
      this.nodeEls[n.id] = el;
    });
  }

  _initEdges(){
    const w = this.model.width, h = this.model.height;
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.svg.innerHTML = `<defs><filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#f2853c" flood-opacity="0.55"/></filter></defs>`;
  }

  drawEdges(){
    [...this.svg.querySelectorAll('path')].forEach(p => p.remove());
    this.model.graph.edges.forEach(e => {
      const a = this.model.pos[e.source], b = this.model.pos[e.target];
      if(!a || !b) return;
      if(this.hidden.has(e.source) || this.hidden.has(e.target)) return;
      const x1 = a.x+NODE_W, y1 = a.y+NODE_H/2, x2 = b.x, y2 = b.y+NODE_H/2, mx = (x1+x2)/2;
      const glow = this.model.cascade.has(e.source) && this.model.cascade.has(e.target);
      const intoFail = this.model.byId[e.target] && this.model.byId[e.target].failure_class==='root_cause';
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      path.setAttribute('fill','none');
      if(glow){
        path.setAttribute('stroke','#f2853c');
        path.setAttribute('stroke-width','2.6');
        path.setAttribute('filter','url(#glow)');
      } else if(intoFail){
        path.setAttribute('stroke','rgba(242,85,90,0.5)');
        path.setAttribute('stroke-width','1.6');
      } else {
        path.setAttribute('stroke','rgba(255,255,255,0.09)');
        path.setAttribute('stroke-width','1.4');
      }
      this.svg.appendChild(path);
    });
  }

  highlight(id){
    Object.values(this.nodeEls).forEach(e => e.classList.remove('sel'));
    if(this.nodeEls[id]) this.nodeEls[id].classList.add('sel');
  }

  clearHighlight(){
    Object.values(this.nodeEls).forEach(e => e.classList.remove('sel'));
  }

  setPathOnly(on){
    this.hidden = new Set();
    if(on){
      this.model.graph.nodes.forEach(n => {
        if(this.model.cascade.has(n.id)) return;
        const keep = (this.model.childrenOf[n.id] || []).some(c => this.model.cascade.has(c)) && n.resource_type==='source';
        if(!keep) this.hidden.add(n.id);
      });
    }
    this.model.graph.nodes.forEach(n => this.nodeEls[n.id].style.display = this.hidden.has(n.id) ? 'none' : 'flex');
    this.drawEdges();
  }
}
