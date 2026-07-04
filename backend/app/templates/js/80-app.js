class App {
  constructor(){
    this.model = new GraphModel(GRAPH);
    this.viewport = new Viewport(this.model);
    this.diagram = new Diagram(this.model, id => this.goTo(id));
    this.sidebar = new Sidebar(this.model, id => this.goTo(id));
    this.drawer = new Drawer(this.model, () => this.close());
    this._buildHeader();
    this._setupToolbar();
    this.viewport.apply();
    this._selectFirstFailure();
  }

  _open(id){
    this.diagram.highlight(id);
    this.drawer.select(this.model.byId[id]);
  }

  goTo(id){
    this.viewport.panToNode(id);
    this._open(id);
  }

  close(){
    this.drawer.close();
    this.diagram.clearHighlight();
  }

  _buildHeader(){
    const s = this.model.graph.summary;
    document.getElementById('hsub').textContent =
      (this.model.graph.command||'run')+' · '+s.models+' models · '+s.sources+' sources';

    const chips = [];
    const erroredCount = this.model.graph.nodes.filter(n => n.resource_type==='model' && n.status==='error').length;
    if(!this.model.isTestRun){
      if(erroredCount) chips.push([STATUS.failed.color, plural(erroredCount,'model')+' failed']);
      const cas = s.by_failure_class.casualty || 0;
      if(cas) chips.push([STATUS.skipped.color, plural(cas,'model')+' skipped']);
    }
    if(s.failing_tests) chips.push([STATUS.failed.color, plural(s.failing_tests,'test')+' failed']);
    if(s.stale_sources) chips.push([STATUS.stale.color, plural(s.stale_sources,'source')+' stale']);
    if(!chips.length) chips.push([STATUS.passed.color, 'all passed']);
    setHTML(document.getElementById('chips'),
      html`${chips.map(c => html`<span class="chip"><span class="dot" style="background:${raw(c[0])}"></span><span style="color:${raw(c[0])}">${c[1]}</span></span>`)}`);

    const legend = this.model.isTestRun
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
    setHTML(document.getElementById('legend'),
      html`${legend.map(c => html`<span class="chip" style="font-size:10px"><span class="dot" style="background:${raw(c[0])}"></span><span>${c[1]}</span></span>`)}`);
  }

  _setupToolbar(){
    const pathBtn = document.getElementById('pathBtn');
    let pathOn = false;
    pathBtn.onclick = () => {
      pathOn = !pathOn;
      pathBtn.classList.toggle('on', pathOn);
      pathBtn.innerHTML = (pathOn ? '◉' : '◯')+' Failure paths only';
      this.diagram.setPathOnly(pathOn);
    };

    const focusTargets = this.model.isTestRun
      ? this.model.graph.nodes.filter(n => n.test_status==='fail'||n.test_status==='error').map(n => n.id)
      : this.model.rootCauses;
    let focusI = 0;
    document.getElementById('focusIdx').textContent = focusTargets.length ? ('1 / '+focusTargets.length) : '0';
    document.getElementById('focusBtn').onclick = () => {
      if(!focusTargets.length) return;
      focusI = (focusI+1) % focusTargets.length;
      document.getElementById('focusIdx').textContent = (focusI+1)+' / '+focusTargets.length;
      this.goTo(focusTargets[focusI]);
    };
  }

  _selectFirstFailure(){
    const g = this.model.graph;
    const first = g.nodes.find(n => n.status==='error')
      || g.nodes.find(n => n.test_status==='fail'||n.test_status==='error')
      || g.nodes.find(n => n.resource_type==='source' && (n.freshness_status==='warn'||n.freshness_status==='error'));
    if(first) this._open(first.id);
  }
}

new App();
