const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ==================== КАТАЛОГИ ПОДАРКОВ ====================
const REGULAR_GIFTS = [
  { id: 'heart', name: 'Сердце', stars: 15, emoji: '❤️', bg: ['#4a161b', '#1c1f22'] },
  { id: 'teddy', name: 'Мишка', stars: 15, emoji: '🧸', bg: ['#452710', '#1c1f22'] },
  { id: 'giftbox', name: 'Подарок', stars: 25, emoji: '🎁', bg: ['#571620', '#1c1f22'] },
  { id: 'rose', name: 'Роза', stars: 25, emoji: '🌹', bg: ['#4c1125', '#1c1f22'] },
  { id: 'cake', name: 'Торт', stars: 50, emoji: '🎂', bg: ['#52230f', '#1c1f22'] },
  { id: 'bouquet', name: 'Букет', stars: 50, emoji: '💐', bg: ['#441547', '#1c1f22'] },
  { id: 'rocket', name: 'Ракета', stars: 50, emoji: '🚀', bg: ['#162c59', '#1c1f22'] },
  { id: 'champagne', name: 'Шампанское', stars: 50, emoji: '🍾', bg: ['#283d0d', '#1c1f22'] },
  { id: 'trophy', name: 'Кубок', stars: 100, emoji: '🏆', bg: ['#4f330a', '#1c1f22'] },
  { id: 'ring', name: 'Кольцо', stars: 100, emoji: '💍', bg: ['#0e4152', '#1c1f22'] },
  { id: 'gem', name: 'Бриллиант', stars: 100, emoji: '💎', bg: ['#16326e', '#1c1f22'] }
];

const NFT_GIFTS = [
  { slug: 'plushpepe', name: 'Plush Pepe', sampleId: 1821, emoji: '🐸', supply: '2 861', floor: '6 796 TON', stars: 2500, bg: ['#1f4f38', '#10281d'] },
  { slug: 'heartlocket', name: 'Heart Locket', sampleId: 1387, emoji: '💝', supply: '1 973', floor: '1 528 TON', stars: 1800, bg: ['#244c6b', '#14293b'] },
  { slug: 'resistancedog', name: 'Resistance Dog', sampleId: 1, emoji: '🐶', supply: '14 929', floor: '525 TON', stars: 1200, bg: ['#1e3a8a', '#0b1536'] },
  { slug: 'durovscap', name: "Durov's Cap", sampleId: 986, emoji: '🧢', supply: '4 774', floor: '430 TON', stars: 1000, bg: ['#2b2d30', '#18191b'] },
  { slug: 'scaredcat', name: 'Scared Cat', sampleId: 15, emoji: '🙀', supply: '19 289', floor: '285 TON', stars: 850, bg: ['#5e3b17', '#2e1c0a'] },
  { slug: 'preciouspeach', name: 'Precious Peach', sampleId: 2744, emoji: '🍑', supply: '3 160', floor: '273 TON', stars: 800, bg: ['#6b2d18', '#30140a'] },
  { slug: 'heroichelmet', name: 'Heroic Helmet', sampleId: 1336, emoji: '🪖', supply: '3 794', floor: '187 TON', stars: 650, bg: ['#374151', '#111827'] },
  { slug: 'lootbag', name: 'Loot Bag', sampleId: 1, emoji: '💰', supply: '14 489', floor: '141 TON', stars: 550, bg: ['#3b4d1d', '#1b240d'] },
  { slug: 'astralshard', name: 'Astral Shard', sampleId: 1, emoji: '🔮', supply: '6 196', floor: '133 TON', stars: 500, bg: ['#3d2369', '#1e1036'] },
  { slug: 'swisswatch', name: 'Swiss Watch', sampleId: 5695, emoji: '⌚', supply: '29 323', floor: '64 TON', stars: 350, bg: ['#2c3747', '#141921'] },
  { slug: 'kissedfrog', name: 'Kissed Frog', sampleId: 1, emoji: '💋', supply: '14 278', floor: '53 TON', stars: 290, bg: ['#1a5933', '#0b2917'] },
  { slug: 'vintagecigar', name: 'Vintage Cigar', sampleId: 100, emoji: '🚬', supply: '24 000', floor: '28 TON', stars: 220, bg: ['#5c2918', '#29120a'] },
  { slug: 'signetring', name: 'Signet Ring', sampleId: 136, emoji: '💍', supply: '31 000', floor: '24 TON', stars: 200, bg: ['#691b1b', '#2e0c0c'] },
  { slug: 'electricskull', name: 'Electric Skull', sampleId: 177, emoji: '💀', supply: '22 000', floor: '22 TON', stars: 190, bg: ['#29285e', '#13122b'] },
  { slug: 'eternalrose', name: 'Eternal Rose', sampleId: 1, emoji: '🌹', supply: '35 000', floor: '19 TON', stars: 160, bg: ['#631830', '#290913'] },
  { slug: 'khabibspapakha', name: "Khabib's Papakha", sampleId: 1, emoji: '🐑', supply: '15 000', floor: '35 TON', stars: 260, bg: ['#57534e', '#1c1917'] },
  { slug: 'easteregg', name: 'Easter Egg', sampleId: 1, emoji: '🥚', supply: '173 176', floor: '5 TON', stars: 75, bg: ['#6b2143', '#2b0d1b'] }
];

