// Perilaku komponen shadcn (pengganti Radix) untuk halaman EJS:
// DropdownMenu, Dialog/Sheet, AlertDialog konfirmasi, state proses form, dan panel filter.
// Alert shadcn untuk pesan yang dibuat di browser. html harus sudah di-escape oleh pemanggil.
window.uiAlert = (type, html) => {
  const variant = {
    success: 'border-status-hadir-foreground/25 bg-status-hadir text-status-hadir-foreground',
    warning: 'border-status-telat-foreground/25 bg-status-telat text-status-telat-foreground',
    danger: 'bg-card text-destructive',
    info: 'bg-card text-card-foreground',
  }[type] || 'bg-card text-card-foreground';
  const role = type === 'danger' || type === 'warning' ? 'alert' : 'status';
  return `<div data-slot="alert" data-variant="${type}" role="${role}" class="relative w-full rounded-lg border px-4 py-3 text-sm ${variant}">${html}</div>`;
};

(() => {
  // DropdownMenu: <button data-dropdown aria-controls="id"> + <div id="id" role="menu">
  const openMenus = new Set();
  function closeMenu(menu, returnFocus) {
    menu.dataset.state = 'closed';
    const trigger = document.querySelector(`[data-dropdown][aria-controls="${menu.id}"]`);
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus();
    }
    openMenus.delete(menu);
  }
  function openMenu(trigger) {
    const menu = document.getElementById(trigger.getAttribute('aria-controls'));
    openMenus.forEach((m) => closeMenu(m, false));
    menu.dataset.state = 'open';
    trigger.setAttribute('aria-expanded', 'true');
    openMenus.add(menu);
    const first = menu.querySelector('[role=menuitem]');
    if (first) first.focus();
  }
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-dropdown]');
    if (trigger) {
      e.preventDefault();
      const menu = document.getElementById(trigger.getAttribute('aria-controls'));
      if (menu.dataset.state === 'open') closeMenu(menu, false); else openMenu(trigger);
      return;
    }
    openMenus.forEach((m) => { if (!m.contains(e.target)) closeMenu(m, false); });
  });
  document.addEventListener('keydown', (e) => {
    const menu = e.target.closest && e.target.closest('[role=menu].ui-dropdown');
    if (!menu) return;
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(menu, true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') closeMenu(menu, false);
  });

  // Dialog dan Sheet: <button data-dialog-open="id"> membuka <dialog id="id">
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-dialog-open]');
    if (opener) {
      const dlg = document.getElementById(opener.dataset.dialogOpen);
      if (dlg && !dlg.open) { dlg.showModal(); opener.setAttribute('aria-expanded', 'true'); dlg.addEventListener('close', () => opener.setAttribute('aria-expanded', 'false'), { once: true }); }
      return;
    }
    if (e.target.closest('[data-dialog-close]')) { e.target.closest('dialog').close(); return; }
    // Klik di luar konten (area backdrop) menutup dialog
    if (e.target.tagName === 'DIALOG' && e.target.classList.contains('ui-dialog')) {
      const r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
    }
  });

  // AlertDialog konfirmasi untuk <form data-confirm="...">
  const confirmDlg = document.getElementById('confirmDialog');
  let pending = null;
  if (confirmDlg) {
    confirmDlg.querySelector('[data-confirm-ok]').addEventListener('click', () => {
      const { form, submitter } = pending;
      form.dataset.confirmed = '1';
      confirmDlg.close();
      if (form.requestSubmit) form.requestSubmit(submitter && submitter.form === form ? submitter : undefined); else form.submit();
    });
    confirmDlg.addEventListener('close', () => { if (pending && !pending.form.dataset.confirmed && pending.submitter) pending.submitter.focus(); });
  }

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.dataset.confirm && !form.dataset.confirmed) {
      e.preventDefault();
      if (!confirmDlg) { if (window.confirm(form.dataset.confirm)) { form.dataset.confirmed = '1'; form.requestSubmit(e.submitter); } return; }
      pending = { form, submitter: e.submitter };
      confirmDlg.querySelector('[data-confirm-text]').textContent = form.dataset.confirm;
      confirmDlg.querySelector('[data-confirm-ok]').textContent = form.dataset.confirmLabel || 'Ya, lanjutkan';
      confirmDlg.showModal();
      confirmDlg.querySelector('[data-confirm-cancel]').focus();
      return;
    }
    delete form.dataset.confirmed;
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
      btn.innerHTML = `<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ${form.dataset.loading || 'Memproses...'}`;
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

  // Alert yang bisa ditutup
  document.addEventListener('click', (e) => {
    const x = e.target.closest('[data-dismiss]');
    if (x) x.closest('[data-slot=alert]').remove();
  });

  // Panel filter (Collapsible): terbuka di layar lebar, terlipat di HP
  document.querySelectorAll('details[data-collapsible]').forEach((d) => {
    if (window.matchMedia('(min-width: 768px)').matches) d.open = true;
  });
})();
