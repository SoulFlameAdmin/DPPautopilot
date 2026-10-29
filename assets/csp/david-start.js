(()=>{
'use strict';
const ref=new URLSearchParams(location.search).get('ref')||'';
const safe=/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(ref)?ref.toLowerCase():'';
const url=new URL('/company',location.origin);
url.searchParams.set('flow','setup');
if(safe)url.searchParams.set('ref',safe);
document.getElementById('startButton').href=url.pathname+url.search;
})();