const NFT_MODELS = ['Spectrum', 'Obsidian', 'Crimson', 'Golden', 'Cyber', 'Emerald', 'Royal'];
const NFT_PATTERNS = ['Telegram Star', 'Fehu Rune', 'Diamond', 'Crown', 'Lightning'];
const OWNER_NORM_PHONE = '+8888888888888';

// ==================== КРИПТОГРАФИЯ И БД ====================
function hashSecret(secret, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return { salt, hash };
}

function verifySecret(secret, salt, expectedHash) {
  const actual = crypto.scryptSync(String(secret), salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function normPhone(p) {
  const d = String(p || '').replace(/[^\d]/g, '');
  return d ? '+' + d : '';
}

function uid() {
  return crypto.randomUUID();
}

function initDB() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (parsed && parsed.users) return parsed;
    } catch {}
  }

  const ownerPass = hashSecret(process.env.OWNER_PASS || '2016');
  const ownerCloud = hashSecret(process.env.OWNER_CLOUD_PASS || '2016');
  const ownerId = 'u_owner';

  const db = {
    users: {
      [ownerId]: {
        id: ownerId,
        phone: '+888 888 888-88-88',
        normPhone: OWNER_NORM_PHONE,
        firstName: 'CW',
        lastName: 'Owner',
        username: '',
        bio: '',
        birthday: '',
        address: '',
        avatar: null,
        color: '#45c4cc',
        passHash: ownerPass.hash,
        passSalt: ownerPass.salt,
        cloudHash: ownerCloud.hash,
        cloudSalt: ownerCloud.salt,
        role: 'admin',
        verified: true,
        premium: true,
        banned: false,
        stars: 0,
        ton: 0,
        starHistory: [],
        contacts: [],
        blocked: [],
        online: false,
        lastSeen: Date.now(),
        privacy: {
          phone: 'everybody', lastSeen: 'everybody', birthday: 'everybody',
          groups: 'everybody', messages: 'everybody', gifts: 'everybody'
        },
        settings: { theme: 'dark', fontSize: 15, language: 'ru', autoDownload: true, notifications: true }
      }
    },
    sessions: {},
    gifts: {},
    chats: {
      ['saved_' + ownerId]: {
        id: 'saved_' + ownerId, type: 'saved', title: 'Избранное', description: 'Облачное хранилище',
        avatar: null, color: '#0a84ff', isPublic: false, inviteCode: null,
        ownerId, admins: [ownerId], members: [ownerId],
        pinnedMessageId: null, mutedBy: [], archivedBy: [], pinnedBy: [ownerId],
        unreadCounts: {}, messages: []
      }
    },
    stories: [],
    calls: [],
    reports: [],
    adminAudit: []
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  return db;
}

let db = initDB();
let savePending = false;
function saveDB() {
  if (savePending) return;
  savePending = true;
  setImmediate(() => {
    savePending = false;
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  });
}

// ==================== СЕРВЕР И WEBSOCKET ====================
const app = express();
app.use(express.json({ limit: '16mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const socketsByUser = new Map();

function pushToUser(userId, event, payload) {
  const set = socketsByUser.get(userId);
  if (!set) return;
  const msg = JSON.stringify({ event, payload });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function pushToChat(chat, event, payload, excludeUserId = null) {
  for (const memberId of chat.members) {
    if (memberId !== excludeUserId) pushToUser(memberId, event, payload);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const sess = token && db.sessions[token];
  if (!sess || !db.users[sess.userId] || db.users[sess.userId].banned) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const userId = sess.userId;
  if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
  socketsByUser.get(userId).add(ws);
  db.users[userId].online = true;
  db.users[userId].lastSeen = Date.now();
  saveDB();

  for (const c of Object.values(db.chats)) {
    if (c.members.includes(userId)) pushToChat(c, 'presence', { userId, online: true, lastSeen: Date.now() }, userId);
  }

  ws.on('message', raw => {
    try {
      const { event, payload } = JSON.parse(raw);
      if (event === 'typing' && payload?.chatId) {
        const chat = db.chats[payload.chatId];
        if (chat && chat.members.includes(userId)) {
          pushToChat(chat, 'typing', { chatId: chat.id, userId, isTyping: !!payload.isTyping }, userId);
        }
      }
      if (event === 'call:signal' && payload?.toId) {
        pushToUser(payload.toId, 'call:signal', { ...payload, fromId: userId });
      }
    } catch {}
  });

  ws.on('close', () => {
    const set = socketsByUser.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        socketsByUser.delete(userId);
        if (db.users[userId]) {
          db.users[userId].online = false;
          db.users[userId].lastSeen = Date.now();
          saveDB();
          for (const c of Object.values(db.chats)) {
            if (c.members.includes(userId)) pushToChat(c, 'presence', { userId, online: false, lastSeen: db.users[userId].lastSeen }, userId);
          }
        }
      }
    }
  });
});

// ==================== MIDDLEWARE & ФИЛЬТРЫ ПРИВАТНОСТИ ====================
function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  const sess = token && db.sessions[token];
  if (!sess || !db.users[sess.userId]) return res.status(401).json({ error: 'Требуется авторизация' });
  const user = db.users[sess.userId];
  if (user.banned) return res.status(403).json({ error: 'Аккаунт заблокирован' });
  sess.lastActive = Date.now();
  req.user = user;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  next();
}

function canSeePrivacy(target, viewerId, field) {
  if (!viewerId || target.id === viewerId) return true;
  const rule = target.privacy?.[field] || 'everybody';
  if (rule === 'everybody') return true;
  if (rule === 'contacts') return target.contacts.includes(viewerId);
  return false;
}

function sanitizeSelf(u) {
  return {
    id: u.id, phone: u.phone, firstName: u.firstName, lastName: u.lastName,
    username: u.username, bio: u.bio, birthday: u.birthday, address: u.address,
    avatar: u.avatar, color: u.color, isAdmin: u.role === 'admin',
    verified: u.verified, premium: u.premium, stars: u.stars, ton: u.ton,
    starHistory: u.starHistory || [], contacts: u.contacts || [], blocked: u.blocked || [],
    privacy: u.privacy, settings: u.settings, online: u.online, lastSeen: u.lastSeen
  };
}

function sanitizePublicUser(u, viewerId) {
  const showLast = canSeePrivacy(u, viewerId, 'lastSeen');
  const showGifts = canSeePrivacy(u, viewerId, 'gifts');
  const userGifts = showGifts ? Object.values(db.gifts).filter(g => g.ownerId === u.id) : [];
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    bio: u.bio,
    avatar: u.avatar,
    color: u.color,
    verified: u.verified,
    premium: u.premium,
    phone: canSeePrivacy(u, viewerId, 'phone') ? u.phone : null,
    birthday: canSeePrivacy(u, viewerId, 'birthday') ? u.birthday : null,
    address: u.address,
    online: showLast ? u.online : false,
    lastSeen: showLast ? u.lastSeen : null,
    giftsHidden: !showGifts,
    gifts: userGifts
  };
}

