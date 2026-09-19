const $=(selector)=>document.querySelector(selector);
const $$=(selector)=>[...document.querySelectorAll(selector)];
let state=null,csrf='',activeHold=null,mutationPending=false;
const pageTitles={capacity:'Today’s overview',sales:'Create a sample sale',tickets:'Admissions',reports:'Reports',operations:'System readiness'};
const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
const request=async(path,{method='GET',body,headers={}}={})=>{const response=await fetch(path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(csrf?{'x-demo-csrf':csrf}:{}),...headers},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const type=response.headers.get('content-type')||'';const data=type.includes('json')?await response.json():await response.text();if(!response.ok){const error=new Error(data.error||'Request failed');error.status=response.status;error.data=data;throw error}return data};
const key=()=>crypto.randomUUID();
const money=(minor)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(minor/100);
const dateTime=(value)=>{const date=new Date(value);return Number.isNaN(date.valueOf())?'—':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date)};
function fakeCode(text){const bits=Array.from({length:81},(_,index)=>((text.charCodeAt(index%text.length)+index*17)%5)<2);return `<div class="fake-code" role="img" aria-label="Decorative non-scannable pattern">${bits.map(on=>`<i class="${on?'on':''}"></i>`).join('')}</div>`}
function emptyState(title,description){return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">—</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`}
function table(rows,columns){if(!rows.length)return emptyState('No records yet','New synthetic activity will appear here after it is created.');return `<table><thead><tr>${columns.map(column=>`<th scope="col">${escapeHtml(column[0])}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(column=>`<td>${escapeHtml(column[2]?column[2](row[column[1]]):row[column[1]]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
function status(message,error=false){const node=$('#action-status');node.textContent=message;node.className=`status ${error?'error':'success'}`}
function setBusy(button,busy,busyLabel='Working…'){if(!button)return;if(!button.dataset.label)button.dataset.label=button.textContent;button.disabled=busy;button.textContent=busy?busyLabel:button.dataset.label;button.setAttribute('aria-busy',String(busy))}
function setLoading(loading){$('#loading-state').hidden=!loading;$$('.view').forEach(view=>view.setAttribute('aria-busy',String(loading)))}
function showView(name,{focus=false,updateHash=true}={}){const selected=pageTitles[name]?name:'capacity';$$('.view').forEach(view=>{view.hidden=view.id!==selected});$$('[data-nav]').forEach(link=>{if(link.dataset.nav===selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});$('#mobile-nav').value=selected;$('#page-title').textContent=pageTitles[selected];if(updateHash&&location.hash!==`#${selected}`)history.replaceState(null,'',`#${selected}`);if(focus)$(`#${selected} h2[tabindex="-1"],#${selected} h2`)?.focus()}
function render(next){
  state=next;csrf=next.csrf;const capacity=next.capacity;
  const metricDetails={Total:'session limit',Blocked:'operator block',Held:'temporary',Confirmed:'issued',Available:'ready to reserve'};
  $('#metrics').innerHTML=[['Total',capacity.total,''],['Blocked',capacity.blocked,''],['Held',capacity.held,'held'],['Confirmed',capacity.confirmed,'confirmed'],['Available',capacity.available,'available']].map(([label,value,className])=>`<article class="metric ${className}"><strong>${escapeHtml(value)}</strong><span>${label}</span><small>${metricDetails[label]}</small></article>`).join('');
  $('#holds').innerHTML=table(next.holds,[['Hold reference','id',(value)=>String(value).slice(0,8).toUpperCase()],['Quantity','quantity'],['Status','status'],['Expires','expiresAt',dateTime]]);
  $('#product').innerHTML=next.products.map(product=>`<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} — ${money(product.priceMinor)}</option>`).join('');
  if(!activeHold||!next.holds.some(hold=>hold.id===activeHold.id&&hold.status==='ACTIVE'))activeHold=[...next.holds].reverse().find(hold=>hold.status==='ACTIVE')||null;
  $('#confirm-order').disabled=!activeHold||mutationPending;
  $('#confirm-order').textContent=activeHold?`Confirm ${activeHold.quantity} without payment`:'Confirm without payment';
  $('#confirm-order').dataset.label=$('#confirm-order').textContent;
  $('#ticket-list').innerHTML=next.tickets.length?next.tickets.map(ticket=>`<article class="ticket-card"><div><span class="pill pill-safe">SYNTHETIC TICKET</span><h3 class="ticket-code">${escapeHtml(ticket.displayCode)}</h3><p><strong>${escapeHtml(ticket.maxEntries)} admission${ticket.maxEntries===1?'':'s'}</strong><br>Display-only credential</p></div>${fakeCode(ticket.displayCode)}<button class="button button-primary" type="button" data-checkin="${escapeHtml(ticket.id)}">Record server check-in</button></article>`).join(''):`<article>${emptyState('No tickets issued','Create and confirm a sample sale to issue a synthetic ticket.')}</article>`;
  $('#admissions').innerHTML='<div class="panel-heading"><div><h3>Check-in attempts</h3><p>Accepted, duplicate, and rejected outcomes are retained in this instance.</p></div><span class="pill pill-neutral">Server validated</span></div>'+table(next.admissions,[['Ticket','ticketId',(value)=>String(value).slice(0,8).toUpperCase()],['Result','result'],['Sequence','sequence']]);
  $('#report-list').innerHTML=next.reports.map(report=>`<article class="report-card"><div class="system-head"><span class="pill pill-neutral">SYNTHETIC</span><span aria-hidden="true">↗</span></div><h3>${escapeHtml(report.title)}</h3><p>${escapeHtml(report.purpose)}</p><div class="report-actions"><a href="/api/reports/${encodeURIComponent(report.id)}.csv" download>CSV report</a><a href="/api/reports/${encodeURIComponent(report.id)}.json" download>JSON report</a></div></article>`).join('');
  const integrations=next.integrations;
  $('#operations-list').innerHTML=`
    <article><div class="system-head"><span class="pill pill-warning">LOCAL ONLY</span><span aria-hidden="true">↻</span></div><h3>Offline outbox</h3><p><strong>${escapeHtml(next.offline.pending)} pending event${next.offline.pending===1?'':'s'}</strong></p><p>${escapeHtml(next.offline.mode)}. Restart clears it; this is not a durable offline system.</p></article>
    <article><div class="system-head"><span class="pill pill-safe">READ ONLY</span><span aria-hidden="true">▦</span></div><h3>Yellow Dog</h3><p>Synthetic inventory mirror with ${escapeHtml(integrations.yellowDog.queuedSyntheticSales)} local sale${integrations.yellowDog.queuedSyntheticSales===1?'':'s'} in a disabled queue.</p><ul class="integration-list">${integrations.yellowDog.items.map(item=>`<li><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.onHand)}</strong></li>`).join('')}</ul></article>
    <article><div class="system-head"><span class="pill pill-off">MANUAL ONLY</span><span aria-hidden="true">♫</span></div><h3>Splash Radio</h3><p>No API, playback, scheduling, or provider action is enabled in this preview.</p></article>
    <article><div class="system-head"><span class="pill pill-safe">READ ONLY</span><span aria-hidden="true">⇢</span></div><h3>Migration preview</h3><p>Synthetic inspection only. Source-system writeback is prohibited.</p></article>
    <article><div class="system-head"><span class="pill pill-off">DISABLED</span><span aria-hidden="true">$</span></div><h3>Payments</h3><p>No card entry, authorization, capture, refund, webhook, Terminal, or provider call.</p></article>
    <article><div class="system-head"><span class="pill pill-warning">EPHEMERAL</span><span aria-hidden="true">◷</span></div><h3>Instance state</h3><p>Orders, tickets, capacity, admissions, sessions, and signing keys exist only in this process.</p></article>`;
  $$('[data-checkin]').forEach(button=>button.addEventListener('click',()=>checkIn(button.dataset.checkin,button)));
}
async function load({focusConsole=false,focusLogin=false,announce=false}={}){
  setLoading(true);
  try{
    const auth=await request('/api/auth/status');
    if(!auth.authenticated){$('#login').hidden=false;$('#console').hidden=true;if(focusLogin)$('#login-title').focus();return}
    const next=await request('/api/state');$('#login').hidden=true;$('#console').hidden=false;render(next);showView(location.hash.slice(1),{focus:focusConsole,updateHash:true});if(announce)status('Snapshot refreshed.');
  }catch(error){
    $('#login').hidden=false;$('#console').hidden=true;const node=$('#login-status');node.textContent=error.status===401?'Your preview session ended. Sign in again.':'Unable to reach the synthetic console.';node.className='status error';if(focusLogin)$('#login-title').focus();
  }finally{setLoading(false)}
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const field=$('#passcode');const node=$('#login-status');
  if(!field.value||field.value.length<16||!field.checkValidity()){node.textContent='Enter a passcode of at least 16 characters.';node.className='status error';field.focus();return}
  const button=$('#login-submit');setBusy(button,true,'Checking…');node.textContent='Checking passcode…';node.className='status';
  try{const result=await request('/api/auth/login',{method:'POST',body:{passcode:field.value}});csrf=result.csrf;field.value='';node.textContent='';await load({focusConsole:true})}catch{node.textContent='Unable to authenticate. Check the passcode and try again.';node.className='status error';field.select()}finally{setBusy(button,false)}
});
$('#hold-form').addEventListener('submit',async event=>{
  event.preventDefault();const quantity=$('#quantity');
  if(!quantity.checkValidity()){status('Enter a quantity from 1 to 10.',true);quantity.focus();return}
  const button=$('#hold-submit');mutationPending=true;setBusy(button,true,'Creating hold…');$('#confirm-order').disabled=true;
  try{const result=await request('/api/holds',{method:'POST',body:{quantity:Number(quantity.value)},headers:{'idempotency-key':key()}});activeHold=result.hold;render(result.state);status(`Held ${activeHold.quantity} synthetic admission${activeHold.quantity===1?'':'s'} for 10 minutes.`)}catch(error){status(error.status===409?'Not enough capacity is available for that hold.':error.message,true)}finally{mutationPending=false;setBusy(button,false);$('#confirm-order').disabled=!activeHold}
});
$('#confirm-order').addEventListener('click',async()=>{
  if(!activeHold||mutationPending)return;const button=$('#confirm-order');mutationPending=true;setBusy(button,true,'Confirming…');
  try{const result=await request('/api/orders',{method:'POST',body:{holdId:activeHold.id,productId:$('#product').value},headers:{'idempotency-key':key()}});activeHold=null;render(result.state);status('Synthetic order confirmed and ticket issued. No payment was collected.')}catch(error){status(error.message,true);await load()}finally{mutationPending=false;setBusy(button,false);button.disabled=!activeHold}
});
async function checkIn(ticketId,button){if(mutationPending)return;mutationPending=true;setBusy(button,true,'Recording…');try{const result=await request('/api/checkins',{method:'POST',body:{ticketId},headers:{'idempotency-key':key()}});render(result.state);status(`Check-in result: ${result.result.result}.`)}catch(error){if(error.data?.result&&error.data?.state){render(error.data.state);status(`Check-in result: ${error.data.result.result}.`,true)}else{status(error.message,true);await load()}}finally{mutationPending=false;if(document.body.contains(button))setBusy(button,false)}}
$('#refresh').addEventListener('click',async()=>{const button=$('#refresh');setBusy(button,true,'Refreshing…');await load({announce:true});setBusy(button,false)});
$('#logout').addEventListener('click',async()=>{const button=$('#logout');setBusy(button,true,'Signing out…');try{await request('/api/auth/logout',{method:'POST'})}finally{csrf='';state=null;activeHold=null;mutationPending=false;const node=$('#login-status');node.textContent='';node.className='status';await load({focusLogin:true});setBusy(button,false)}});
$$('[data-nav]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();showView(link.dataset.nav,{focus:true})}));
$('#mobile-nav').addEventListener('change',event=>showView(event.target.value,{focus:true}));
window.addEventListener('hashchange',()=>{if(!$('#console').hidden)showView(location.hash.slice(1),{focus:true,updateHash:false})});
load();
