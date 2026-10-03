'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[ch]));

function identifierFromLocation() {
  const q = new URLSearchParams(location.search);
  return (q.get('identifier') || q.get('id') || '').trim();
}

function passportUrl(identifier) {
  return location.origin + '/passport?identifier=' + encodeURIComponent(identifier);
}

function qrUrl(identifier, download=false) {
  return '/api/qr?identifier=' + encodeURIComponent(identifier) + (download ? '&download=1' : '');
}

async function verifyPublicPassport(identifier) {
  const response = await fetch('/api/passport?identifier=' + encodeURIComponent(identifier), { cache:'no-store' });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const err = new Error(payload?.error?.message || ('Passport verification failed (' + response.status + ')'));
    err.status = response.status;
    throw err;
  }
  return payload?.data;
}

function setState(kind, message) {
  document.body.dataset.qrState = kind;
  $('status').className = 'status ' + kind;
  $('status').textContent = message;
}

(async()=>{
  const identifier = identifierFromLocation();
  $('identifier').textContent = identifier || '—';
  if (!identifier || identifier.length > 300) {
    setState('error','Липсва валиден Battery ID / DPP identifier.');
    return;
  }

  const target = passportUrl(identifier);
  $('encodedUrl').textContent = target;
  $('openPassport').href = target;\n  const topLink=$('openPassportTop'); if(topLink) topLink.href=target;
  $('downloadQr').href = qrUrl(identifier,true);

  try {
    setState('checking','Проверка на активния публичен паспорт…');
    const passport = await verifyPublicPassport(identifier);
    if (!passport || passport.status !== 'active') throw new Error('Public passport is not active.');

    const img = document.createElement('img');
    img.src = qrUrl(identifier,false);
    img.alt = 'QR code for DPP passport ' + identifier;
    img.width = 360;
    img.height = 360;
    img.dataset.liveQr = 'true';
    $('qrHost').replaceChildren(img);

    document.body.dataset.qrReady = 'true';
    document.body.dataset.qrKind = 'production-public-passport-url';
    document.body.dataset.qrIdentifier = identifier;
    $('passportMeta').innerHTML =
      '<strong>ACTIVE</strong> · passport ' + esc(passport.passport_id) +
      ' · updated ' + esc(passport.updated_at);
    setState('ok','QR е готов за сканиране и печат. URL е проверен срещу активен public passport.');
  } catch (error) {
    document.body.dataset.qrReady = 'false';
    $('qrHost').innerHTML = '<div class="qr-error">QR не се показва, докато public passport не бъде потвърден.</div>';
    setState('error', error.message || 'Passport verification failed.');
  }
})();

$('printLabel').addEventListener('click',()=>window.print());