// ==================== АВТОРИЗАЦИЯ И СЕССИИ ====================
app.post('/api/auth/register', (req, res) => {
  const { phone, firstName, lastName = '', username = '', bio = '', avatar = null, password, cloudPassword } = req.body;
  const norm = normPhone(phone);
  if (!norm || !firstName?.trim() || !password || !cloudPassword) {
    return res.status(400).json({ error: 'Заполните номер, имя, пароль и облачный пароль' });
  }
  if (Object.values(db.users).some(u => u.normPhone === norm)) {
    return res.status(409).json({ error: 'Этот номер уже зарегистрирован' });
  }
  let cleanUser = String(username || '').trim();
  if (cleanUser) {
    if (!cleanUser.startsWith('@')) cleanUser = '@' + cleanUser;
    if (Object.values(db.users).some(u => u.username.toLowerCase() === cleanUser.toLowerCase())) {
      return res.status(409).json({ error: 'Это имя пользователя уже занято' });
    }
  }

  const p = hashSecret(password);
  const c = hashSecret(cloudPassword);
  const id = 'u_' + uid().slice(0, 8);
  const user = {
    id, phone: phone.trim(), normPhone: norm, firstName: firstName.trim(), lastName: lastName.trim(),
    username: cleanUser, bio: bio.trim(), birthday: '', address: '', avatar, color: '#45c4cc',
    passHash: p.hash, passSalt: p.salt, cloudHash: c.hash, cloudSalt: c.salt,
    role: 'user', verified: false, premium: false, banned: false, stars: 0, ton: 0,
    starHistory: [], contacts: [], blocked: [], online: false, lastSeen: Date.now(),
    privacy: { phone: 'everybody', lastSeen: 'everybody', birthday: 'everybody', groups: 'everybody', messages: 'everybody', gifts: 'everybody' },
    settings: { theme: 'dark', fontSize: 15, language: 'ru', autoDownload: true, notifications: true }
  };
  db.users[id] = user;
  db.chats['saved_' + id] = {
    id: 'saved_' + id, type: 'saved', title: 'Избранное', description: 'Облачное хранилище',
    avatar: null, color: '#0a84ff', isPublic: false, inviteCode: null,
    ownerId: id, admins: [id], members: [id], pinnedMessageId: null,
    mutedBy: [], archivedBy: [], pinnedBy: [id], unreadCounts: {}, messages: []
  };

  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: id, device: req.headers['user-agent']?.slice(0, 60) || 'Web', createdAt: Date.now(), lastActive: Date.now() };
  saveDB();
  res.json({ token, user: sanitizeSelf(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { phone, password, cloudPassword } = req.body;
  const norm = normPhone(phone);
  const user = Object.values(db.users).find(u => u.normPhone === norm);
  if (!user) return res.status(404).json({ error: 'Аккаунт не найден' });
  if (user.banned) return res.status(403).json({ error: 'Аккаунт заблокирован' });
  if (!verifySecret(password || '', user.passSalt, user.passHash)) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  if (!verifySecret(cloudPassword || '', user.cloudSalt, user.cloudHash)) {
    return res.status(401).json({ error: 'Неверный облачный пароль' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, device: req.headers['user-agent']?.slice(0, 60) || 'Web', createdAt: Date.now(), lastActive: Date.now() };
  saveDB();
  res.json({ token, user: sanitizeSelf(user) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  delete db.sessions[req.token];
  saveDB();
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeSelf(req.user) });
});

app.get('/api/auth/sessions', requireAuth, (req, res) => {
  const list = Object.entries(db.sessions)
    .filter(([, s]) => s.userId === req.user.id)
    .map(([t, s]) => ({ id: t.slice(0, 12), current: t === req.token, device: s.device, lastActive: s.lastActive }));
  res.json({ sessions: list });
});

// ==================== ЗАГРУЗКА МЕДИАФАЙЛОВ ====================
app.post('/api/upload', requireAuth, (req, res) => {
  const { dataUrl, fileName = 'file' } = req.body;
  const m = String(dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'Некорректный формат файла' });
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'Файл больше 12 МБ' });
  const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' };
  const ext = extMap[mime] || 'bin';
  const name = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  res.json({ url: `/uploads/${name}`, mime, fileName: path.basename(fileName) });
});

// ==================== ПРОФИЛЬ, ПРИВАТНОСТЬ, НАСТРОЙКИ ====================
app.patch('/api/profile', requireAuth, (req, res) => {
  const u = req.user;
  const { firstName, lastName, username, bio, birthday, address, avatar } = req.body;
  if (firstName !== undefined && firstName.trim()) u.firstName = firstName.trim();
  if (lastName !== undefined) u.lastName = lastName.trim();
  if (username !== undefined) {
    let un = username.trim();
    if (un && !un.startsWith('@')) un = '@' + un;
    if (un && Object.values(db.users).some(x => x.id !== u.id && x.username.toLowerCase() === un.toLowerCase())) {
      return res.status(409).json({ error: 'Юзернейм занят' });
    }
    u.username = un;
  }
  if (bio !== undefined) u.bio = bio.trim();
  if (birthday !== undefined) u.birthday = birthday.trim();
  if (address !== undefined) u.address = address.trim();
  if (avatar !== undefined) u.avatar = avatar;
  saveDB();
  res.json({ user: sanitizeSelf(u) });
});

app.patch('/api/profile/security', requireAuth, (req, res) => {
  const u = req.user;
  const { currentPassword, newPassword, newCloudPassword, newPhone } = req.body;
  if (!verifySecret(currentPassword || '', u.passSalt, u.passHash)) {
    return res.status(401).json({ error: 'Текущий пароль неверен' });
  }
  if (newPassword) {
    const p = hashSecret(newPassword);
    u.passHash = p.hash; u.passSalt = p.salt;
  }
  if (newCloudPassword) {
    const c = hashSecret(newCloudPassword);
    u.cloudHash = c.hash; u.cloudSalt = c.salt;
  }
  if (newPhone) {
    const n = normPhone(newPhone);
    if (!n || Object.values(db.users).some(x => x.id !== u.id && x.normPhone === n)) {
      return res.status(409).json({ error: 'Номер некорректен или занят' });
    }
    u.phone = newPhone.trim(); u.normPhone = n;
  }
  saveDB();
  res.json({ user: sanitizeSelf(u) });
});

app.patch('/api/profile/privacy', requireAuth, (req, res) => {
  Object.assign(req.user.privacy, req.body || {});
  saveDB();
  res.json({ privacy: req.user.privacy });
});

app.patch('/api/profile/settings', requireAuth, (req, res) => {
  Object.assign(req.user.settings, req.body || {});
  saveDB();
  res.json({ settings: req.user.settings });
});

// ==================== ПОЛЬЗОВАТЕЛИ, КОНТАКТЫ, БЛОКИРОВКИ ====================
app.get('/api/users/:id', requireAuth, (req, res) => {
  const target = db.users[req.params.id];
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  const sharedChats = Object.values(db.chats)
    .filter(c => (c.type === 'group' || c.type === 'channel') && c.members.includes(req.user.id) && c.members.includes(target.id))
    .map(c => ({ id: c.id, title: c.title, type: c.type, membersCount: c.members.length }));
  const ownedChannel = Object.values(db.chats).find(c => c.type === 'channel' && c.ownerId === target.id);
  res.json({
    user: sanitizePublicUser(target, req.user.id),
    isContact: req.user.contacts.includes(target.id),
    isBlocked: req.user.blocked.includes(target.id),
    sharedChats,
    channel: ownedChannel ? { id: ownedChannel.id, title: ownedChannel.title, subscribers: ownedChannel.members.length, lastPost: ownedChannel.messages.slice(-1)[0]?.text || '' } : null
  });
});

app.get('/api/contacts', requireAuth, (req, res) => {
  const contacts = req.user.contacts.map(id => db.users[id]).filter(Boolean).map(u => sanitizePublicUser(u, req.user.id));
  const blocked = req.user.blocked.map(id => db.users[id]).filter(Boolean).map(u => sanitizePublicUser(u, req.user.id));
  res.json({ contacts, blocked });
});

app.post('/api/contacts', requireAuth, (req, res) => {
  const { query } = req.body;
  const q = String(query || '').trim();
  const norm = normPhone(q);
  const found = Object.values(db.users).find(u =>
    u.id !== req.user.id && (u.id === q || (norm && u.normPhone === norm) || (u.username && u.username.toLowerCase() === (q.startsWith('@') ? q : '@' + q).toLowerCase()))
  );
  if (!found) return res.status(404).json({ error: 'Пользователь не найден в CW-Gram' });
  if (!req.user.contacts.includes(found.id)) req.user.contacts.push(found.id);
  saveDB();
  res.json({ contact: sanitizePublicUser(found, req.user.id) });
});

app.delete('/api/contacts/:id', requireAuth, (req, res) => {
  req.user.contacts = req.user.contacts.filter(x => x !== req.params.id);
  saveDB();
  res.json({ ok: true });
});

app.post('/api/users/:id/block', requireAuth, (req, res) => {
  const tid = req.params.id;
  if (req.user.blocked.includes(tid)) req.user.blocked = req.user.blocked.filter(x => x !== tid);
  else req.user.blocked.push(tid);
  saveDB();
  res.json({ blocked: req.user.blocked.includes(tid) });
});

app.post('/api/users/:id/report', requireAuth, (req, res) => {
  db.reports.push({ id: uid(), fromId: req.user.id, targetId: req.params.id, reason: String(req.body.reason || 'Спам'), createdAt: Date.now() });
  saveDB();
  res.json({ ok: true });
});

// ==================== ГЛОБАЛЬНЫЙ ПОИСК ====================
app.get('/api/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ users: [], chats: [], messages: [] });
  const users = Object.values(db.users)
    .filter(u => u.id !== req.user.id && !u.banned && (`${u.firstName} ${u.lastName} ${u.username}`).toLowerCase().includes(q))
    .slice(0, 15)
    .map(u => sanitizePublicUser(u, req.user.id));

  const chats = Object.values(db.chats)
    .filter(c => (c.members.includes(req.user.id) || c.isPublic) && c.title.toLowerCase().includes(q))
    .slice(0, 15)
    .map(c => ({ id: c.id, type: c.type, title: c.title, membersCount: c.members.length, isMember: c.members.includes(req.user.id) }));

  const messages = [];
  for (const c of Object.values(db.chats)) {
    if (!c.members.includes(req.user.id)) continue;
    for (const m of c.messages) {
      if (!m.deletedForAll && !(m.deletedFor || []).includes(req.user.id) && (m.text || '').toLowerCase().includes(q)) {
        messages.push({ chatId: c.id, chatTitle: c.title, msgId: m.id, text: m.text, createdAt: m.createdAt });
        if (messages.length >= 25) break;
      }
    }
  }
  res.json({ users, chats, messages });
});

