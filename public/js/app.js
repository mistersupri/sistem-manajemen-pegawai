// Konfirmasi untuk aksi berbahaya: <form data-confirm="Yakin?">
document.addEventListener('submit', (e) => {
  const form = e.target;
  const msg = form.dataset.confirm;
  if (msg && !window.confirm(msg)) { e.preventDefault(); return; }
  if (e.defaultPrevented || form.method.toLowerCase() !== 'post') return;
  // Cegah klik ganda dan tampilkan proses yang sedang berjalan
  const btn = e.submitter || form.querySelector('button[type=submit], button:not([type])');
  if (!btn || btn.disabled) return;
  if (btn.name) {
    const keep = document.createElement('input');
    keep.type = 'hidden';
    keep.name = btn.name;
    keep.value = btn.value;
    form.appendChild(keep);
  }
  btn.dataset.originalHtml = btn.innerHTML;
  setTimeout(() => {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border" aria-hidden="true"></span> ${form.dataset.loading || 'Memproses...'}`;
  }, 0);
});

// Tombol kembali (bfcache): pulihkan tombol yang tadi dinonaktifkan
window.addEventListener('pageshow', () => {
  document.querySelectorAll('button[data-original-html]').forEach((b) => {
    b.disabled = false;
    b.innerHTML = b.dataset.originalHtml;
    delete b.dataset.originalHtml;
  });
});

// Panel filter: terbuka di layar lebar, terlipat di HP
document.querySelectorAll('details.filter-panel').forEach((d) => {
  if (window.matchMedia('(min-width: 768px)').matches) d.open = true;
});
