class GraphModel {
  constructor(graph){
    this.graph = graph;
    this.isTestRun = graph.command === 'test';

    this.byId = {};
    graph.nodes.forEach(n => this.byId[n.id] = n);

    this.childrenOf = {};
    graph.edges.forEach(e => { (this.childrenOf[e.source] = this.childrenOf[e.source] || []).push(e.target); });

    this.rootCauses = graph.nodes.filter(n => n.failure_class==='root_cause').map(n => n.id);

    this.blastOf = {};
    graph.nodes.forEach(n => {
      if(n.blamed_root_cause && n.failure_class==='casualty')
        this.blastOf[n.blamed_root_cause] = (this.blastOf[n.blamed_root_cause]||0) + 1;
    });

    this.pos = {};
    this.width = 0;
    this.height = 0;
    this.cascade = new Set();

    this._computeCascade();
    this._layout();
  }

  blast(id){ return this.blastOf[id] || 0; }

  _computeCascade(){
    const seeds = this.isTestRun
      ? this.graph.nodes.filter(n => n.test_status==='fail'||n.test_status==='error').map(n => n.id)
      : this.rootCauses;
    const stack = [...seeds];
    seeds.forEach(r => this.cascade.add(r));
    while(stack.length){
      const u = stack.pop();
      (this.childrenOf[u] || []).forEach(v => {
        if(this.cascade.has(v)) return;
        const nv = this.byId[v];
        if(!nv) return;
        const follow = this.isTestRun ? true : (nv.failure_class==='casualty'||nv.failure_class==='skipped');
        if(follow){ this.cascade.add(v); stack.push(v); }
      });
    }
  }

  _layout(){
    const lanes = {};
    this.graph.nodes.forEach(n => { (lanes[n.lane] = lanes[n.lane] || []).push(n); });
    Object.values(lanes).forEach(arr => arr.sort((a,b) =>
      (a.resource_type<b.resource_type ? -1 : a.resource_type>b.resource_type ? 1 : a.name.localeCompare(b.name))));
    let maxRows = 0, maxLane = 0;
    Object.keys(lanes).forEach(l => {
      lanes[l].forEach((n,i) => this.pos[n.id] = {x: LANE_X(+l), y: TOP + i*ROW});
      maxRows = Math.max(maxRows, lanes[l].length);
      maxLane = Math.max(maxLane, +l);
    });
    this.width = LANE_X(maxLane) + NODE_W + 40;
    this.height = TOP + maxRows*ROW + 30;
  }
}