// ==================== ЧАТЫ, ГРУППЫ, КАНАЛЫ И СООБЩЕНИЯ ====================
function formatChatForUser(c, userId) {
  let title = c.title;
  let avatar = c.avatar;
  let color = c.color;
  let peer = null;
  if (c.type === 'dm') {
    const peerId = c.members.find(id => id !== userId) || userId;
    const p = db.users[peerId];
    if (p) {
      title = `${p.firstName} ${p.lastName}`.trim();
      avatar = p.avatar;
      color = p.color;
      peer = sanitizePublicUser(p, userId);
    }
  }
  const visibleMsgs = c.messages.filter(m => !m.deletedForAll && !(m.deletedFor || []).includes(userId));
  return {
    id: c.id, type: c.type, title, description: c.description, avatar, color,
    isPublic: c.isPublic, inviteCode: c.inviteCode, ownerId: c.ownerId, admins: c.admins,
    members: c.members.map(id => db.users[id] ? { id, name: `${db.users[id].firstName} ${db.users[id].lastName}`.trim(), avatar: db.users[id].avatar } : null).filter(Boolean),
    peer, pinnedMessageId: c.pinnedMessageId,
    muted: (c.mutedBy || []).includes(userId),
    archived: (c.archivedBy || []).includes(userId),
    pinned: (c.pinnedBy || []).includes(userId),
    unread: c.unreadCounts?.[userId] || 0,
    messages: visibleMsgs
  };
}

