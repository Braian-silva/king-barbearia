const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brDate = s => s.split('-').reverse().join('/');
const waLink = phone => {
  let d = String(phone).replace(/\D/g, '');
  if (d.length <= 11) d = '55' + d;
  return 'https://wa.me/' + d;
};

// Credenciais codificadas para aceitar acentos/símbolos na senha
const headers = () => ({
  'x-admin-user': encodeURIComponent($('user').value),
  'x-admin-password': encodeURIComponent($('pass').value)
});

async function load() {
  const date = $('adminDate').value;
  const list = $('list');
  list.innerHTML = '<p class="muted">Carregando...</p>';
  try {
    const r = await fetch('/api/admin/bookings' + (date ? '?date=' + date : ''), { headers: headers() });
    const j = await r.json();
    if (!r.ok) { list.innerHTML = `<p class="error">${esc(j.error || 'Acesso negado')}</p>`; return; }
    list.innerHTML = j.length ? j.map(b => {
      const cancelled = b.status === 'cancelled';
      return `<div class="row ${cancelled ? 'is-cancelled' : ''}">
        <div><b>${esc(b.time)} — ${esc(b.name)}</b> ${cancelled ? '<span class="tag">Cancelado</span>' : ''}<br>
        <span class="muted">${esc(b.service)} • <a class="wa" href="${waLink(b.phone)}" target="_blank" rel="noopener">${esc(b.phone)}</a> • ${brDate(b.date)}</span></div>
        ${cancelled
          ? `<button class="reactivate" data-id="${b.id}" data-status="confirmed">Reativar</button>`
          : `<button class="cancel" data-id="${b.id}" data-status="cancelled">Cancelar</button>`}
      </div>`;
    }).join('') : '<p class="muted">Nenhum agendamento.</p>';
  } catch {
    list.innerHTML = '<p class="error">Sem conexão com o servidor.</p>';
  }
}

async function setStatus(id, status) {
  const r = await fetch('/api/admin/bookings/' + id, {
    method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Não foi possível atualizar.'); }
  load();
}

$('login').addEventListener('submit', e => { e.preventDefault(); load(); });
$('list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  if (btn.dataset.status === 'cancelled' && !confirm('Cancelar este agendamento?')) return;
  setStatus(btn.dataset.id, btn.dataset.status);
});
