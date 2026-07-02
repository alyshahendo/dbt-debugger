"""Render a failure graph into a self-contained interactive HTML lineage view.

Vanilla JS + SVG in the product's dark design tokens: lanes, glowing cascade,
click-to-open drawer, failure-path-only toggle, and a focus-failure stepper.
No build step — the whole page is one string with the graph embedded as JSON.
"""

from __future__ import annotations

import json

_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>dbt-debug · Lineage</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{ --accent:#ff7a4d; --accent2:#e8472c; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; height:100%; }
  body{ background:#0b0c0f; color:#e6e7ea; font-family:'Manrope',sans-serif; overflow:hidden; }
  .mono{ font-family:'JetBrains Mono',monospace; }
  #app{ height:100vh; display:flex; flex-direction:column; }
  header{ height:54px; display:flex; align-items:center; justify-content:space-between;
    padding:0 16px; border-bottom:1px solid rgba(255,255,255,0.07); flex:none; }
  .brand{ width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:800;background:linear-gradient(150deg,var(--accent),var(--accent2)); }
  .htitle{ font-weight:700; font-size:14px; letter-spacing:-.01em; }
  .hsub{ font-size:11px; color:#6b6f7a; }
  .chips{ display:flex; gap:16px; align-items:center; }
  .chip{ font-family:'JetBrains Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px; }
  .dot{ width:7px;height:7px;border-radius:50%; }
  main{ flex:1; display:flex; min-height:0; position:relative; }
  #side{ width:214px; flex:none; border-right:1px solid rgba(255,255,255,0.07);
    background:linear-gradient(180deg,#0d0e13,#0c0d11); padding:12px; overflow:auto; }
  .side-h{ font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#6b6f7a; margin:2px 0 8px; }
  .fail-item{ border-radius:7px; padding:8px; margin-bottom:8px; cursor:pointer;
    background:rgba(242,85,90,0.08); border:1px solid rgba(242,85,90,0.35); }
  .fail-item.warnish{ background:rgba(232,179,74,0.08); border-color:rgba(232,179,74,0.4); }
  .fail-item .nm{ font-family:'JetBrains Mono',monospace; font-size:12px; color:#f3d3d4;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .fail-item .sub{ font-size:10px; color:#6b6f7a; margin-top:3px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #canvaswrap{ flex:1; position:relative; overflow:hidden; background:#0a0b0e; cursor:grab; }
  #canvaswrap.panning{ cursor:grabbing; user-select:none; }
  #canvaswrap.panning .node{ cursor:grabbing; }
  #canvas{ position:absolute; top:0; left:0; transform-origin:0 0; will-change:transform; }
  .toolbar{ position:absolute; top:12px; left:12px; z-index:5; display:flex; gap:8px; }
  .tbtn{ font-size:11px; padding:6px 10px; border-radius:7px; cursor:pointer; user-select:none;
    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); color:#cfd2d8; }
  .zbtn{ min-width:16px; text-align:center; font-variant-numeric:tabular-nums; }
  #zoomReset{ min-width:44px; }
  .tbtn.on{ background:rgba(242,133,60,.16); border-color:rgba(242,133,60,.6); color:#f2a35c; }
  .legend{ position:absolute; top:12px; right:12px; z-index:5; display:flex; gap:12px; font-size:10px; }
  .node{ position:absolute; z-index:2; width:158px; height:46px; border-radius:9px; padding:6px 26px 6px 9px; cursor:pointer;
    display:flex; flex-direction:column; justify-content:center; gap:2px; overflow:hidden; background:#0b0c0f; }
  .node .nm{ font-family:'JetBrains Mono',monospace; font-size:11.5px; font-weight:600; line-height:1.1;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
  .node .sub{ font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
  .node .ico{ position:absolute; top:6px; right:8px; font-size:11px; font-weight:700; }
  .n-ok{ background:linear-gradient(rgba(62,207,142,0.12),rgba(62,207,142,0.12)),#0b0c0f; border:1px solid rgba(62,207,142,0.5); color:#cdeede; }
  .n-ok .ico{ color:#3ecf8e; }
  .n-root{ background:linear-gradient(rgba(242,85,90,0.20),rgba(242,85,90,0.20)),#0b0c0f; border:1px solid #f2555a; color:#f3d3d4; }
  .n-root .ico{ color:#f2555a; }
  .n-cas{ background:linear-gradient(rgba(232,146,58,0.19),rgba(232,146,58,0.19)),#0b0c0f; border:1px dashed rgba(232,146,58,0.7); color:#f0cfa0; }
  .n-cas .ico{ color:#f0a24e; }
  .n-src{ background:linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.05)),#0b0c0f; border:1px solid rgba(255,255,255,0.17); color:#9aa0ab; }
  .n-stale{ background:linear-gradient(rgba(232,179,74,0.13),rgba(232,179,74,0.13)),#0b0c0f; border:1px solid rgba(232,179,74,0.7); color:#f0d79a; }
  .n-stale .ico{ color:#e8b34a; }
  .n-neutral{ background:linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.05)),#0b0c0f; border:1px solid rgba(255,255,255,0.12); color:#c9ccd2; }
  .node.sel{ outline:2px solid var(--accent); outline-offset:1px; }
  #drawer{ position:absolute; top:0; right:0; bottom:0; width:320px; z-index:20; padding:16px; overflow:auto;
    background:linear-gradient(180deg,#0d0e13,#0c0d11); border-left:1px solid rgba(255,255,255,0.07);
    box-shadow:-30px 0 70px -26px rgba(0,0,0,0.9); transform:translateX(340px); transition:transform .2s cubic-bezier(.2,.7,.2,1); }
  #drawer.open{ transform:translateX(0); }
  #drawer .x{ float:right; color:#6b6f7a; cursor:pointer; }
  .d-title{ font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:600; }
  .d-path{ font-family:'JetBrains Mono',monospace; font-size:10px; color:#5a5e68; }
  .block{ border-radius:7px; padding:10px; margin-top:12px; }
  .block-err{ background:rgba(242,85,90,0.10); border:1px solid rgba(242,85,90,0.28); }
  .block-cas{ background:rgba(232,146,58,0.10); border:1px solid rgba(232,146,58,0.35); }
  .block-lbl{ font-size:10px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
  pre{ font-family:'JetBrains Mono',monospace; font-size:10px; white-space:pre-wrap; margin:0; color:#f0c8c9; }
  .ask{ margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07); }
  .ask-lbl{ color:#ff9d7a; font-size:10px; text-transform:uppercase; letter-spacing:.06em; font-weight:700; }
  .ask-box{ display:flex; gap:6px; align-items:center; margin-top:8px; padding:7px 9px; border-radius:7px;
    background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); }
  .ask-box input{ flex:1; background:transparent; border:0; outline:none; color:#cfd2d8; font-size:11px; }
  .tests-row{ display:flex; justify-content:space-between; gap:8px; align-items:center; font-size:11px; margin-top:5px; }
  .tests-row .tname{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  .tests-row .badge{ flex:none; }
  .badge{ font-size:9px; padding:1px 6px; border-radius:5px; white-space:nowrap; }
  .b-fail{ background:rgba(242,85,90,0.2); color:#f2555a; }
  .b-warn{ background:rgba(232,179,74,0.2); color:#e8b34a; }
  .b-pass{ background:rgba(62,207,142,0.18); color:#3ecf8e; }
</style>
</head>
<body>
<div id="app">
  <header>
    <div style="display:flex;align-items:center;gap:10px">
      <div class="brand">d</div>
      <div><div class="htitle">dbt-debug · Lineage</div><div class="hsub mono" id="hsub"></div></div>
    </div>
    <div class="chips" id="chips"></div>
  </header>
  <main>
    <div id="side"></div>
    <div id="canvaswrap">
      <div class="toolbar">
        <div class="tbtn" id="focusBtn">◂ Focus failure <span id="focusIdx"></span> ▸</div>
        <div class="tbtn" id="pathBtn">◯ Failure paths only</div>
        <div class="tbtn zbtn" id="zoomOut">−</div>
        <div class="tbtn zbtn" id="zoomReset">100%</div>
        <div class="tbtn zbtn" id="zoomIn">+</div>
      </div>
      <div class="legend" id="legend"></div>
      <div id="canvas"><svg id="edges" style="position:absolute;inset:0;z-index:1;pointer-events:none"></svg></div>
    </div>
    <div id="drawer"></div>
  </main>
</div>
<script>
const GRAPH = __GRAPH_JSON__;
</script>
<script>
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
  const passed = isTestRun ? '' : plural(s.by_failure_class.ok||0,'model')+' passed';
  chips.push(['#3ecf8e', passed || 'ok']);
  document.getElementById('chips').innerHTML = chips.map(c=>`<span class="chip"><span class="dot" style="background:${c[0]}"></span><span style="color:${c[0]}">${c[1]}</span></span>`).join('');
  document.getElementById('legend').innerHTML =
    [['#3ecf8e',isTestRun?'test passed':'model passed'],['#f2555a',isTestRun?'test failed':'model failed'],['#f0a24e',isTestRun?'test warning':'model skipped'],['#e8b34a','stale source']]
    .map(c=>`<span class="chip" style="font-size:10px"><span class="dot" style="background:${c[0]}"></span><span>${c[1]}</span></span>`).join('');

  const side=document.getElementById('side');
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
    failingTests.forEach(f=> sideHtml+=fmtItem(f.node.id, f.test.name, f.node.name+' · '+(f.test.failures||0)+' rows'));
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
  function select(id){
    selId=id; const n=byId[id];
    Object.values(nodeEls).forEach(e=>e.classList.remove('sel'));
    if(nodeEls[id]) nodeEls[id].classList.add('sel');
    drawer.classList.add('open');
    let h='<span class="x" onclick="__close()">×</span>';
    h+=`<div class="d-title">${n.name}</div>`;
    if(n.path) h+=`<div class="d-path">${n.path}</div>`;
    if(n.resource_type==='source'){
      h+=`<div class="block ${n.freshness_status==='pass'?'':'block-cas'}"><div class="block-lbl" style="color:#e8b34a">Freshness</div>`+
         `<div style="font-size:11px;color:#c3c6cd">${(n.freshness_status||'unknown')} · loaded ~${Math.round((n.freshness_age_seconds||0)/3600)}h ago</div></div>`;
    } else {
      const testFailed = (n.test_status==='fail'||n.test_status==='error');
      if(n.status==='error' && n.message){
        h+=`<div class="block block-err"><div class="block-lbl" style="color:#f2555a">Compilation error</div><pre>${escapeHtml(n.message)}</pre></div>`;
      }
      if(n.status==='error'){
        h+=`<div class="block block-err"><div class="block-lbl" style="color:#ff9d7a">Root cause <span class="badge" style="background:rgba(62,207,142,0.12);color:#3ecf8e">computed</span></div>`+
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
      if(n.tests && n.tests.length){
        h+='<div class="block" style="border:1px solid rgba(255,255,255,0.08)"><div class="block-lbl" style="color:#9aa0ab">Tests</div>';
        n.tests.forEach(t=>{ const b=t.status==='fail'||t.status==='error'?'b-fail':t.status==='warn'?'b-warn':'b-pass';
          h+=`<div class="tests-row"><span class="mono tname">${t.name}</span><span class="badge ${b}">${t.status}${t.failures?(' · '+t.failures):''}</span></div>`; });
        h+='</div>';
      }
    }
    h+='<div class="ask"><div class="ask-lbl">✦ Ask Claude · this '+(n.resource_type==='source'?'source':'node')+'</div>'+
       '<div class="ask-box"><input placeholder="Ask about this failure…" disabled><span style="color:#ff9d7a">↑</span></div>'+
       '<div style="font-size:9px;color:#5a5e68;margin-top:6px">Live analysis + fix arrives when run inside the /dbt-debug skill.</div></div>';
    drawer.innerHTML=h;
  }
  window.__sel=select; window.__close=()=>{ drawer.classList.remove('open'); selId=null; Object.values(nodeEls).forEach(e=>e.classList.remove('sel')); };
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
    const id=focusTargets[focusI], p=pos[id], r=wrap.getBoundingClientRect();
    const PAD=32, usable=Math.max(240, r.width-320), contentW=CW*zoom;
    let px = usable/2 - (p.x+NODE_W/2)*zoom;
    px = contentW<=usable-PAD ? PAD : Math.max(usable-PAD-contentW, Math.min(PAD, px));
    panX = px; panY = r.height/2 - (p.y+NODE_H/2)*zoom; applyView(); select(id); };

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
</script>
</body>
</html>
"""


def render_html(graph: dict) -> str:
    """Return a self-contained HTML page for the given failure graph."""
    payload = json.dumps(graph).replace("</", "<\\/")
    return _TEMPLATE.replace("__GRAPH_JSON__", payload)