app.get('/api/chats', requireAuth, (req, res) => {
  const list = Object.values(db.chats)
    .filter(c => c.members.includes(req.user.id))
    .map(c => formatChatForUser(c, req.user.id));
  res.json({ chats: list });
});

app.post('/api/chats/dm', requireAuth, (req, res) => {
  const peer = db.users[req.body.peerId];
  if (!peer) return res.status(404).json({ error: 'Пользователь не найден' });
  if (peer.blocked.includes(req.user.id) || !canSeePrivacy(peer, req.user.id, 'messages')) {
    return res.status(403).json({ error: 'Пользователь ограничил получение сообщений' });
  }
  let chat = Object.values(db.chats).find(c => c.type === 'dm' && c.members.includes(req.user.id) && c.members.includes(peer.id));
  if (!chat) {
    chat = {
      id: 'dm_' + uid().slice(0, 8), type: 'dm', title: '', description: '', avatar: null, color: peer.color,
      isPublic: false, inviteCode: null, ownerId: req.user.id, admins: [req.user.id, peer.id],
      members: [req.user.id, peer.id], pinnedMessageId: null, mutedBy: [], archivedBy: [], pinnedBy: [], unreadCounts: {}, messages: []
    };
    db.chats[chat.id] = chat;
    saveDB();
    pushToUser(peer.id, 'chat:new', formatChatForUser(chat, peer.id));
  }
  res.json({ chat: formatChatForUser(chat, req.user.id) });
});

app.post('/api/chats/create', requireAuth, (req, res) => {
  const { type, title, description = '', isPublic = true, avatar = null, memberIds = [] } = req.body;
  if (!['group', 'channel'].includes(type) || !title?.trim()) {
    return res.status(400).json({ error: 'Укажите название' });
  }
  const members = Array.from(new Set([req.user.id, ...memberIds.filter(id => db.users[id] && canSeePrivacy(db.users[id], req.user.id, 'groups'))]));
  const chat = {
    id: `${type}_${uid().slice(0, 8)}`, type, title: title.trim(), description: description.trim(),
    avatar, color: '#45c4cc', isPublic: !!isPublic, inviteCode: crypto.randomBytes(5).toString('hex'),
    ownerId: req.user.id, admins: [req.user.id], members, pinnedMessageId: null,
    mutedBy: [], archivedBy: [], pinnedBy: [], unreadCounts: {},
    messages: [{ id: uid(), senderId: req.user.id, type: 'system', text: `${type === 'channel' ? 'Канал' : 'Группа'} «${title.trim()}» создан(а)`, reactions: {}, readBy: [req.user.id], views: 1, createdAt: Date.now() }]
  };
  db.chats[chat.id] = chat;
  saveDB();
  pushToChat(chat, 'chat:new', formatChatForUser(chat, req.user.id), req.user.id);
  res.json({ chat: formatChatForUser(chat, req.user.id) });
});

