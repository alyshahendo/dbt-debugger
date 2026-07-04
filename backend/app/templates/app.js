
(function(){
  const LANE_X = i => 24 + i*224;
  const NODE_W=158, NODE_H=46, ROW=72, TOP=70;
  const isTestRun = (GRAPH.command === 'test');
  const byId = {}; GRAPH.nodes.forEach(n => byId[n.id]=n);

  const STATUS = {
    passed:   {node:'n-ok',      icon:'✓', color:'#3ecf8e', badge:['SUCCESS','b-pass']},
    failed:   {node:'n-root',    icon:'✕', color:'#f2555a', badge:['FAILED','b-fail']},
    testfail: {node:'n-root',    icon:'✕', color:'#f2555a', badge:['TEST FAILED','b-fail']},
    skipped:  {node:'n-cas',     icon:'⊘', color:'#f0a24e', badge:['SKIPPED','b-warn']},
    stale:    {node:'n-stale',   icon:'⧗', color:'#e8b34a', badge:['STALE','b-warn']},
    warn:     {node:'n-stale',   icon:'⧗', color:'#e8b34a', badge:['WARNING','b-warn']},
    source:   {node:'n-src',     icon:'◦', color:'#8aa6e0', badge:['SOURCE','b-neutral']},
    neutral:  {node:'n-neutral', icon:'◦', color:'#9aa0ab', badge:['SUCCESS','b-pass']},
  };

  function nodeState(n){
    if(n.resource_type==='source')
      return (n.freshness_status==='warn'||n.freshness_status==='error') ? 'stale' : 'source';
    if(isTestRun){
      if(n.test_status==='fail'||n.test_status==='error') return 'testfail';
      if(n.test_status==='warn') return 'warn';
      return 'passed';
    }
    if(n.status==='error') return 'failed';
    if(n.failure_class==='casualty'||n.failure_class==='skipped') return 'skipped';
    if(n.test_status==='fail'||n.test_status==='error') return 'testfail';
    if(n.status==='success' || n.failure_class==='ok') return 'passed';
    return 'neutral';
  }
  function badgeState(n){
    if(n.resource_type==='source')
      return (n.freshness_status==='warn'||n.freshness_status==='error') ? 'stale' : 'source';
    if(n.status==='error') return 'failed';
    if(n.failure_class==='casualty') return 'skipped';
    if(n.test_status==='fail'||n.test_status==='error') return 'testfail';
    return 'passed';
  }

  function escapeHtml(s){ return (s==null?'':String(s)).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  const raw = s => ({__html: s==null ? '' : String(s)});
  function frag(v){
    if(v==null || v===false || v===true) return '';
    if(Array.isArray(v)) return v.map(frag).join('');
    if(typeof v==='object' && v.__html!=null) return v.__html;
    return escapeHtml(String(v));
  }
  function html(strings, ...vals){
    let out='';
    strings.forEach((s,i)=>{ out += s + (i<vals.length ? frag(vals[i]) : ''); });
    return {__html: out};
  }
  function setHTML(el, tmpl){ el.innerHTML = tmpl && tmpl.__html!=null ? tmpl.__html : frag(tmpl); }

  const canvas=document.getElementById('canvas');
  const wrap=document.getElementById('canvaswrap');
  const svg=document.getElementById('edges');
  const drawer=document.getElementById('drawer');
  const side=document.getElementById('side');

  const pos={}, nodeEls={};
  const childrenOf={}; GRAPH.edges.forEach(e=>{ (childrenOf[e.source]=childrenOf[e.source]||[]).push(e.target); });
  const rootCauses = GRAPH.nodes.filter(n=>n.failure_class==='root_cause').map(n=>n.id);
  const blastOf={}; GRAPH.nodes.forEach(n=>{ if(n.blamed_root_cause && n.failure_class==='casualty'){ blastOf[n.blamed_root_cause]=(blastOf[n.blamed_root_cause]||0)+1; } });
  const cascade = new Set();
  let CW=0, CH=0;
  let zoom=1, panX=0, panY=0; const ZMIN=0.3, ZMAX=2.5;
  let hidden=new Set(), selId=null;

  function computeCascade(){
    const seeds = isTestRun
      ? GRAPH.nodes.filter(n=>n.test_status==='fail'||n.test_status==='error').map(n=>n.id)
      : rootCauses;
    const stack=[...seeds]; seeds.forEach(r=>cascade.add(r));
    while(stack.length){ const u=stack.pop(); (childrenOf[u]||[]).forEach(v=>{
      if(cascade.has(v)) return;
      const nv=byId[v]; if(!nv) return;
      const follow = isTestRun ? true : (nv.failure_class==='casualty'||nv.failure_class==='skipped');
      if(follow){ cascade.add(v); stack.push(v); }
    }); }
  }

  function layout(){
    const lanes={};
    GRAPH.nodes.forEach(n => { (lanes[n.lane]=lanes[n.lane]||[]).push(n); });
    Object.values(lanes).forEach(arr => arr.sort((a,b)=> (a.resource_type<b.resource_type?-1 : a.resource_type>b.resource_type?1 : a.name.localeCompare(b.name))));
    let maxRows=0, maxLane=0;
    Object.keys(lanes).forEach(l => {
      lanes[l].forEach((n,i)=> pos[n.id]={x:LANE_X(+l), y:TOP + i*ROW});
      maxRows=Math.max(maxRows, lanes[l].length); maxLane=Math.max(maxLane,+l);
    });
    canvas.style.width=(LANE_X(maxLane)+NODE_W+40)+'px';
    canvas.style.height=(TOP + maxRows*ROW + 30)+'px';
    CW=parseInt(canvas.style.width,10); CH=parseInt(canvas.style.height,10);
  }

  function nodeSub(n){
    if(n.resource_type==='source')
      return (n.freshness_status==='warn'||n.freshness_status==='error') ? 'source · stale' : 'source';
    let sub = n.materialization||'model';
    if(n.status==='error') sub+=' · failed';
    else if(n.failure_class==='casualty') sub+=' · skipped';
    else if(n.test_status==='fail'||n.test_status==='error') sub+=' · test failed';
    return sub;
  }
  function buildNodes(){
    GRAPH.nodes.forEach(n=>{
      const p=pos[n.id]; const st=STATUS[nodeState(n)];
      const el=document.createElement('div'); el.className='node '+st.node;
      el.style.left=p.x+'px'; el.style.top=p.y+'px';
      setHTML(el, html`<span class="ico">${st.icon}</span><span class="nm">${n.name}</span><span class="sub">${nodeSub(n)}</span>`);
      el.onclick=()=>panToNode(n.id);
      canvas.appendChild(el); nodeEls[n.id]=el;
    });
  }

  function initEdges(){
    svg.setAttribute('width', canvas.style.width); svg.setAttribute('height', canvas.style.height);
    svg.innerHTML=`<defs><filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${CW}" height="${CH}"><feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#f2853c" flood-opacity="0.55"/></filter></defs>`;
  }
  function drawEdges(){
    [...svg.querySelectorAll('path')].forEach(p=>p.remove());
    GRAPH.edges.forEach(e=>{
      const a=pos[e.source], b=pos[e.target]; if(!a||!b) return;
      if(hidden.has(e.source)||hidden.has(e.target)) return;
      const x1=a.x+NODE_W, y1=a.y+NODE_H/2, x2=b.x, y2=b.y+NODE_H/2, mx=(x1+x2)/2;
      const glow = cascade.has(e.source)&&cascade.has(e.target);
      const intoFail = byId[e.target] && byId[e.target].failure_class==='root_cause';
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      path.setAttribute('fill','none');
      if(glow){ path.setAttribute('stroke','#f2853c'); path.setAttribute('stroke-width','2.6'); path.setAttribute('filter','url(#glow)'); }
      else if(intoFail){ path.setAttribute('stroke','rgba(242,85,90,0.5)'); path.setAttribute('stroke-width','1.6'); }
      else { path.setAttribute('stroke','rgba(255,255,255,0.09)'); path.setAttribute('stroke-width','1.4'); }
      svg.appendChild(path);
    });
  }

  const plural=(n,w)=>n+' '+w+(n===1?'':'s');
  function buildHeader(){
    const s=GRAPH.summary;
    document.getElementById('hsub').textContent =
      (GRAPH.command||'run')+' · '+s.models+' models · '+s.sources+' sources';
    const chips=[];
    const erroredCount = GRAPH.nodes.filter(n=>n.resource_type==='model' && n.status==='error').length;
    if(!isTestRun){
      if(erroredCount) chips.push([STATUS.failed.color, plural(erroredCount,'model')+' failed']);
      const cas=s.by_failure_class.casualty||0; if(cas) chips.push([STATUS.skipped.color, plural(cas,'model')+' skipped']);
    }
    if(s.failing_tests) chips.push([STATUS.failed.color, plural(s.failing_tests,'test')+' failed']);
    if(s.stale_sources) chips.push([STATUS.stale.color, plural(s.stale_sources,'source')+' stale']);
    if(!chips.length) chips.push([STATUS.passed.color, 'all passed']);
    setHTML(document.getElementById('chips'),
      html`${chips.map(c=> html`<span class="chip"><span class="dot" style="background:${raw(c[0])}"></span><span style="color:${raw(c[0])}">${c[1]}</span></span>`)}`);

    const legend=[
      [STATUS.passed.color, isTestRun?'test passed':'model passed'],
      [STATUS.failed.color, isTestRun?'test failed':'model failed'],
      [STATUS.skipped.color, isTestRun?'test warning':'model skipped'],
      [STATUS.stale.color, 'stale source'],
    ];
    setHTML(document.getElementById('legend'),
      html`${legend.map(c=> html`<span class="chip" style="font-size:10px"><span class="dot" style="background:${raw(c[0])}"></span><span>${c[1]}</span></span>`)}`);
  }

  const humanTest = t => ({not_null:'not null',unique:'unique',accepted_values:'accepted values',relationships:'relationships'}[t] || (t||'test').replace(/_/g,' '));
  function testLabel(t, modelName){
    let nm=t.name||''; const pre=(t.test_type||'')+'_'+modelName+'_';
    let col = nm.indexOf(pre)===0 ? nm.slice(pre.length) : nm;
    col = col.replace(/__.*$/,'');
    return humanTest(t.test_type)+(col&&col!==nm?' · '+col:'');
  }
  const failItem = (id,nm,sub,cls) =>
    html`<div class="fail-item ${raw(cls||'')}" data-id="${id}"><div class="nm">${nm}</div><div class="sub">${sub}</div></div>`;
  function buildSidebar(){
    const parts=[];
    const modelFails = GRAPH.nodes.filter(n=>n.resource_type==='model' && n.status==='error');
    if(modelFails.length){
      parts.push(html`<div class="side-h">Model failures</div>`);
      modelFails.forEach(n=> parts.push(failItem(n.id, n.name, 'errored · skipped '+(blastOf[n.id]||0)+' downstream')));
    }
    const failingTests = GRAPH.nodes.flatMap(n=>
      (n.tests||[]).filter(t=>t.status==='fail'||t.status==='error').map(t=>({node:n,test:t})));
    if(failingTests.length){
      parts.push(html`<div class="side-h" style="margin-top:14px">Failed tests</div>`);
      failingTests.forEach(f=> parts.push(failItem(f.node.id, testLabel(f.test, f.node.name), f.node.name+' · '+(f.test.failures||0)+' rows')));
    }
    const stale = GRAPH.nodes.filter(n=>n.resource_type==='source'&&(n.freshness_status==='warn'||n.freshness_status==='error'));
    if(stale.length){
      parts.push(html`<div class="side-h" style="margin-top:14px">Stale sources</div>`);
      stale.forEach(n=> parts.push(failItem(n.id, n.name, n.freshness_status+' · '+Math.round((n.freshness_age_seconds||0)/3600)+'h old', 'warnish')));
    }
    setHTML(side, parts.length ? html`${parts}` : html`<div class="hsub">No failures — all green.</div>`);
    side.addEventListener('click', e=>{ const item=e.target.closest('[data-id]'); if(item) panToNode(item.dataset.id); });
  }

  function relTime(iso){ if(!iso) return ''; const t=Date.parse(iso); if(isNaN(t)) return '';
    const s=(Date.now()-t)/1000; if(s<60) return 'just now';
    if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago';
    return Math.floor(s/86400)+'d ago'; }
  function fmtTime(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d.getTime())) return '';
    const p=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
  function colsHtml(n){
    if(!n.columns || !n.columns.length) return '';
    return html`<div class="cols-h"><span>Columns</span><span>${n.columns.length}</span></div>${
      n.columns.map(c=> html`<div class="col-row"><span class="cname">${c.name}</span><span class="ctype">${c.data_type||''}</span></div>`)}`;
  }

  function sourceBody(n){
    return html`<div class="block ${raw(n.freshness_status==='pass'?'':'block-cas')}"><div class="block-lbl" style="color:#e8b34a">Freshness</div>
        <div style="font-size:11px;color:#c3c6cd">${(n.freshness_status||'unknown')} · loaded ~${Math.round((n.freshness_age_seconds||0)/3600)}h ago</div></div>${colsHtml(n)}`;
  }
  function successBody(n){
    const rel=relTime(n.completed_at), ts=fmtTime(n.completed_at);
    return html`<div class="block block-ok"><div class="built">
        <div><div class="block-lbl" style="color:#3ecf8e">● Last built</div>${rel? html`<div class="when">${rel}</div>`:''}</div>${ts? html`<div class="ts">${ts}</div>`:''}</div></div>
      <div class="tiles">
        <div class="tile"><div class="k">Materialization</div><div class="v">${n.materialization||'—'}</div></div>
        <div class="tile"><div class="k">Exec time</div><div class="v">${n.execution_time!=null? n.execution_time.toFixed(2)+'s':'—'}</div></div>
      </div>${colsHtml(n)}`;
  }
  function failureBody(n){
    const parts=[];
    if(n.status==='error' && n.message)
      parts.push(html`<div class="block block-err"><div class="block-lbl" style="color:#f2555a">Compilation error</div><pre>${n.message}</pre></div>`);
    if(n.status==='error')
      parts.push(html`<div class="block block-root"><div class="block-lbl" style="color:#ff9d7a">Root cause <span class="badge" style="background:rgba(255,157,122,0.16);color:#ff9d7a">computed</span></div>
        <div style="font-size:11px;color:#c3c6cd">This model ran and errored — its parents were fine, so it's the origin of the failure. Skipped ${blastOf[n.id]||0} downstream model(s).</div></div>`);
    else if(n.failure_class==='casualty')
      parts.push(html`<div class="block block-cas"><div class="block-lbl" style="color:#f0a24e">Casualty</div>
        <div style="font-size:11px;color:#c3c6cd">Skipped because <span class="mono">${(byId[n.blamed_root_cause]||{}).name||n.blamed_root_cause}</span> upstream failed.</div></div>`);
    else if(n.test_status==='fail'||n.test_status==='error'){
      const gated = blastOf[n.id]||0;
      parts.push(html`<div class="block block-err"><div class="block-lbl" style="color:#f2555a">Failed test</div>
        <div style="font-size:11px;color:#c3c6cd">This model built successfully, but a data test on it failed${
          raw(gated?` and gates ${gated} downstream model(s)`:` (nothing downstream depends on it)`)}.</div></div>`);
    }
    parts.push(colsHtml(n));
    return html`${parts}`;
  }
  function testsBody(n){
    if(!n.tests || !n.tests.length) return '';
    return html`<div class="block" style="border:1px solid rgba(255,255,255,0.08)"><div class="block-lbl" style="color:#9aa0ab">Tests</div>${
      n.tests.map(t=>{ const b=t.status==='fail'||t.status==='error'?'b-fail':t.status==='warn'?'b-warn':'b-pass';
        return html`<div class="tests-row"><span class="tname">${testLabel(t, n.name)}</span><span class="badge ${raw(b)}">${t.status}${raw(t.failures?(' · '+t.failures):'')}</span></div>`; })}</div>`;
  }
  function askBody(n){
    const hasFailure = n.resource_type!=='source' && (n.status==='error'||n.test_status==='fail'||n.test_status==='error');
    if(!hasFailure) return '';
    return html`<div class="ask"><div class="ask-lbl">✦ Ask Claude · this node</div>
      <div class="ask-box"><input placeholder="Ask about this failure…" disabled><span style="color:#ff9d7a">↑</span></div></div>`;
  }
  function drawerHtml(n){
    const st=STATUS[badgeState(n)];
    const typeLabel = n.resource_type==='source' ? 'Source' : ('Model'+(n.materialization?' · '+n.materialization:''));
    let body;
    if(n.resource_type==='source') body = sourceBody(n);
    else {
      const testFailed = (n.test_status==='fail'||n.test_status==='error');
      const isSuccess = n.status!=='error' && n.failure_class!=='casualty' && !testFailed;
      body = html`${isSuccess ? successBody(n) : failureBody(n)}${testsBody(n)}`;
    }
    return html`<div class="d-head"><span class="badge b-lg ${raw(st.badge[1])}">${st.badge[0]}</span><span class="d-type">${typeLabel}</span><span class="x">×</span></div>
      <div class="d-title">${n.name}</div>${n.path? html`<div class="d-path">${n.path}</div>`:''}${body}${askBody(n)}`;
  }
  function select(id){
    selId=id; const n=byId[id];
    Object.values(nodeEls).forEach(e=>e.classList.remove('sel'));
    if(nodeEls[id]) nodeEls[id].classList.add('sel');
    drawer.classList.add('open');
    setHTML(drawer, drawerHtml(n));
  }
  function closeDrawer(){ drawer.classList.remove('open'); selId=null; Object.values(nodeEls).forEach(e=>e.classList.remove('sel')); }

  function applyView(){ canvas.style.transform='translate('+panX+'px,'+panY+'px) scale('+zoom+')';
    document.getElementById('zoomReset').textContent=Math.round(zoom*100)+'%'; }
  function zoomTo(z, ox, oy){
    z=Math.max(ZMIN, Math.min(ZMAX, z));
    const r=wrap.getBoundingClientRect();
    if(ox==null){ ox=r.width/2; oy=r.height/2; }
    const cx=(ox-panX)/zoom, cy=(oy-panY)/zoom;
    zoom=z; panX=ox-cx*zoom; panY=oy-cy*zoom;
    applyView();
  }
  function panToNode(id){
    const p=pos[id]; if(!p){ select(id); return; }
    const r=wrap.getBoundingClientRect();
    const PAD=32, usable=Math.max(240, r.width-320), contentW=CW*zoom, contentH=CH*zoom;
    let px = usable/2 - (p.x+NODE_W/2)*zoom;
    px = contentW<=usable-PAD ? PAD : Math.max(usable-PAD-contentW, Math.min(PAD, px));
    let py = r.height/2 - (p.y+NODE_H/2)*zoom;
    py = contentH<=r.height-PAD ? PAD : Math.max(r.height-PAD-contentH, Math.min(PAD, py));
    panX = px; panY = py; applyView(); select(id);
  }

  function setupZoomPan(){
    wrap.addEventListener('wheel', e=>{
      e.preventDefault();
      const r=wrap.getBoundingClientRect();
      zoomTo(zoom*Math.exp(-e.deltaY*0.002), e.clientX-r.left, e.clientY-r.top);
    }, {passive:false});
    document.getElementById('zoomIn').onclick=()=>zoomTo(zoom*1.2);
    document.getElementById('zoomOut').onclick=()=>zoomTo(zoom/1.2);
    document.getElementById('zoomReset').onclick=()=>zoomTo(1);

    const PAN_SPEED=0.6;
    let sx=0, sy=0, spx=0, spy=0, down=false, dragged=false;
    wrap.addEventListener('pointerdown', e=>{
      if(e.button!==0) return;
      down=true; dragged=false;
      sx=e.clientX; sy=e.clientY; spx=panX; spy=panY;
    });
    window.addEventListener('pointermove', e=>{
      if(!down) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(!dragged && Math.hypot(dx,dy) < 4) return;
      dragged=true; wrap.classList.add('panning');
      panX = spx+dx*PAN_SPEED; panY = spy+dy*PAN_SPEED; applyView();
      e.preventDefault();
    });
    window.addEventListener('pointerup', ()=>{ down=false; wrap.classList.remove('panning'); });
    wrap.addEventListener('click', e=>{ if(dragged){ e.stopPropagation(); dragged=false; } }, true);
  }

  function setupToolbar(){
    const pathBtn=document.getElementById('pathBtn'); let pathOn=false;
    pathBtn.onclick=()=>{
      pathOn=!pathOn; pathBtn.classList.toggle('on', pathOn);
      pathBtn.innerHTML=(pathOn?'◉':'◯')+' Failure paths only';
      hidden=new Set();
      if(pathOn){ GRAPH.nodes.forEach(n=>{ if(!cascade.has(n.id)){
          const keep=(childrenOf[n.id]||[]).some(c=>cascade.has(c)) && n.resource_type==='source';
          if(!keep) hidden.add(n.id);} }); }
      GRAPH.nodes.forEach(n=> nodeEls[n.id].style.display = hidden.has(n.id)?'none':'flex');
      drawEdges();
    };

    const focusTargets = isTestRun
      ? GRAPH.nodes.filter(n=>n.test_status==='fail'||n.test_status==='error').map(n=>n.id)
      : rootCauses;
    let focusI=0;
    const focusBtn=document.getElementById('focusBtn');
    document.getElementById('focusIdx').textContent = focusTargets.length? ('1 / '+focusTargets.length):'0';
    focusBtn.onclick=()=>{ if(!focusTargets.length) return;
      focusI=(focusI+1)%focusTargets.length; document.getElementById('focusIdx').textContent=(focusI+1)+' / '+focusTargets.length;
      panToNode(focusTargets[focusI]); };
  }

  function init(){
    computeCascade();
    layout();
    buildNodes();
    initEdges();
    buildHeader();
    buildSidebar();
    drawer.addEventListener('click', e=>{ if(e.target.closest('.x')) closeDrawer(); });
    setupZoomPan();
    setupToolbar();
    applyView();
    drawEdges();
    const firstFocus = (GRAPH.nodes.find(n=>n.status==='error')
      || GRAPH.nodes.find(n=>n.test_status==='fail'||n.test_status==='error')
      || GRAPH.nodes.find(n=>n.resource_type==='source'&&(n.freshness_status==='warn'||n.freshness_status==='error')));
    if(firstFocus) select(firstFocus.id);
  }
  init();
})();
