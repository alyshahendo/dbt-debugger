function escapeHtml(s){
  return (s==null ? '' : String(s)).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

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

function setHTML(el, tmpl){
  el.innerHTML = tmpl && tmpl.__html!=null ? tmpl.__html : frag(tmpl);
}