app.post('/api/chats/:id/join', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id] || Object.values(db.chats).find(c => c.inviteCode === req.params.id);
  if (!chat || (!chat.isPublic && chat.inviteCode !== req.body.inviteCode)) {
    return res.status(404).json({ error: 'Чат недоступен' });
  }
  if (!chat.members.includes(req.user.id)) chat.members.push(req.user.id);
  saveDB();
  res.json({ chat: formatChatForUser(chat, req.user.id) });
});

app.patch('/api/chats/:id/prefs', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id];
  if (!chat || !chat.members.includes(req.user.id)) return res.status(404).json({ error: 'Чат не найден' });
  const { mute, archive, pinChat } = req.body;
  const toggleArr = (arr, val) => val ? (arr.includes(req.user.id) ? arr : [...arr, req.user.id]) : arr.filter(x => x !== req.user.id);
  if (mute !== undefined) chat.mutedBy = toggleArr(chat.mutedBy || [], mute);
  if (archive !== undefined) chat.archivedBy = toggleArr(chat.archivedBy || [], archive);
  if (pinChat !== undefined) chat.pinnedBy = toggleArr(chat.pinnedBy || [], pinChat);
  saveDB();
  res.json({ chat: formatChatForUser(chat, req.user.id) });
});

app.post('/api/chats/:id/read', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id];
  if (!chat || !chat.members.includes(req.user.id)) return res.status(404).json({ error: 'Не найден' });
  chat.unreadCounts[req.user.id] = 0;
  for (const m of chat.messages) {
    if (!m.readBy.includes(req.user.id)) { m.readBy.push(req.user.id); m.views = (m.views || 0) + 1; }
  }
  saveDB();
  pushToChat(chat, 'message:read', { chatId: chat.id, userId: req.user.id }, req.user.id);
  res.json({ ok: true });
});

app.post('/api/chats/:id/messages', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id];
  if (!chat || !chat.members.includes(req.user.id)) return res.status(404).json({ error: 'Чат не найден' });
  if (chat.type === 'channel' && !chat.admins.includes(req.user.id)) return res.status(403).json({ error: 'Писать в канал могут только админы' });

  const { type = 'text', text = '', mediaUrl = null, fileName = null, duration = null, replyToId = null, forwardedFrom = null } = req.body;
  const msg = {
    id: uid(), senderId: req.user.id, type, text: String(text), mediaUrl, fileName, duration,
    replyToId, forwardedFrom, edited: false, deletedFor: [], deletedForAll: false,
    reactions: {}, readBy: [req.user.id], views: 1, createdAt: Date.now()
  };
  chat.messages.push(msg);
  for (const mid of chat.members) {
    if (mid !== req.user.id) chat.unreadCounts[mid] = (chat.unreadCounts[mid] || 0) + 1;
  }
  saveDB();
  pushToChat(chat, 'message:new', { chatId: chat.id, message: msg });
  res.json({ message: msg });
});

app.patch('/api/chats/:id/messages/:mid', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id];
  const msg = chat?.messages.find(m => m.id === req.params.mid);
  if (!msg || msg.senderId !== req.user.id) return res.status(403).json({ error: 'Нельзя редактировать' });
  msg.text = String(req.body.text || '');
  msg.edited = true;
  saveDB();
  pushToChat(chat, 'message:edit', { chatId: chat.id, message: msg });
  res.json({ message: msg });
});

app.delete('/api/chats/:id/messages/:mid', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id];
  const msg = chat?.messages.find(m => m.id === req.params.mid);
  if (!msg || !chat.members.includes(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  const forAll = !!req.body.forAll && (msg.senderId === req.user.id || chat.admins.includes(req.user.id));
  if (forAll) msg.deletedForAll = true;
  else { msg.deletedFor = msg.deletedFor || []; msg.deletedFor.push(req.user.id); }
  saveDB();
  if (forAll) pushToChat(chat, 'message:delete', { chatId: chat.id, msgId: msg.id, forAll: true });
  res.json({ ok: true });
});

app.post('/api/chats/:id/messages/:mid/react', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id];
  const msg = chat?.messages.find(m => m.id === req.params.mid);
  if (!msg || !chat.members.includes(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  const emoji = String(req.body.emoji || '❤️');
  msg.reactions[emoji] = msg.reactions[emoji] || [];
  if (msg.reactions[emoji].includes(req.user.id)) {
    msg.reactions[emoji] = msg.reactions[emoji].filter(id => id !== req.user.id);
    if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
  } else {
    msg.reactions[emoji].push(req.user.id);
  }
  saveDB();
  pushToChat(chat, 'message:react', { chatId: chat.id, msgId: msg.id, reactions: msg.reactions });
  res.json({ reactions: msg.reactions });
});

app.post('/api/chats/:id/pin', requireAuth, (req, res) => {
  const chat = db.chats[req.params.id];
  if (!chat || !chat.members.includes(req.user.id)) return res.status(404).json({ error: 'Не найдено' });
  chat.pinnedMessageId = req.body.msgId || null;
  saveDB();
  pushToChat(chat, 'chat:pin', { chatId: chat.id, pinnedMessageId: chat.pinnedMessageId });
  res.json({ pinnedMessageId: chat.pinnedMessageId });
});

