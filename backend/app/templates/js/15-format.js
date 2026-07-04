const plural = (n,w) => n+' '+w+(n===1 ? '' : 's');

const humanTest = t =>
  ({not_null:'not null', unique:'unique', accepted_values:'accepted values', relationships:'relationships'}[t]
    || (t||'test').replace(/_/g,' '));

function testLabel(t, modelName){
  const nm = t.name||'';
  const pre = (t.test_type||'')+'_'+modelName+'_';
  let col = nm.indexOf(pre)===0 ? nm.slice(pre.length) : nm;
  col = col.replace(/__.*$/,'');
  return humanTest(t.test_type) + (col && col!==nm ? ' · '+col : '');
}

function relTime(iso){
  if(!iso) return '';
  const t = Date.parse(iso);
  if(isNaN(t)) return '';
  const s = (Date.now()-t)/1000;
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

function fmtTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  const p = x => String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}
