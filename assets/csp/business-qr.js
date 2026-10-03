(() => {
  const form = document.getElementById('qrForm');
  const input = document.getElementById('identifier');
  const result = document.getElementById('qrResult');
  const error = document.getElementById('qrError');
  const image = document.getElementById('qrImage');
  const passportLink = document.getElementById('passportLink');
  const downloadLink = document.getElementById('downloadLink');
  const printButton = document.getElementById('printButton');

  const show = identifier => {
    const clean = String(identifier || '').trim();
    if (!clean || clean.length > 300) {
      result.hidden = true;
      error.hidden = false;
      error.textContent = 'Въведи валиден Unique Battery ID.';
      document.body.dataset.businessQrReady = 'false';
      return;
    }

    const passportUrl = new URL('/passport', location.origin);
    passportUrl.searchParams.set('identifier', clean);
    const qrUrl = new URL('/api/qr', location.origin);
    qrUrl.searchParams.set('identifier', clean);

    input.value = clean;
    image.src = qrUrl.pathname + qrUrl.search;
    passportLink.href = passportUrl.pathname + passportUrl.search;
    passportLink.textContent = passportUrl.href;
    downloadLink.href = qrUrl.pathname + qrUrl.search;
    result.hidden = false;
    error.hidden = true;
    document.body.dataset.businessQrReady = 'true';
    document.body.dataset.qrIdentifier = clean;
  };

  const initial = new URLSearchParams(location.search).get('identifier');
  if (initial) show(initial);

  form.addEventListener('submit', event => {
    event.preventDefault();
    const clean = input.value.trim();
    if (!clean) return show('');
    const url = new URL(location.href);
    url.searchParams.set('identifier', clean);
    history.replaceState(null, '', url.pathname + url.search);
    show(clean);
  });

  image.addEventListener('error', () => {
    error.hidden = false;
    error.textContent = 'QR кодът не можа да бъде генериран.';
    document.body.dataset.businessQrReady = 'false';
  });

  printButton.addEventListener('click', () => window.print());
})();