// ==================== ИСТОРИИ (STORIES) ====================
app.get('/api/stories', requireAuth, (req, res) => {
  const now = Date.now();
  const active = db.stories
    .filter(s => s.expiresAt > now || s.savedToProfile)
    .map(s => {
      const author = db.users[s.userId];
      return { ...s, authorName: author ? `${author.firstName} ${author.lastName}`.trim() : 'User', authorAvatar: author?.avatar || null };
    });
  res.json({ stories: active });
});

app.post('/api/stories', requireAuth, (req, res) => {
  const { type = 'text', text = '', mediaUrl = null, privacy = 'everybody', savedToProfile = false } = req.body;
  const story = {
    id: uid(), userId: req.user.id, type, text: String(text), mediaUrl, privacy, savedToProfile: !!savedToProfile,
    viewers: [req.user.id], reactions: {}, createdAt: Date.now(), expiresAt: Date.now() + 24 * 3600 * 1000
  };
  db.stories.unshift(story);
  saveDB();
  res.json({ story });
});

app.post('/api/stories/:id/view', requireAuth, (req, res) => {
  const s = db.stories.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Не найдено' });
  if (!s.viewers.includes(req.user.id)) s.viewers.push(req.user.id);
  saveDB();
  res.json({ viewers: s.viewers.length });
});

// ==================== ПОДАРКИ, NFT, МАРКЕТ И ЗВОНКИ ====================
app.get('/api/catalog', requireAuth, (req, res) => {
  const market = Object.values(db.gifts).filter(g => g.forSale);
  res.json({ regular: REGULAR_GIFTS, nft: NFT_GIFTS, market });
});

app.post('/api/gifts/buy', requireAuth, (req, res) => {
  const { kind, idOrSlug, targetChatId = null } = req.body;
  const tpl = kind === 'nft' ? NFT_GIFTS.find(x => x.slug === idOrSlug) : REGULAR_GIFTS.find(x => x.id === idOrSlug);
  if (!tpl) return res.status(404).json({ error: 'Подарок не найден' });
  if (req.user.stars < tpl.stars) return res.status(400).json({ error: 'Недостаточно звёзд ★' });

  req.user.stars -= tpl.stars;
  req.user.starHistory.unshift({ title: `Покупка: ${tpl.name}`, amount: `-${tpl.stars} ★`, at: Date.now() });

  const gift = {
    uid: uid(), ownerId: req.user.id, isNft: kind === 'nft', slug: tpl.slug || null, regularId: tpl.id || null,
    name: tpl.name, num: kind === 'nft' ? Math.floor(1 + Math.random() * 15000) : null,
    sampleId: tpl.sampleId || null, emoji: tpl.emoji,
    model: kind === 'nft' ? NFT_MODELS[Math.floor(Math.random() * NFT_MODELS.length)] : null,
    pattern: kind === 'nft' ? NFT_PATTERNS[Math.floor(Math.random() * NFT_PATTERNS.length)] : null,
    bg: tpl.bg, rarity: kind === 'nft' ? `${(Math.random() * 2.5 + 0.2).toFixed(1)}%` : null,
    pinned: false, forSale: false, salePrice: tpl.stars, createdAt: Date.now()
  };

  if (targetChatId && db.chats[targetChatId]?.members.includes(req.user.id)) {
    const chat = db.chats[targetChatId];
    const peerId = chat.type === 'dm' ? (chat.members.find(x => x !== req.user.id) || req.user.id) : req.user.id;
    gift.ownerId = peerId;
    db.gifts[gift.uid] = gift;
    const msg = { id: uid(), senderId: req.user.id, type: 'gift', text: '', giftSnapshot: gift, reactions: {}, readBy: [req.user.id], views: 1, createdAt: Date.now() };
    chat.messages.push(msg);
    saveDB();
    pushToChat(chat, 'message:new', { chatId: chat.id, message: msg });
    return res.json({ stars: req.user.stars, gift, message: msg });
  }

  db.gifts[gift.uid] = gift;
  saveDB();
  res.json({ stars: req.user.stars, gift });
});

app.post('/api/gifts/:uid/pin', requireAuth, (req, res) => {
  const g = db.gifts[req.params.uid];
  if (!g || g.ownerId !== req.user.id) return res.status(403).json({ error: 'Не ваш подарок' });
  g.pinned = !g.pinned;
  saveDB();
  res.json({ gift: g });
});

app.post('/api/gifts/:uid/sale', requireAuth, (req, res) => {
  const g = db.gifts[req.params.uid];
  if (!g || g.ownerId !== req.user.id) return res.status(403).json({ error: 'Не ваш подарок' });
  g.forSale = !g.forSale;
  if (g.forSale && req.body.price > 0) g.salePrice = parseInt(req.body.price, 10);
  saveDB();
  res.json({ gift: g });
});

