// Konfirmasi untuk form/tombol berbahaya: <form data-confirm="Yakin?">
document.addEventListener('submit', (e) => {
  const msg = e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});
