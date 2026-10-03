const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function titleFromPath(path) {
  return path.split('.').pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function display(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function flatten(value, prefix = '') {
  if (value === null || value === undefined) return [{ path: prefix || 'value', value }];
  if (Array.isArray(value)) return [{ path: prefix || 'value', value }];
  if (typeof value !== 'object') return [{ path: prefix || 'value', value }];

  const entries = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) entries.push(...flatten(child, path));
    else entries.push({ path, value: child });
  }
  return entries;
}

(async () => {
  const hero = document.getElementById('hero');
  const publicFields = document.getElementById('publicFields');
  const qrLink = document.getElementById('qrLink');
  const identifier = new URLSearchParams(location.search).get('identifier') || '';

  if (!identifier || identifier.length > 300) {
    hero.innerHTML = '<div class="error">Липсва валиден unique Battery ID.</div>';
    document.body.dataset.publicPassportReady = 'false';
    return;
  }

  qrLink.href = `/qr?identifier=${encodeURIComponent(identifier)}`;

  try {
    const response = await fetch(`/api/passport?identifier=${encodeURIComponent(identifier)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload || !payload.data) {
      const message = payload?.error?.message || 'Passport not found.';
      hero.innerHTML = `<div class="error">${esc(message)}</div>`;
      document.body.dataset.publicPassportReady = 'false';
      return;
    }

    const passport = payload.data;
    hero.innerHTML = `
      <div class="badge">PUBLIC BATTERY PASSPORT</div>
      <h2>${esc(passport.status === 'active' ? 'Active passport' : passport.status)}</h2>
      <div class="uid">${esc(passport.unique_identifier)}</div>
      <div class="notice">Последна актуализация: ${esc(new Date(passport.updated_at).toLocaleString())}</div>
    `;

    const rows = flatten(passport.public_payload || {});
    publicFields.innerHTML = rows.length
      ? rows.map(({ path, value }) => `
        <article class="card" data-public-field="${esc(path)}">
          <div class="label">${esc(titleFromPath(path))}</div>
          <div class="value">${esc(display(value))}</div>
          <div class="path">${esc(path)}</div>
          <span class="access">public</span>
        </article>
      `).join('')
      : '<article class="card"><div class="empty">Няма публикувани публични полета.</div></article>';

    document.body.dataset.publicPassportReady = 'true';
    document.body.dataset.passportId = passport.unique_identifier;
  } catch {
    hero.innerHTML = '<div class="error">Паспортът не може да бъде зареден в момента.</div>';
    document.body.dataset.publicPassportReady = 'false';
  }
})();