app.post('/api/gifts/:uid/buy-market', requireAuth, (req, res) => {
  const g = db.gifts[req.params.uid];
  if (!g || !g.forSale || g.ownerId === req.user.id) return res.status(400).json({ error: 'Лот недоступен' });
  if (req.user.stars < g.salePrice) return res.status(400).json({ error: 'Недостаточно звёзд ★' });
  const seller = db.users[g.ownerId];
  req.user.stars -= g.salePrice;
  req.user.starHistory.unshift({ title: `Покупка с маркета: ${g.name}`, amount: `-${g.salePrice} ★`, at: Date.now() });
  if (seller) {
    seller.stars += g.salePrice;
    seller.starHistory.unshift({ title: `Продажа: ${g.name}`, amount: `+${g.salePrice} ★`, at: Date.now() });
  }
  g.ownerId = req.user.id; g.forSale = false; g.pinned = false;
  saveDB();
  res.json({ gift: g, stars: req.user.stars });
});

app.post('/api/gifts/:uid/send', requireAuth, (req, res) => {
  const g = db.gifts[req.params.uid];
  const chat = db.chats[req.body.chatId];
  if (!g || g.ownerId !== req.user.id || !chat || !chat.members.includes(req.user.id)) return res.status(400).json({ error: 'Ошибка отправки' });
  const newOwner = chat.type === 'dm' ? (chat.members.find(x => x !== req.user.id) || req.user.id) : req.user.id;
  g.ownerId = newOwner; g.pinned = false; g.forSale = false;
  const msg = { id: uid(), senderId: req.user.id, type: 'gift', text: '', giftSnapshot: g, reactions: {}, readBy: [req.user.id], views: 1, createdAt: Date.now() };
  chat.messages.push(msg);
  saveDB();
  pushToChat(chat, 'message:new', { chatId: chat.id, message: msg });
  res.json({ message: msg });
});

app.get('/api/calls', requireAuth, (req, res) => {
  const list = db.calls.filter(c => c.fromId === req.user.id || c.toId === req.user.id).slice(0, 30);
  res.json({ calls: list });
});

app.post('/api/calls', requireAuth, (req, res) => {
  const call = { id: uid(), fromId: req.user.id, toId: req.body.toId, peerName: req.body.peerName, type: req.body.type || 'voice', duration: req.body.duration || '0:00', createdAt: Date.now() };
  db.calls.unshift(call);
  saveDB();
  res.json({ call });
});

// ==================== АДМИН-ПАНЕЛЬ (СТРОГО НА СЕРВЕРЕ) ====================
app.get('/api/admin/overview', requireAuth, requireAdmin, (req, res) => {
  const users = Object.values(db.users).map(u => ({
    id: u.id, phone: u.phone, firstName: u.firstName, lastName: u.lastName, username: u.username,
    stars: u.stars, ton: u.ton, verified: u.verified, premium: u.premium, banned: u.banned, role: u.role
  }));
  res.json({ users, totalChats: Object.keys(db.chats).length, totalGifts: Object.keys(db.gifts).length, audit: db.adminAudit.slice(0, 30) });
});

app.post('/api/admin/grant', requireAuth, requireAdmin, (req, res) => {
  const { targetUserId, action, amount, giftKind, giftKey, giftNum } = req.body;
  const target = db.users[targetUserId];
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  if (action === 'stars') {
    const amt = parseInt(amount, 10) || 0;
    target.stars += amt;
    target.starHistory.unshift({ title: 'Начисление системой', amount: `+${amt} ★`, at: Date.now() });
  } else if (action === 'ton') {
    target.ton = (target.ton || 0) + (parseFloat(amount) || 0);
  } else if (action === 'verified') {
    target.verified = !target.verified;
  } else if (action === 'premium') {
    target.premium = !target.premium;
  } else if (action === 'ban') {
    if (target.role === 'admin') return res.status(400).json({ error: 'Нельзя заблокировать администратора' });
    target.banned = !target.banned;
  } else if (action === 'gift') {
    const tpl = giftKind === 'nft' ? NFT_GIFTS.find(x => x.slug === giftKey) : REGULAR_GIFTS.find(x => x.id === giftKey);
    if (!tpl) return res.status(404).json({ error: 'Подарок не найден' });
    const g = {
      uid: uid(), ownerId: target.id, isNft: giftKind === 'nft', slug: tpl.slug || null, regularId: tpl.id || null,
      name: tpl.name, num: giftKind === 'nft' ? (parseInt(giftNum, 10) || 1) : null, sampleId: tpl.sampleId || null,
      emoji: tpl.emoji, model: 'Spectrum', pattern: 'Crown', bg: tpl.bg, rarity: '0.1%',
      pinned: false, forSale: false, salePrice: tpl.stars, createdAt: Date.now()
    };
    db.gifts[g.uid] = g;
  }

  db.adminAudit.unshift({ id: uid(), adminId: req.user.id, action, targetUserId: target.id, details: `${action} -> ${target.firstName}`, createdAt: Date.now() });
  saveDB();
  pushToUser(target.id, 'user:update', sanitizeSelf(target));
  res.json({ ok: true, target: sanitizeSelf(target) });
});

app.post('/api/admin/broadcast', requireAuth, requireAdmin, (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
  for (const chat of Object.values(db.chats)) {
    const msg = { id: uid(), senderId: req.user.id, type: 'text', text, reactions: {}, readBy: [req.user.id], views: 1, createdAt: Date.now() };
    chat.messages.push(msg);
    pushToChat(chat, 'message:new', { chatId: chat.id, message: msg });
  }
  db.adminAudit.unshift({ id: uid(), adminId: req.user.id, action: 'broadcast', details: text.slice(0, 60), createdAt: Date.now() });
  saveDB();
  res.json({ ok: true });
});

server.listen(PORT, () => console.log(`CW-Gram server running on http://localhost:${PORT}`));