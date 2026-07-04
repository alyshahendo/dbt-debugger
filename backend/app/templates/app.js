
(function(){
  const LANE_X = i => 24 + i*224;
  const NODE_W=158, NODE_H=46, ROW=72, TOP=70;
  const isTestRun = (GRAPH.command === 'test');
  const byId = {}; GRAPH.nodes.forEach(n => byId[n.id]=n);

  const lanes = {};
  GRAPH.nodes.forEach(n => { (lanes[n.lane]=lanes[n.lane]||[]).push(n); });
  Object.values(lanes).forEach(arr => arr.sort((a,b)=> (a.resource_type<b.resource_type?-1 : a.resource_type>b.resource_type?1 : a.name.localeCompare(b.name))));
  const pos = {};
  let maxRows=0, maxLane=0;
  Object.keys(lanes).forEach(l => {
    lanes[l].forEach((n,i)=> pos[n.id]={x:LANE_X(+l), y:TOP + i*ROW});
    maxRows=Math.max(maxRows, lanes[l].length); maxLane=Math.max(maxLane,+l);
  });
  const canvas=document.getElementById('canvas');
  canvas.style.width=(LANE_X(maxLane)+NODE_W+40)+'px';
  canvas.style.height=(TOP + maxRows*ROW + 30)+'px';

  const wrap=document.getElementById('canvaswrap');
  let zoom=1, panX=0, panY=0; const ZMIN=0.3, ZMAX=2.5;
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
  wrap.addEventListener('wheel', e=>{
    e.preventDefault();
    const r=wrap.getBoundingClientRect();
    zoomTo(zoom*Math.exp(-e.deltaY*0.002), e.clientX-r.left, e.clientY-r.top);
  }, {passive:false});
  document.getElementById('zoomIn').onclick=()=>zoomTo(zoom*1.2);
  document.getElementById('zoomOut').onclick=()=>zoomTo(zoom/1.2);
  document.getElementById('zoomReset').onclick=()=>zoomTo(1);

  const childrenOf={}; GRAPH.edges.forEach(e=>{ (childrenOf[e.source]=childrenOf[e.source]||[]).push(e.target); });
  const rootCauses = GRAPH.nodes.filter(n=>n.failure_class==='root_cause').map(n=>n.id);
  const blastOf={}; GRAPH.nodes.forEach(n=>{ if(n.blamed_root_cause && n.failure_class==='casualty'){ blastOf[n.blamed_root_cause]=(blastOf[n.blamed_root_cause]||0)+1; } });
  const cascade = new Set();
  (function(){ const stack=[...rootCauses]; rootCauses.forEach(r=>cascade.add(r));
    while(stack.length){ const u=stack.pop(); (childrenOf[u]||[]).forEach(v=>{
      const nv=byId[v]; if(nv && (nv.failure_class==='casualty'||nv.failure_class==='skipped') && !cascade.has(v)){ cascade.add(v); stack.push(v);} }); } })();

  function nodeClass(n){
    if(n.resource_type==='source'){
      if(n.freshness_status==='warn'||n.freshness_status==='error') return 'n-stale';
      return 'n-src';
    }
    if(isTestRun){
      if(n.test_status==='fail'||n.test_status==='error') return 'n-root';
      if(n.test_status==='warn') return 'n-stale';
      return 'n-ok';
    }
    if(n.status==='error') return 'n-root';
    if(n.failure_class==='casualty'||n.failure_class==='skipped') return 'n-cas';
    if(n.test_status==='fail'||n.test_status==='error') return 'n-root';
    if(n.status==='success' || n.failure_class==='ok') return 'n-ok';
    return 'n-neutral';
  }
  function nodeIcon(cls){ return cls==='n-ok'?'✓':cls==='n-root'?'✕':cls==='n-cas'?'⊘':cls==='n-stale'?'⧗':'◦'; }

  const nodeEls={};
  GRAPH.nodes.forEach(n=>{
    const p=pos[n.id]; const cls=nodeClass(n);
    const el=document.createElement('div'); el.className='node '+cls;
    el.style.left=p.x+'px'; el.style.top=p.y+'px';
    let sub;
    if(n.resource_type==='source'){
      sub = (n.freshness_status==='warn'||n.freshness_status==='error') ? 'source · stale' : 'source';
    } else {
      sub = n.materialization||'model';
      if(n.status==='error') sub+=' · failed';
      else if(n.failure_class==='casualty') sub+=' · skipped';
      else if(n.test_status==='fail'||n.test_status==='error') sub+=' · test failed';
    }
    el.innerHTML='<span class="ico">'+nodeIcon(cls)+'</span><span class="nm">'+n.name+'</span><span class="sub">'+sub+'</span>';
    el.onclick=()=>select(n.id);
    canvas.appendChild(el); nodeEls[n.id]=el;
  });

  const svg=document.getElementById('edges');
  svg.setAttribute('width', canvas.style.width); svg.setAttribute('height', canvas.style.height);
  const CW=parseInt(canvas.style.width,10), CH=parseInt(canvas.style.height,10);
  svg.innerHTML=`<defs><filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${CW}" height="${CH}"><feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#f2853c" flood-opacity="0.55"/></filter></defs>`;
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

  const s=GRAPH.summary;
  document.getElementById('hsub').textContent =
    (GRAPH.command||'run')+' · '+s.models+' models · '+s.sources+' sources';
  const chips=[];
  const plural=(n,w)=>n+' '+w+(n===1?'':'s');
  const erroredCount = GRAPH.nodes.filter(n=>n.resource_type==='model' && n.status==='error').length;
  if(!isTestRun){
    if(erroredCount) chips.push(['#f2555a', plural(erroredCount,'model')+' failed']);
    const cas=s.by_failure_class.casualty||0; if(cas) chips.push(['#f0a24e', plural(cas,'model')+' skipped']);
  }
  if(s.failing_tests) chips.push(['#f2555a', plural(s.failing_tests,'test')+' failed']);
  if(s.stale_sources) chips.push(['#e8b34a', plural(s.stale_sources,'source')+' stale']);
  if(!chips.length) chips.push(['#3ecf8e', 'all passed']);
  document.getElementById('chips').innerHTML = chips.map(c=>`<span class="chip"><span class="dot" style="background:${c[0]}"></span><span style="color:${c[0]}">${c[1]}</span></span>`).join('');
  document.getElementById('legend').innerHTML =
    [['#3ecf8e',isTestRun?'test passed':'model passed'],['#f2555a',isTestRun?'test failed':'model failed'],['#f0a24e',isTestRun?'test warning':'model skipped'],['#e8b34a','stale source']]
    .map(c=>`<span class="chip" style="font-size:10px"><span class="dot" style="background:${c[0]}"></span><span>${c[1]}</span></span>`).join('');

  const side=document.getElementById('side');
  const humanTest = t => ({not_null:'not null',unique:'unique',accepted_values:'accepted values',relationships:'relationships'}[t] || (t||'test').replace(/_/g,' '));
  function testLabel(t, modelName){
    let nm=t.name||''; const pre=(t.test_type||'')+'_'+modelName+'_';
    let col = nm.indexOf(pre)===0 ? nm.slice(pre.length) : nm;
    col = col.replace(/__.*$/,'');
    return humanTest(t.test_type)+(col&&col!==nm?' · '+col:'');
  }
  const fmtItem = (id,nm,sub,cls) =>
    `<div class="fail-item ${cls||''}" onclick="__sel('${id}')"><div class="nm">${nm}</div><div class="sub">${sub}</div></div>`;
  let sideHtml='';

  const modelFails = GRAPH.nodes.filter(n=>n.resource_type==='model' && n.status==='error');
  if(modelFails.length){
    sideHtml+='<div class="side-h">Model failures</div>';
    modelFails.forEach(n=> sideHtml+=fmtItem(n.id, n.name, 'errored · skipped '+(blastOf[n.id]||0)+' downstream'));
  }

  const failingTests = GRAPH.nodes.flatMap(n=>
    (n.tests||[]).filter(t=>t.status==='fail'||t.status==='error').map(t=>({node:n,test:t})));
  if(failingTests.length){
    sideHtml+='<div class="side-h" style="margin-top:14px">Failed tests</div>';
    failingTests.forEach(f=> sideHtml+=fmtItem(f.node.id, testLabel(f.test, f.node.name), f.node.name+' · '+(f.test.failures||0)+' rows'));
  }

  const stale = GRAPH.nodes.filter(n=>n.resource_type==='source'&&(n.freshness_status==='warn'||n.freshness_status==='error'));
  if(stale.length){
    sideHtml+='<div class="side-h" style="margin-top:14px">Stale sources</div>';
    stale.forEach(n=> sideHtml+=fmtItem(n.id, n.name, n.freshness_status+' · '+Math.round((n.freshness_age_seconds||0)/3600)+'h old', 'warnish'));
  }

  if(!sideHtml) sideHtml='<div class="hsub">No failures — all green.</div>';
  side.innerHTML=sideHtml;

  const drawer=document.getElementById('drawer');
  let selId=null;
  function statusBadge(n){
    if(n.resource_type==='source')
      return (n.freshness_status==='warn'||n.freshness_status==='error') ? ['STALE','b-warn'] : ['SOURCE','b-neutral'];
    if(n.status==='error') return ['FAILED','b-fail'];
    if(n.failure_class==='casualty') return ['SKIPPED','b-warn'];
    if(n.test_status==='fail'||n.test_status==='error') return ['TEST FAILED','b-fail'];
    return ['SUCCESS','b-pass'];
  }
  function relTime(iso){ if(!iso) return ''; const t=Date.parse(iso); if(isNaN(t)) return '';
    const s=(Date.now()-t)/1000; if(s<60) return 'just now';
    if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago';
    return Math.floor(s/86400)+'d ago'; }
  function fmtTime(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d.getTime())) return '';
    const p=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
  function colsHtml(n){ if(!n.columns || !n.columns.length) return '';
    let h='<div class="cols-h"><span>Columns</span><span>'+n.columns.length+'</span></div>';
    n.columns.forEach(c=>{ h+='<div class="col-row"><span class="cname">'+escapeHtml(c.name)+'</span><span class="ctype">'+escapeHtml(c.data_type||'')+'</span></div>'; });
    return h; }
  function select(id){
    selId=id; const n=byId[id];
    Object.values(nodeEls).forEach(e=>e.classList.remove('sel'));
    if(nodeEls[id]) nodeEls[id].classList.add('sel');
    drawer.classList.add('open');
    const [bLabel,bCls] = statusBadge(n);
    const typeLabel = n.resource_type==='source' ? 'Source' : ('Model'+(n.materialization?' · '+n.materialization:''));
    let h='<div class="d-head"><span class="badge b-lg '+bCls+'">'+bLabel+'</span>'+
          '<span class="d-type">'+typeLabel+'</span><span class="x" onclick="__close()">×</span></div>';
    h+=`<div class="d-title">${n.name}</div>`;
    if(n.path) h+=`<div class="d-path">${n.path}</div>`;
    if(n.resource_type==='source'){
      h+=`<div class="block ${n.freshness_status==='pass'?'':'block-cas'}"><div class="block-lbl" style="color:#e8b34a">Freshness</div>`+
         `<div style="font-size:11px;color:#c3c6cd">${(n.freshness_status||'unknown')} · loaded ~${Math.round((n.freshness_age_seconds||0)/3600)}h ago</div></div>`;
      h+=colsHtml(n);
    } else {
      const testFailed = (n.test_status==='fail'||n.test_status==='error');
      const isSuccess = n.status!=='error' && n.failure_class!=='casualty' && !testFailed;
      if(isSuccess){
        const rel=relTime(n.completed_at), ts=fmtTime(n.completed_at);
        h+='<div class="block block-ok"><div class="built">'+
           '<div><div class="block-lbl" style="color:#3ecf8e">● Last built</div>'+
           (rel?'<div class="when">'+rel+'</div>':'')+'</div>'+
           (ts?'<div class="ts">'+ts+'</div>':'')+'</div></div>';
        h+='<div class="tiles">'+
           '<div class="tile"><div class="k">Materialization</div><div class="v">'+(n.materialization||'—')+'</div></div>'+
           '<div class="tile"><div class="k">Exec time</div><div class="v">'+(n.execution_time!=null?n.execution_time.toFixed(2)+'s':'—')+'</div></div>'+
           '</div>';
        h+=colsHtml(n);
      } else {
        if(n.status==='error' && n.message){
          h+=`<div class="block block-err"><div class="block-lbl" style="color:#f2555a">Compilation error</div><pre>${escapeHtml(n.message)}</pre></div>`;
        }
        if(n.status==='error'){
          h+=`<div class="block block-root"><div class="block-lbl" style="color:#ff9d7a">Root cause <span class="badge" style="background:rgba(255,157,122,0.16);color:#ff9d7a">computed</span></div>`+
             `<div style="font-size:11px;color:#c3c6cd">This model ran and errored — its parents were fine, so it's the origin of the failure. Skipped ${blastOf[n.id]||0} downstream model(s).</div></div>`;
        } else if(n.failure_class==='casualty'){
          h+=`<div class="block block-cas"><div class="block-lbl" style="color:#f0a24e">Casualty</div>`+
             `<div style="font-size:11px;color:#c3c6cd">Skipped because <span class="mono">${(byId[n.blamed_root_cause]||{}).name||n.blamed_root_cause}</span> upstream failed.</div></div>`;
        } else if(testFailed){
          const gated = blastOf[n.id]||0;
          h+=`<div class="block block-err"><div class="block-lbl" style="color:#f2555a">Failed test</div>`+
             `<div style="font-size:11px;color:#c3c6cd">This model built successfully, but a data test on it failed`+
             (gated?` and gates ${gated} downstream model(s)`:` (nothing downstream depends on it)`)+`.</div></div>`;
        }
        h+=colsHtml(n);
      }
      if(n.tests && n.tests.length){
        h+='<div class="block" style="border:1px solid rgba(255,255,255,0.08)"><div class="block-lbl" style="color:#9aa0ab">Tests</div>';
        n.tests.forEach(t=>{ const b=t.status==='fail'||t.status==='error'?'b-fail':t.status==='warn'?'b-warn':'b-pass';
          h+=`<div class="tests-row"><span class="tname">${testLabel(t, n.name)}</span><span class="badge ${b}">${t.status}${t.failures?(' · '+t.failures):''}</span></div>`; });
        h+='</div>';
      }
    }
    const hasFailure = n.resource_type!=='source'
      && (n.status==='error'||n.test_status==='fail'||n.test_status==='error');
    if(hasFailure){
      h+='<div class="ask"><div class="ask-lbl">✦ Ask Claude · this '+(n.resource_type==='source'?'source':'node')+'</div>'+
         '<div class="ask-box"><input placeholder="Ask about this failure…" disabled><span style="color:#ff9d7a">↑</span></div></div>';
    }
    drawer.innerHTML=h;
  }
  function panToNode(id){
    const p=pos[id]; if(!p){ select(id); return; }
    const r=wrap.getBoundingClientRect();
    const PAD=32, usable=Math.max(240, r.width-320), contentW=CW*zoom;
    let px = usable/2 - (p.x+NODE_W/2)*zoom;
    px = contentW<=usable-PAD ? PAD : Math.max(usable-PAD-contentW, Math.min(PAD, px));
    panX = px; panY = r.height/2 - (p.y+NODE_H/2)*zoom; applyView(); select(id);
  }
  window.__sel=panToNode; window.__close=()=>{ drawer.classList.remove('open'); selId=null; Object.values(nodeEls).forEach(e=>e.classList.remove('sel')); };
  function escapeHtml(s){ return (s||'').replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  let hidden=new Set();
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

  (function(){
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
  })();

  applyView();
  drawEdges();
  const firstFocus = (GRAPH.nodes.find(n=>n.status==='error')
    || GRAPH.nodes.find(n=>n.test_status==='fail'||n.test_status==='error')
    || GRAPH.nodes.find(n=>n.resource_type==='source'&&(n.freshness_status==='warn'||n.freshness_status==='error')));
  if(firstFocus) select(firstFocus.id);
})();
