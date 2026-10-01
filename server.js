require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const TZ = process.env.BUSINESS_TZ || 'America/Campo_Grande';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');

// ---------- Banco de dados ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'king.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS services(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(service_id) REFERENCES services(id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, status);
`);
if (!db.prepare('SELECT COUNT(*) c FROM services').get().c) {
  const ins = db.prepare('INSERT INTO services(name,price,duration) VALUES (?,?,?)');
  ins.run('Corte', 35, 60);
  ins.run('Barba', 25, 45);
  ins.run('Corte + Barba', 55, 90);
}

// ---------- Regras da agenda ----------
// Horários de início oferecidos e janelas de funcionamento (em minutos desde 00:00).
const SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
const OPEN_BLOCKS = [[8 * 60, 12 * 60], [13 * 60, 18 * 60]]; // 08–12 e 13–18 (almoço 12–13)

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fitsOpenHours = (start, dur) => OPEN_BLOCKS.some(([a, b]) => start >= a && start + dur <= b);

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Data/hora atuais no fuso da barbearia (não no fuso do servidor).
function nowLocal() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}

// Há reserva confirmada que se sobrepõe ao intervalo [time, time+duration)?
function hasConflict(date, time, duration, ignoreId = 0) {
  const start = toMin(time);
  const rows = db.prepare(
    `SELECT b.id, b.time, s.duration FROM bookings b JOIN services s ON s.id=b.service_id
     WHERE b.date=? AND b.status='confirmed' AND b.id<>?`
  ).all(date, ignoreId);
  return rows.some(r => start < toMin(r.time) + r.duration && toMin(r.time) < start + duration);
}

function isAvailable(date, time, duration) {
  const start = toMin(time);
  if (!fitsOpenHours(start, duration)) return false;
  const now = nowLocal();
  if (date < now.date || (date === now.date && start <= now.minutes)) return false;
  return !hasConflict(date, time, duration);
}

const getService = id => db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(Number(id));

// ---------- Middlewares ----------
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- API pública ----------
app.get('/api/services', (req, res) => {
  res.json(db.prepare('SELECT id,name,price,duration FROM services WHERE active=1 ORDER BY id').all());
});

app.get('/api/slots', (req, res) => {
  const { date, serviceId } = req.query;
  if (!validDate(date)) return res.status(400).json({ error: 'Data inválida' });
  let duration = 60;
  if (serviceId) {
    const svc = getService(serviceId);
    if (!svc) return res.status(400).json({ error: 'Serviço inválido.' });
    duration = svc.duration;
  }
  res.json(SLOTS.map(time => ({ time, available: isAvailable(date, time, duration) })));
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { name, phone, serviceId, date, time } = req.body || {};
    if (!name || !phone || !serviceId || !date || !time) return res.status(400).json({ error: 'Preencha todos os campos.' });
    const cleanName = String(name).trim();
    const cleanPhone = String(phone).trim();
    const digits = cleanPhone.replace(/\D/g, '');
    if (cleanName.length < 2 || cleanName.length > 80) return res.status(400).json({ error: 'Informe um nome válido.' });
    if (digits.length < 10 || digits.length > 13) return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
    if (!validDate(date)) return res.status(400).json({ error: 'Data inválida.' });
    if (!SLOTS.includes(time)) return res.status(400).json({ error: 'Horário inválido.' });
    const svc = getService(serviceId);
    if (!svc) return res.status(400).json({ error: 'Serviço inválido.' });

    const now = nowLocal();
    if (date < now.date || (date === now.date && toMin(time) <= now.minutes)) {
      return res.status(400).json({ error: 'Esse horário já passou. Escolha outro.' });
    }
    if (!isAvailable(date, time, svc.duration)) {
      return res.status(409).json({ error: 'Esse horário não está mais disponível. Escolha outro.' });
    }

    const info = db.prepare('INSERT INTO bookings(name,phone,service_id,date,time) VALUES(?,?,?,?,?)')
      .run(cleanName, cleanPhone, svc.id, date, time);
    const booking = { id: Number(info.lastInsertRowid), name: cleanName, phone: cleanPhone, service: svc.name, price: svc.price, date, time };
    const whatsappSent = await sendWhatsApp(booking);
    res.status(201).json({ message: 'Agendamento confirmado!', booking, whatsappSent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao salvar agendamento.' });
  }
});

// ---------- API do painel ----------
function safeEqual(a, b) {
  const A = Buffer.from(String(a || '')), B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function decode(v) { try { return decodeURIComponent(v || ''); } catch { return ''; } }
function auth(req) {
  const user = decode(req.headers['x-admin-user']);
  const pass = decode(req.headers['x-admin-password']);
  const okUser = safeEqual(user, process.env.ADMIN_USER || 'admin');
  const okPass = safeEqual(pass, process.env.ADMIN_PASSWORD || 'troque-esta-senha');
  return okUser && okPass;
}

app.get('/api/admin/bookings', (req, res) => {
  if (!auth(req)) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  const { date } = req.query;
  if (date && !validDate(date)) return res.status(400).json({ error: 'Data inválida' });
  const base = 'SELECT b.*, s.name service, s.price FROM bookings b JOIN services s ON s.id=b.service_id';
  const rows = date
    ? db.prepare(base + ' WHERE b.date=? ORDER BY b.time').all(date)
    : db.prepare(base + ' ORDER BY b.date DESC, b.time').all();
  res.json(rows);
});

app.patch('/api/admin/bookings/:id', (req, res) => {
  if (!auth(req)) return res.status(401).json({ error: 'Não autorizado' });
  const status = req.body && req.body.status;
  if (!['confirmed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const id = Number(req.params.id);
  const b = db.prepare('SELECT b.*, s.duration FROM bookings b JOIN services s ON s.id=b.service_id WHERE b.id=?').get(id);
  if (!b) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  if (status === 'confirmed' && hasConflict(b.date, b.time, b.duration, id)) {
    return res.status(409).json({ error: 'Já existe outro agendamento nesse horário.' });
  }
  db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, id);
  res.json({ ok: true });
});

// ---------- WhatsApp (opcional) ----------
async function sendWhatsApp(b) {
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID, to = process.env.WHATSAPP_TO;
  if (!token || !phoneId || !to) return false;
  const [y, m, d] = b.date.split('-');
  const body = [
    'KING BARBEARIA',
    `Novo agendamento #${b.id}`,
    `Cliente: ${b.name}`,
    `WhatsApp: ${b.phone}`,
    `Serviço: ${b.service}`,
    `Data: ${d}/${m}/${y}`,
    `Horário: ${b.time}`
  ].join('\n');
  try {
    const r = await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body } }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) console.error('WhatsApp falhou:', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.error('WhatsApp erro:', e.message);
    return false;
  }
}

// ---------- Erros ----------
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requisição inválida.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno.' });
});

app.listen(PORT, () => {
  console.log(`KING BARBEARIA: http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'troque-esta-senha') {
    console.warn('ATENÇÃO: defina uma ADMIN_PASSWORD própria no arquivo .env antes de publicar.');
  }
});
