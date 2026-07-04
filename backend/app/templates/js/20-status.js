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

function nodeState(n, isTestRun){
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
  if(n.test_status==='warn') return 'warn';
  if(n.status==='success'||n.failure_class==='ok') return 'passed';
  return 'neutral';
}

function badgeState(n){
  if(n.resource_type==='source')
    return (n.freshness_status==='warn'||n.freshness_status==='error') ? 'stale' : 'source';
  if(n.status==='error') return 'failed';
  if(n.failure_class==='casualty') return 'skipped';
  if(n.test_status==='fail'||n.test_status==='error') return 'testfail';
  if(n.test_status==='warn') return 'warn';
  return 'passed';
}
