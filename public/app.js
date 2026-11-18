let token = localStorage.getItem('cw_token') || null;
let currentUser = null, chats = [], contacts = [], blockedUsers = [], stories = [];
let catalog = { regular: [], nft: [], market: [] }, myGifts = [], ws = null;
let regAva = null, editAva = null, activeTab = 'chats', activeFolder = 'all', activeChatId = null;
let replyToId = null, selectedMsgIds = new Set(), typingTimer = null;
let mediaRecorder = null, recordedChunks = [], callTimer = null, callPeerId = null, callMuted = false, storyTimer = null;

const STICKERS = ['🔥','❤️','😂','😍','😎','🥳','🤯','🥶','😭','🙏','👍','👎','⚡','💎','🚀','🎁','👑','💀','🐸','😈','🫡','👀','🤝','💯'];
const REACTS = ['👍','❤️','🔥','😂','⚡','🎉'];
const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtTime = ts => { if (!ts) return ''; const d = new Date(ts); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
const fmtLast = u => !u ? '' : u.online ? 'в сети' : u.lastSeen ? 'был(а) в ' + fmtTime(u.lastSeen) : 'был(а) недавно';

function showToast(m) {
  const t = $('toast'); t.textContent = m; t.classList.remove('hidden');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.add('hidden'), 2400);
}
function openModal(h) { $('m-sheet').innerHTML = h; $('m-bg').classList.remove('hidden'); }
function closeModal() { $('m-bg').classList.add('hidden'); }

async function api(method, url, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && token) logout(true); throw new Error(d.error || 'Ошибка сервера'); }
  return d;
}

function uploadAvatarFile(inp, prevId, phId, cb) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'), max = 360;
      let w = img.width, h = img.height;
      if (w > h && w > max) { h *= max / w; w = max; } else if (h > max) { w *= max / h; h = max; }
      c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      const url = c.toDataURL('image/jpeg', 0.8);
      if (prevId) { const el = $(prevId); el.src = url; el.classList.remove('hidden'); }
      if (phId) $(phId).classList.add('hidden');
      cb(url);
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(f);
}

// ==================== АВТОРИЗАЦИЯ И WEBSOCKET ====================
function setAuthMode(m) {
  $('tab-login').classList.toggle('active', m === 'login');
  $('tab-reg').classList.toggle('active', m === 'reg');
  $('form-login').classList.toggle('hidden', m !== 'login');
  $('form-reg').classList.toggle('hidden', m !== 'reg');
}

async function handleLogin() {
  try {
    const res = await api('POST', '/api/auth/login', { phone: $('l-phone').value, password: $('l-pass').value, cloudPassword: $('l-cloud').value });
    token = res.token; localStorage.setItem('cw_token', token); currentUser = res.user; await bootApp();
  } catch (e) { showToast(e.message); }
}

async function handleRegister() {
  try {
    const res = await api('POST', '/api/auth/register', {
      phone: $('r-phone').value, firstName: $('r-first').value, lastName: $('r-last').value,
      username: $('r-user').value, bio: $('r-bio').value, avatar: regAva,
      password: $('r-pass').value, cloudPassword: $('r-cloud').value
    });
    token = res.token; localStorage.setItem('cw_token', token); currentUser = res.user; regAva = null; await bootApp();
  } catch (e) { showToast(e.message); }
}

function logout(silent = false) {
  if (!silent && token) api('POST', '/api/auth/logout').catch(() => {});
  token = null; currentUser = null; localStorage.removeItem('cw_token');
  if (ws) { ws.close(); ws = null; }
  $('app-shell').classList.add('hidden'); $('auth-screen').classList.remove('hidden');
}

function connectWS() {
  if (ws) ws.close();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}?token=${encodeURIComponent(token)}`);
  ws.onopen = () => $('ws-status').classList.add('online');
  ws.onclose = () => { $('ws-status').classList.remove('online'); if (token) setTimeout(connectWS, 3000); };
  ws.onmessage = ev => {
    try {
      const { event, payload } = JSON.parse(ev.data);
      if (event === 'message:new') {
        const c = chats.find(x => x.id === payload.chatId);
        if (!c) return refreshAllData();
        if (!c.messages.some(m => m.id === payload.message.id)) c.messages.push(payload.message);
        if (activeChatId === payload.chatId) { renderMessages(); api('POST', `/api/chats/${payload.chatId}/read`).catch(() => {}); }
        else if (payload.message.senderId !== currentUser.id) { c.unread = (c.unread || 0) + 1; if (currentUser.settings?.notifications !== false) showToast(`${c.title}: ${payload.message.text || 'Медиа'}`); }
        renderChats();
      } else if (event === 'message:edit') {
        const m = chats.find(x => x.id === payload.chatId)?.messages.find(m => m.id === payload.message.id);
        if (m) { m.text = payload.message.text; m.edited = true; if (activeChatId === payload.chatId) renderMessages(); renderChats(); }
      } else if (event === 'message:delete' && payload.forAll) {
        const c = chats.find(x => x.id === payload.chatId);
        if (c) { c.messages = c.messages.filter(m => m.id !== payload.msgId); if (activeChatId === payload.chatId) renderMessages(); renderChats(); }
      } else if (event === 'message:react') {
        const m = chats.find(x => x.id === payload.chatId)?.messages.find(m => m.id === payload.msgId);
        if (m) { m.reactions = payload.reactions; if (activeChatId === payload.chatId) renderMessages(); }
      } else if (event === 'message:read') {
        const c = chats.find(x => x.id === payload.chatId);
        if (c) { c.messages.forEach(m => { if (!m.readBy.includes(payload.userId)) m.readBy.push(payload.userId); }); if (activeChatId === payload.chatId) renderMessages(); }
      } else if (event === 'chat:pin') {
        const c = chats.find(x => x.id === payload.chatId);
        if (c) { c.pinnedMessageId = payload.pinnedMessageId; if (activeChatId === payload.chatId) renderPinnedBar(c); }
      } else if (event === 'chat:new') { chats.unshift(payload); renderChats(); }
      else if (event === 'typing' && activeChatId === payload.chatId) {
        const c = chats.find(x => x.id === payload.chatId);
        $('r-sub').textContent = payload.isTyping ? 'печатает...' : (c.type === 'dm' ? fmtLast(c.peer) : `${c.members.length} участн.`);
      } else if (event === 'presence') {
        chats.forEach(c => { if (c.peer?.id === payload.userId) { c.peer.online = payload.online; c.peer.lastSeen = payload.lastSeen; } });
        contacts.forEach(u => { if (u.id === payload.userId) { u.online = payload.online; u.lastSeen = payload.lastSeen; } });
        renderContacts();
      } else if (event === 'user:update') { currentUser = payload; applySettings(); refreshAllData(); }
      else if (event === 'call:signal') onWsCall(payload);
    } catch {}
  };
}

async function bootApp() {
  $('auth-screen').classList.add('hidden'); $('app-shell').classList.remove('hidden'); $('chats-skeleton').classList.remove('hidden');
  connectWS(); await refreshAllData(); $('chats-skeleton').classList.add('hidden');
}

async function refreshAllData() {
  const [meR, chR, coR, stR, catR] = await Promise.all([api('GET','/api/auth/me'), api('GET','/api/chats'), api('GET','/api/contacts'), api('GET','/api/stories'), api('GET','/api/catalog')]);
  currentUser = meR.user; chats = chR.chats; contacts = coR.contacts; blockedUsers = coR.blocked; stories = stR.stories; catalog = catR;
  const uR = await api('GET', `/api/users/${currentUser.id}`);
  myGifts = uR.user.gifts || [];
  applySettings(); renderAll();
}

function applySettings() {
  if (!currentUser) return;
  const s = currentUser.settings || {};
  document.body.classList.toggle('light', s.theme === 'light');
  document.documentElement.style.setProperty('--msg-fs', (s.fontSize || 15) + 'px');
  $('theme-sub').textContent = `${s.theme === 'light' ? 'Светлая' : 'Тёмная'} • ${s.fontSize || 15}px`;
  $('notif-sub').textContent = s.notifications !== false ? 'Включены' : 'Выключены';
  $('dl-sub').textContent = `Автозагрузка: ${s.autoDownload !== false ? 'Вкл' : 'Выкл'}`;
}

function renderAll() {
  if (!currentUser) return;
  $('nav-ava').innerHTML = currentUser.avatar ? `<img src="${esc(currentUser.avatar)}">` : esc((currentUser.firstName[0] || 'C').toUpperCase());
  const tot = chats.filter(c => !c.archived).reduce((s, c) => s + (c.unread || 0), 0);
  $('nav-unread-badge').textContent = tot; $('nav-unread-badge').classList.toggle('hidden', tot === 0);
  renderStories(); renderChats(); renderContacts(); renderSettings(); renderProfile();
}

function switchTab(t) {
  activeTab = t;
  ['chats', 'contacts', 'settings', 'profile'].forEach(x => { $('view-' + x).classList.toggle('hidden', x !== t); $('nav-' + x).classList.toggle('active', x === t); });
}

function giftImgHtml(g, sz = 56) {
  if (g.isNft && g.slug) return `<img src="https://nft.fragment.com/gift/${esc(g.slug)}-${g.sampleId || 1}.medium.jpg" style="width:${sz}px;height:${sz}px;object-fit:contain;border-radius:10px;position:relative;z-index:2;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div style="display:none;width:${sz}px;height:${sz}px;align-items:center;justify-content:center;font-size:${Math.round(sz*0.65)}px;position:relative;z-index:2;">${esc(g.emoji||'🎁')}</div>`;
  return `<div style="width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(sz*0.7)}px;position:relative;z-index:2;">${esc(g.emoji||'🎁')}</div>`;
}

// ==================== ИСТОРИИ ====================
function renderStories() {
  const ava = currentUser.avatar ? `<img src="${esc(currentUser.avatar)}">` : esc(currentUser.firstName[0]);
  $('stories-strip').innerHTML = `<div class="st-node" onclick="openCreateStoryModal()"><div class="st-ring"><div class="st-core">${ava}</div></div><div class="st-txt">+ История</div></div>` +
    stories.map((s, i) => `<div class="st-node" onclick="openStoryViewer(${i})"><div class="st-ring ${(s.viewers||[]).includes(currentUser.id)?'seen':''}"><div class="st-core">${s.authorAvatar ? `<img src="${esc(s.authorAvatar)}">` : esc((s.authorName||'U')[0])}</div></div><div class="st-txt">${esc(s.authorName)}</div></div>`).join('');
}
function openCreateStoryModal() {
  openModal(`<h3 style="margin-bottom:12px;">Новая история</h3><div class="fg"><input id="st-txt" class="tf" placeholder="Текст истории"/><select id="st-priv" class="tf"><option value="everybody">Видят все</option><option value="contacts">Контакты</option></select></div><input id="st-file" type="file" accept="image/*,video/*" class="hidden" onchange="publishMediaStory(this)"/><label style="display:flex;gap:8px;margin-bottom:12px;font-size:13.5px;"><input type="checkbox" id="st-save" checked/> Сохранить в профиле</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><button class="btn2" onclick="$('st-file').click()">📷 Фото/Видео</button><button class="btn1" onclick="publishTextStory()">Опубликовать</button></div>`);
}
async function publishTextStory() {
  const text = $('st-txt').value.trim(); if (!text) return showToast('Введите текст');
  await api('POST', '/api/stories', { type: 'text', text, privacy: $('st-priv').value, savedToProfile: $('st-save').checked });
  closeModal(); await refreshAllData(); showToast('История опубликована');
}
function publishMediaStory(inp) {
  const f = inp.files[0]; if (!f) return; const r = new FileReader();
  r.onload = async e => {
    const up = await api('POST', '/api/upload', { dataUrl: e.target.result, fileName: f.name });
    await api('POST', '/api/stories', { type: f.type.startsWith('video') ? 'video' : 'photo', text: $('st-txt').value.trim(), mediaUrl: up.url, privacy: $('st-priv').value, savedToProfile: $('st-save').checked });
    closeModal(); await refreshAllData(); showToast('История опубликована');
  };
  r.readAsDataURL(f);
}
function openStoryViewer(i) {
  const s = stories[i]; if (!s) return;
  api('POST', `/api/stories/${s.id}/view`).catch(() => {});
  if (!s.viewers.includes(currentUser.id)) s.viewers.push(currentUser.id);
  renderStories();
  $('sv-ava').innerHTML = s.authorAvatar ? `<img src="${esc(s.authorAvatar)}">` : esc((s.authorName||'U')[0]);
  $('sv-author').textContent = s.authorName; $('sv-time').textContent = fmtTime(s.createdAt);
  $('sv-media').innerHTML = s.type === 'photo' && s.mediaUrl ? `<div><img src="${esc(s.mediaUrl)}"><p style="margin-top:10px;font-size:15px;">${esc(s.text)}</p></div>` : s.type === 'video' && s.mediaUrl ? `<video src="${esc(s.mediaUrl)}" controls autoplay></video>` : `<div style="padding:28px;border-radius:20px;background:linear-gradient(135deg,#173c42,#0d1b2a);">${esc(s.text)}</div>`;
  $('sv-footer').innerHTML = `<span class="muted" style="font-size:13px;">👁️ ${s.viewers.length}</span><span style="flex:1"></span><button class="btn2" style="width:auto;padding:8px 14px;" onclick="closeStoryViewer()">Закрыть</button>`;
  $('story-viewer').classList.remove('hidden');
  let p = 0; $('sv-progress').style.width = '0%'; clearInterval(storyTimer);
  storyTimer = setInterval(() => { p += 2; $('sv-progress').style.width = p + '%'; if (p >= 100) closeStoryViewer(); }, 100);
}
function closeStoryViewer() { clearInterval(storyTimer); $('story-viewer').classList.add('hidden'); }

// ==================== ЧАТЫ И ПЕРЕПИСКА ====================
function setFolder(f, el) { activeFolder = f; document.querySelectorAll('.folder').forEach(x => x.classList.remove('active')); el.classList.add('active'); renderChats(); }
function renderChats() {
  const list = chats.filter(c => activeFolder === 'archived' ? c.archived : (!c.archived && (activeFolder === 'all' || c.type === activeFolder))).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  $('chats-list').innerHTML = list.length ? list.map(c => {
    const last = c.messages[c.messages.length - 1];
    const sub = last ? (last.type === 'gift' ? `🎁 ${last.giftSnapshot?.name}` : last.type === 'photo' ? '📷 Фото' : last.type === 'video' ? '🎬 Видео' : last.type === 'voice' ? '🎤 Голосовое' : last.type === 'file' ? `📎 ${last.fileName}` : last.text) : 'Нет сообщений';
    const ava = c.type === 'saved' ? '🔖' : (c.avatar ? `<img src="${esc(c.avatar)}">` : esc((c.title[0] || 'C').toUpperCase()));
    return `<div class="c-row" onclick="openChat('${c.id}')"><div class="ava" style="background:${c.color||'#45c4cc'}">${ava}${c.peer?.online?'<span class="online-dot"></span>':''}</div><div class="c-mid"><div class="c-r1"><div class="c-title">${esc(c.title)} ${c.peer?.verified?'<span class="v-badge">✔</span>':''} ${c.muted?'🔇':''}</div><div class="c-time">${last&&last.senderId===currentUser.id?`<span style="color:var(--cyan)">${last.readBy?.length>1?'✓✓':'✓'}</span>`:''} ${last?fmtTime(last.createdAt):''} ${c.pinned?'📌':''}</div></div><div class="c-r1" style="margin:0;"><div class="c-sub">${esc(sub)}</div>${c.unread?`<span class="badge-cnt">${c.unread}</span>`:''}</div></div></div>`;
  }).join('') : `<div style="text-align:center;color:var(--muted);padding:44px 20px;font-size:14px;">Чатов пока нет</div>`;
}
function openChatsMenu() { openModal(`<h3 style="margin-bottom:12px;">Меню</h3><button class="btn2" style="margin-bottom:8px;" onclick="closeModal();openNewChatModal()">Создать группу / канал</button><button class="btn2" onclick="closeModal();joinByCodePrompt()">Войти по коду</button>`); }
function openNewChatModal() {
  const mem = contacts.map(u => `<label style="display:flex;gap:8px;padding:5px 0;"><input type="checkbox" class="nc-m" value="${u.id}"> ${esc(u.firstName)} ${esc(u.lastName)}</label>`).join('');
  openModal(`<h3 style="margin-bottom:12px;">Создать группу / канал</h3><div class="fg"><select id="nc-t" class="tf"><option value="group">Группа</option><option value="channel">Канал</option></select><input id="nc-n" class="tf" placeholder="Название *"/><input id="nc-d" class="tf" placeholder="Описание"/><select id="nc-p" class="tf"><option value="true">Публичный</option><option value="false">Приватный</option></select></div>${mem?`<div style="max-height:120px;overflow-y:auto;margin-bottom:10px;">${mem}</div>`:''}<button class="btn1" onclick="createChatGroup()">Создать</button>`);
}
async function createChatGroup() {
  try {
    const res = await api('POST', '/api/chats/create', { type: $('nc-t').value, title: $('nc-n').value, description: $('nc-d').value, isPublic: $('nc-p').value === 'true', memberIds: Array.from(document.querySelectorAll('.nc-m:checked')).map(x => x.value) });
    chats.unshift(res.chat); closeModal(); renderChats(); openChat(res.chat.id);
  } catch (e) { showToast(e.message); }
}
function joinByCodePrompt() { openModal(`<h3 style="margin-bottom:12px;">Код приглашения</h3><div class="fg"><input id="jc-i" class="tf" placeholder="ID или код"/></div><button class="btn1" onclick="doJoin()">Вступить</button>`); }
async function doJoin() { try { const r = await api('POST', `/api/chats/${encodeURIComponent($('jc-i').value.trim())}/join`, { inviteCode: $('jc-i').value.trim() }); await refreshAllData(); closeModal(); openChat(r.chat.id); } catch (e) { showToast(e.message); } }

function openChat(id) {
  activeChatId = id; const c = chats.find(x => x.id === id); if (!c) return;
  c.unread = 0; api('POST', `/api/chats/${id}/read`).catch(() => {}); renderAll();
  $('r-name').textContent = c.title; $('r-sub').textContent = c.type === 'saved' ? 'облачное хранилище' : c.type === 'dm' ? fmtLast(c.peer) : `${c.members.length} участн.`;
  $('r-ava').style.background = c.color || '#45c4cc'; $('r-ava').innerHTML = c.type === 'saved' ? '🔖' : (c.avatar ? `<img src="${esc(c.avatar)}">` : esc((c.title[0] || 'C').toUpperCase()));
  clearSelection(); cancelReply(); closeChatSearch(); renderPinnedBar(c); $('chat-room').classList.remove('hidden'); renderMessages();
}
function closeChat() { $('chat-room').classList.add('hidden'); $('sticker-tray').classList.add('hidden'); activeChatId = null; }
function renderPinnedBar(c) { const pm = c.pinnedMessageId ? c.messages.find(m => m.id === c.pinnedMessageId) : null; $('r-pinned-bar').classList.toggle('hidden', !pm); if (pm) $('r-pinned-txt').textContent = pm.text || 'Медиа'; }
async function unpinChatMsg() { await api('POST', `/api/chats/${activeChatId}/pin`, { msgId: null }); const c = chats.find(x => x.id === activeChatId); c.pinnedMessageId = null; renderPinnedBar(c); }
function scrollToPinned() { const c = chats.find(x => x.id === activeChatId); $('msg_' + c?.pinnedMessageId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function renderMessages() {
  const c = chats.find(x => x.id === activeChatId); if (!c) return;
  const q = ($('r-search-inp').value || '').toLowerCase();
  const list = q ? c.messages.filter(m => (m.text || '').toLowerCase().includes(q)) : c.messages;
  const wrap = $('msgs-list');
  wrap.innerHTML = list.map(m => {
    if (m.type === 'system') return `<div class="msg sys">${esc(m.text)}</div>`;
    const isOut = m.senderId === currentUser.id, rep = m.replyToId ? c.messages.find(x => x.id === m.replyToId) : null;
    const reacts = Object.entries(m.reactions || {}).map(([em, ids]) => `<span class="r-tag" onclick="event.stopPropagation();reactMsg('${m.id}','${em}')">${em} ${ids.length}</span>`).join('');
    let b = '';
    if (m.forwardedFrom) b += `<div class="muted" style="font-size:11px;margin-bottom:2px;">↪ от ${esc(m.forwardedFrom)}</div>`;
    if (rep) b += `<div class="r-box">${esc(rep.text || 'Медиа')}</div>`;
    if (m.type === 'photo' && m.mediaUrl) b += `<img class="m-img" src="${esc(m.mediaUrl)}">`;
    if (m.type === 'video' && m.mediaUrl) b += `<video class="m-video" src="${esc(m.mediaUrl)}" controls></video>`;
    if (m.type === 'voice' && m.mediaUrl) b += `<audio controls src="${esc(m.mediaUrl)}" style="max-width:210px;height:34px;"></audio>`;
    if (m.type === 'file' && m.mediaUrl) b += `<a href="${esc(m.mediaUrl)}" download="${esc(m.fileName||'file')}" style="color:var(--cyan);font-weight:600;display:block;margin-bottom:4px;">📎 ${esc(m.fileName||'Файл')}</a>`;
    if (m.type === 'gift' && m.giftSnapshot) { const g = m.giftSnapshot; b += `<div style="padding:10px;border-radius:12px;background:linear-gradient(135deg,${g.bg[0]},${g.bg[1]});text-align:center;margin-bottom:4px;"><div style="display:flex;justify-content:center;margin-bottom:4px;">${giftImgHtml(g,60)}</div><div style="font-weight:700;color:#fff;font-size:13px;">${esc(g.name)} ${g.isNft?'#'+g.num:''}</div></div>`; }
    if (m.text) b += `<span>${esc(m.text).replace(/@(\w+)/g, '<span style="color:var(--cyan);font-weight:600;">@$1</span>')}</span>`;
    return `<div id="msg_${m.id}" class="msg ${isOut?'out':'in'} ${selectedMsgIds.has(m.id)?'selected':''}" onclick="onMsgClick('${m.id}')">${b}<span class="m-meta">${c.type==='channel'?`👁️ ${m.views||1} `:''}${m.edited?'изм. ':''}${fmtTime(m.createdAt)} ${isOut?(m.readBy?.length>1?'✓✓':'✓'):''}</span>${reacts?`<div class="r-row">${reacts}</div>`:''}</div>`;
  }).join('');
  wrap.scrollTop = wrap.scrollHeight;
}

function onMessageInput() {
  const has = $('m-inp').value.trim().length > 0;
  $('btn-voice').classList.toggle('hidden', has); $('btn-send').classList.toggle('hidden', !has);
  if (ws?.readyState === 1 && activeChatId) {
    ws.send(JSON.stringify({ event: 'typing', payload: { chatId: activeChatId, isTyping: has } }));
    clearTimeout(typingTimer); typingTimer = setTimeout(() => ws?.send(JSON.stringify({ event: 'typing', payload: { chatId: activeChatId, isTyping: false } })), 2000);
  }
}
async function sendTextMessage() {
  const text = $('m-inp').value.trim(); if (!text || !activeChatId) return;
  $('m-inp').value = ''; onMessageInput();
  try { await api('POST', `/api/chats/${activeChatId}/messages`, { type: 'text', text, replyToId }); cancelReply(); } catch (e) { showToast(e.message); }
}
function openAttachMenu() { openModal(`<h3 style="margin-bottom:12px;">Прикрепить</h3><button class="btn2" style="margin-bottom:8px;" onclick="closeModal();$('c-media-file').click()">📷 Фото / Видео</button><button class="btn2" onclick="closeModal();$('c-doc-file').click()">📄 Файл</button>`); }
function uploadChatMedia(inp) {
  const f = inp.files[0]; if (!f) return; const r = new FileReader();
  r.onload = async e => { try { const up = await api('POST','/api/upload',{dataUrl:e.target.result,fileName:f.name}); await api('POST',`/api/chats/${activeChatId}/messages`,{type:f.type.startsWith('video')?'video':'photo',mediaUrl:up.url,fileName:f.name,replyToId}); cancelReply(); } catch(err){showToast(err.message);} };
  r.readAsDataURL(f); inp.value = '';
}
function uploadChatDoc(inp) {
  const f = inp.files[0]; if (!f) return; const r = new FileReader();
  r.onload = async e => { try { const up = await api('POST','/api/upload',{dataUrl:e.target.result,fileName:f.name}); await api('POST',`/api/chats/${activeChatId}/messages`,{type:'file',mediaUrl:up.url,fileName:f.name,replyToId}); cancelReply(); } catch(err){showToast(err.message);} };
  r.readAsDataURL(f); inp.value = '';
}
async function toggleVoiceRecord() {
  const btn = $('btn-voice');
  if (mediaRecorder?.state === 'recording') { mediaRecorder.stop(); btn.classList.remove('recording'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream); mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); const fr = new FileReader();
      fr.onload = async ev => { const up = await api('POST', '/api/upload', { dataUrl: ev.target.result, fileName: 'voice.webm' }); await api('POST', `/api/chats/${activeChatId}/messages`, { type: 'voice', mediaUrl: up.url }); };
      fr.readAsDataURL(new Blob(recordedChunks, { type: 'audio/webm' }));
    };
    mediaRecorder.start(); btn.classList.add('recording'); showToast('Запись... Нажмите 🎤 чтобы отправить');
  } catch { showToast('Нет доступа к микрофону'); }
}
function toggleStickers() {
  const tray = $('sticker-tray'); tray.classList.toggle('hidden');
  if (!tray.innerHTML) tray.innerHTML = STICKERS.map(s => `<button class="t-btn" style="font-size:26px;" onclick="api('POST','/api/chats/'+activeChatId+'/messages',{type:'text',text:'${s}'});$('sticker-tray').classList.add('hidden');">${s}</button>`).join('');
}
function onMsgClick(mid) {
  if (selectedMsgIds.size > 0) return toggleSelectMsg(mid);
  const m = chats.find(x => x.id === activeChatId)?.messages.find(x => x.id === mid); if (!m) return;
  const isOut = m.senderId === currentUser.id;
  openModal(`<div style="display:flex;justify-content:space-around;font-size:24px;margin-bottom:14px;">${REACTS.map(r=>`<span style="cursor:pointer" onclick="reactMsg('${mid}','${r}');closeModal();">${r}</span>`).join('')}</div><button class="btn2" style="margin-bottom:6px;" onclick="replyMsg('${mid}')">↩️ Ответить</button><button class="btn2" style="margin-bottom:6px;" onclick="copyMsg('${mid}')">📋 Копировать</button><button class="btn2" style="margin-bottom:6px;" onclick="pinMsg('${mid}')">📌 Закрепить</button><button class="btn2" style="margin-bottom:6px;" onclick="closeModal();toggleSelectMsg('${mid}')">☑️ Выбрать</button>${isOut&&m.text?`<button class="btn2" style="margin-bottom:6px;" onclick="editMsgPrompt('${mid}')">✏️ Изменить</button>`:''}<button class="btn2" style="color:var(--red);margin-bottom:6px;" onclick="delMsg('${mid}',false)">🗑️ Удалить у себя</button>${isOut?`<button class="btn2" style="color:var(--red);" onclick="delMsg('${mid}',true)">🗑️ Удалить у всех</button>`:''}`);
}
async function reactMsg(mid, emoji) { await api('POST', `/api/chats/${activeChatId}/messages/${mid}/react`, { emoji }); }
function replyMsg(mid) { const m = chats.find(x => x.id === activeChatId).messages.find(x => x.id === mid); replyToId = mid; $('r-reply-txt').textContent = m.text || 'Медиа'; $('r-reply-bar').classList.remove('hidden'); closeModal(); }
function cancelReply() { replyToId = null; $('r-reply-bar').classList.add('hidden'); }
function copyMsg(mid) { navigator.clipboard?.writeText(chats.find(x => x.id === activeChatId).messages.find(x => x.id === mid)?.text || ''); closeModal(); showToast('Скопировано'); }
async function pinMsg(mid) { await api('POST', `/api/chats/${activeChatId}/pin`, { msgId: mid }); closeModal(); }
function editMsgPrompt(mid) { const m = chats.find(x => x.id === activeChatId).messages.find(x => x.id === mid); openModal(`<h3 style="margin-bottom:10px;">Редактировать</h3><div class="fg"><input id="em-i" class="tf" value="${esc(m.text)}"/></div><button class="btn1" onclick="saveEditMsg('${mid}')">Сохранить</button>`); }
async function saveEditMsg(mid) { await api('PATCH', `/api/chats/${activeChatId}/messages/${mid}`, { text: $('em-i').value }); closeModal(); }
async function delMsg(mid, forAll) { await api('DELETE', `/api/chats/${activeChatId}/messages/${mid}`, { forAll }); const c = chats.find(x => x.id === activeChatId); c.messages = c.messages.filter(m => m.id !== mid); closeModal(); renderMessages(); renderChats(); }
function toggleSelectMsg(mid) { if (selectedMsgIds.has(mid)) selectedMsgIds.delete(mid); else selectedMsgIds.add(mid); $('r-select-bar').classList.toggle('hidden', selectedMsgIds.size === 0); $('r-select-count').textContent = `Выбрано: ${selectedMsgIds.size}`; renderMessages(); }
function clearSelection() { selectedMsgIds.clear(); $('r-select-bar').classList.add('hidden'); renderMessages(); }
function forwardSelected() { openModal(`<h3 style="margin-bottom:10px;">Переслать в чат</h3>` + chats.map(c => `<div class="c-row" onclick="doForward('${c.id}')"><span>${esc(c.title)}</span></div>`).join('')); }
async function doForward(tid) { const src = chats.find(x => x.id === activeChatId); for (const id of selectedMsgIds) { const m = src.messages.find(x => x.id === id); if (m) await api('POST', `/api/chats/${tid}/messages`, { type: m.type, text: m.text, mediaUrl: m.mediaUrl, fileName: m.fileName, forwardedFrom: src.title }); } clearSelection(); closeModal(); showToast('Переслано'); }
async function deleteSelected() { for (const id of selectedMsgIds) await api('DELETE', `/api/chats/${activeChatId}/messages/${id}`, { forAll: false }); const c = chats.find(x => x.id === activeChatId); c.messages = c.messages.filter(m => !selectedMsgIds.has(m.id)); clearSelection(); renderMessages(); renderChats(); }
function openChatSearch() { $('r-search-bar').classList.remove('hidden'); $('r-search-inp').focus(); }
function closeChatSearch() { $('r-search-bar').classList.add('hidden'); $('r-search-inp').value = ''; renderMessages(); }
function openChatOptions() { const c = chats.find(x => x.id === activeChatId); openModal(`<h3 style="margin-bottom:12px;">Настройки чата</h3><button class="btn2" style="margin-bottom:8px;" onclick="toggleChatPref('pinChat',${!c.pinned})">${c.pinned?'Открепить чат':'📌 Закрепить чат'}</button><button class="btn2" style="margin-bottom:8px;" onclick="toggleChatPref('mute',${!c.muted})">${c.muted?'🔔 Включить звук':'🔇 Без звука'}</button><button class="btn2" onclick="toggleChatPref('archive',${!c.archived})">${c.archived?'📤 Из архива':'📥 В архив'}</button>`); }
async function toggleChatPref(k, v) { const r = await api('PATCH', `/api/chats/${activeChatId}/prefs`, { [k]: v }); const i = chats.findIndex(x => x.id === activeChatId); if (i >= 0) chats[i] = r.chat; closeModal(); renderChats(); showToast('Обновлено'); }
function openActiveChatInfo() { const c = chats.find(x => x.id === activeChatId); if (c.type === 'dm' && c.peer) openPeerProfile(c.peer.id); else openModal(`<h3>${esc(c.title)}</h3><p class="muted" style="margin:6px 0 12px;">${esc(c.description||(c.type==='channel'?'Канал':'Группа'))}</p>${c.inviteCode?`<div class="card-blk" style="margin:0 0 10px;">Код: <b>${esc(c.inviteCode)}</b></div>`:''}${c.members.map(m=>`<div style="padding:6px 0;border-bottom:1px solid var(--div);">${esc(m.name)}</div>`).join('')}`); }

// ==================== КОНТАКТЫ, ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ, ПОИСК ====================
function renderContacts() {
  const q = ($('contacts-search')?.value || '').toLowerCase();
  const list = contacts.filter(u => (`${u.firstName} ${u.lastName} ${u.username} ${u.phone||''}`).toLowerCase().includes(q));
  $('contacts-list').innerHTML = list.length ? list.map(u => `<div class="c-row" onclick="openPeerProfile('${u.id}')"><div class="ava" style="background:${u.color||'#45c4cc'}">${u.avatar?`<img src="${esc(u.avatar)}">`:esc((u.firstName[0]||'U').toUpperCase())}${u.online?'<span class="online-dot"></span>':''}</div><div class="c-mid"><div class="c-title">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified?'<span class="v-badge">✔</span>':''} ${u.premium?'⭐':''}</div><div class="c-sub">${esc(fmtLast(u))}</div></div></div>`).join('') : `<div style="text-align:center;color:var(--muted);padding:38px 20px;font-size:14px;">Контактов пока нет</div>`;
  $('blocked-section').classList.toggle('hidden', blockedUsers.length === 0);
  $('blocked-list').innerHTML = blockedUsers.map(u => `<div class="c-row" onclick="toggleBlockPeer('${u.id}')"><div class="ava" style="background:#555">${esc((u.firstName[0]||'U').toUpperCase())}</div><div class="c-mid"><div class="c-title">${esc(u.firstName)} ${esc(u.lastName)}</div><div class="c-sub" style="color:var(--red);">Нажмите для разблокировки</div></div></div>`).join('');
}
function openAddContactModal() { openModal(`<h3 style="margin-bottom:12px;">Добавить контакт</h3><div class="fg"><input id="ac-q" class="tf" placeholder="Телефон или @username"/></div><button class="btn1" onclick="doAddContact()">Добавить</button>`); }
async function doAddContact() { try { await api('POST','/api/contacts',{query:$('ac-q').value}); closeModal(); await refreshAllData(); showToast('Контакт добавлен'); } catch(e){showToast(e.message);} }

async function openPeerProfile(uid) {
  if (uid === currentUser.id) { closeChat(); switchTab('profile'); return; }
  try {
    const res = await api('GET', `/api/users/${uid}`), u = res.user;
    const pos = ['top:16px;left:12px;','top:2px;left:48px;','bottom:10px;left:22px;','top:2px;right:48px;','top:16px;right:12px;','bottom:10px;right:22px;'];
    const orb = (u.gifts || []).filter(g => g.pinned && g.isNft).slice(0, 6).map((g, i) => `<div class="orb-gift" style="${pos[i]}">${giftImgHtml(g, 24)}</div>`).join('');
    const ava = u.avatar ? `<img src="${esc(u.avatar)}">` : esc((u.firstName[0] || 'U').toUpperCase());
    $('peer-profile-body').innerHTML = `
      <div class="p-hero"><div class="orbit-box">${orb}<div class="orbit-ava" style="background:${u.color||'#45c4cc'}">${ava}</div></div>
        <div style="font-size:21px;font-weight:700;">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified?'<span class="v-badge">✔</span>':''} ${u.premium?'⭐':''}</div>
        <div class="muted" style="font-size:13px;margin-top:3px;">${esc(fmtLast(u))}</div>
      </div>
      <div class="p-actions">
        <button class="p-act" onclick="startDm('${u.id}')"><span>💬</span>Написать</button>
        <button class="p-act" onclick="toggleContactPeer('${u.id}',${res.isContact})"><span>${res.isContact?'✖️':'➕'}</span>${res.isContact?'Удалить':'В контакты'}</button>
        <button class="p-act" onclick="copyTxt('${esc(u.username||u.id)}')"><span>🔗</span>Поделиться</button>
      </div>
      ${res.channel?`<div class="card-blk"><div style="font-size:13px;font-weight:700;color:var(--cyan);margin-bottom:4px;">Канал • ${res.channel.subscribers} подп.</div><div style="font-weight:600;">${esc(res.channel.title)}</div></div>`:''}
      <div class="card-blk">
        ${u.phone?`<div class="info-item" onclick="copyTxt('${esc(u.phone)}')"><div class="info-v">${esc(u.phone)}</div><div class="info-l">Телефон</div></div>`:''}
        ${u.bio?`<div class="info-item"><div class="info-v">${esc(u.bio)}</div><div class="info-l">О себе</div></div>`:''}
        ${u.username?`<div class="info-item" onclick="copyTxt('${esc(u.username)}')"><div class="info-v">${esc(u.username)}</div><div class="info-l">Имя пользователя</div></div>`:''}
        ${u.birthday?`<div class="info-item"><div class="info-v">${esc(u.birthday)}</div><div class="info-l">День рождения</div></div>`:''}
      </div>
      ${res.sharedChats?.length?`<div class="card-blk"><div class="blk-hdr">Общие группы (${res.sharedChats.length})</div>${res.sharedChats.map(c=>`<div style="padding:6px 0;" onclick="closePeerProfile();openChat('${c.id}')">${esc(c.title)}</div>`).join('')}</div>`:''}
      <div class="sec-hdr">Подарки (${u.giftsHidden?'скрыты':u.gifts.length})</div>
      ${!u.giftsHidden && u.gifts.length ? `<div class="g-grid">${u.gifts.map(g=>`<div class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]});">${g.isNft?`<div class="g-ribbon">#${g.num}</div>`:''}${giftImgHtml(g,60)}</div>`).join('')}</div>` : ''}
      <div class="card-blk" style="margin-top:8px;">
        <div class="set-row" onclick="toggleBlockPeer('${u.id}')"><span style="color:var(--red);font-weight:600;">${res.isBlocked?'Разблокировать':'Заблокировать пользователя'}</span></div>
        <div class="set-row" onclick="reportPeer('${u.id}')"><span style="color:var(--red);">Пожаловаться</span></div>
      </div>`;
    $('peer-profile-screen').classList.remove('hidden');
  } catch (e) { showToast(e.message); }
}
function closePeerProfile() { $('peer-profile-screen').classList.add('hidden'); }
async function startDm(pid) { try { const r = await api('POST','/api/chats/dm',{peerId:pid}); closePeerProfile(); await refreshAllData(); openChat(r.chat.id); } catch(e){showToast(e.message);} }
async function toggleContactPeer(uid, isC) { if (isC) await api('DELETE',`/api/contacts/${uid}`); else await api('POST','/api/contacts',{query:uid}); await refreshAllData(); openPeerProfile(uid); }
async function toggleBlockPeer(uid) { const r = await api('POST',`/api/users/${uid}/block`); await refreshAllData(); showToast(r.blocked?'Заблокирован':'Разблокирован'); if(!$('peer-profile-screen').classList.contains('hidden')) openPeerProfile(uid); }
async function reportPeer(uid) { await api('POST',`/api/users/${uid}/report`,{reason:'Жалоба из профиля'}); showToast('Жалоба отправлена'); }

function openGlobalSearch() { $('global-search-screen').classList.remove('hidden'); $('gs-input').focus(); }
function closeGlobalSearch() { $('global-search-screen').classList.add('hidden'); }
async function runGlobalSearch() {
  const q = $('gs-input').value.trim(); if (!q) { $('gs-results').innerHTML = ''; return; }
  const res = await api('GET', '/api/search?q=' + encodeURIComponent(q));
  let h = '';
  if (res.users.length) h += `<div class="sec-hdr">Люди</div>` + res.users.map(u => `<div class="c-row" onclick="closeGlobalSearch();openPeerProfile('${u.id}')"><div class="ava sm" style="background:${u.color}">${esc(u.firstName[0])}</div><div class="c-mid"><div class="c-title">${esc(u.firstName)} ${esc(u.lastName)}</div><div class="c-sub">${esc(u.username)}</div></div></div>`).join('');
  if (res.chats.length) h += `<div class="sec-hdr">Чаты и каналы</div>` + res.chats.map(c => `<div class="c-row" onclick="closeGlobalSearch();joinOrOpen('${c.id}',${c.isMember})"><div class="ava sm" style="background:#45c4cc">${esc(c.title[0])}</div><div class="c-mid"><div class="c-title">${esc(c.title)}</div><div class="c-sub">${c.type} • ${c.membersCount} участн.</div></div></div>`).join('');
  if (res.messages.length) h += `<div class="sec-hdr">Сообщения</div>` + res.messages.map(m => `<div class="c-row" onclick="closeGlobalSearch();openChat('${m.chatId}')"><div class="c-mid"><div class="c-title">${esc(m.chatTitle)}</div><div class="c-sub">${esc(m.text)}</div></div></div>`).join('');
  $('gs-results').innerHTML = h || `<div class="muted" style="text-align:center;padding:30px;">Ничего не найдено</div>`;
}
async function joinOrOpen(cid, isM) { if (!isM) await api('POST', `/api/chats/${cid}/join`, {}); await refreshAllData(); openChat(cid); }

// ==================== НАСТРОЙКИ, СВОЙ ПРОФИЛЬ И ПРИВАТНОСТЬ ====================
function renderSettings() {
  const u = currentUser, ava = u.avatar ? `<img src="${esc(u.avatar)}">` : esc((u.firstName[0]||'C').toUpperCase());
  $('set-hero').innerHTML = `<div style="position:relative;margin-bottom:10px;cursor:pointer;" onclick="$('quick-ava-file').click()"><div class="ava lg" style="background:${u.color}">${ava}</div><div class="cam-badge">📷</div></div><div style="font-size:20px;font-weight:700;">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified?'<span class="v-badge">✔</span>':''}</div><div class="muted" style="font-size:13px;margin-top:2px;">${esc(u.phone)}${u.username?' • '+esc(u.username):''}</div>`;
  $('set-stars').textContent = (u.stars || 0).toLocaleString('ru-RU'); $('set-ton').textContent = (u.ton || 0) + ' TON';
  $('prem-sub').textContent = u.premium ? 'Активен ⭐' : 'Эксклюзивные возможности';
  $('owner-blk').classList.toggle('hidden', !u.isAdmin);
}

function renderProfile() {
  const u = currentUser, ava = u.avatar ? `<img src="${esc(u.avatar)}">` : esc((u.firstName[0]||'C').toUpperCase());
  const pos = ['top:16px;left:12px;','top:2px;left:48px;','bottom:10px;left:22px;','top:2px;right:48px;','top:16px;right:12px;','bottom:10px;right:22px;'];
  const pinnedOrbit = myGifts.filter(g => g.pinned && g.isNft).slice(0, 6);
  $('profile-hero').innerHTML = `<div class="orbit-box">${pinnedOrbit.map((g,i)=>`<div class="orb-gift" style="${pos[i]}">${giftImgHtml(g,24)}</div>`).join('')}<div class="orbit-ava" style="background:${u.color}">${ava}</div></div><div style="font-size:21px;font-weight:700;">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified?'<span class="v-badge">✔</span>':''} ${u.premium?'⭐':''}</div><div class="muted" style="font-size:13px;margin-top:3px;">в сети</div>`;
  $('profile-info-card').innerHTML = `<div class="info-item" onclick="copyTxt('${esc(u.phone)}')"><div class="info-v">${esc(u.phone)}</div><div class="info-l">Телефон</div></div>${u.bio?`<div class="info-item"><div class="info-v">${esc(u.bio)}</div><div class="info-l">О себе</div></div>`:''}${u.username?`<div class="info-item" onclick="copyTxt('${esc(u.username)}')"><div class="info-v">${esc(u.username)}</div><div class="info-l">Имя пользователя</div></div>`:''}${u.birthday?`<div class="info-item"><div class="info-v">${esc(u.birthday)}</div><div class="info-l">День рождения</div></div>`:''}${u.address?`<div class="info-item"><div class="info-v">${esc(u.address)}</div><div class="info-l">Адрес</div></div>`:''}`;
  $('tab-gifts-mini').innerHTML = pinnedOrbit.slice(0, 3).map(g => giftImgHtml(g, 14)).join('');
  const sorted = [...myGifts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  $('profile-gifts-grid').innerHTML = sorted.length ? sorted.map(g => `<div class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]});" onclick="viewMyGift('${g.uid}')"><div class="g-card-pat"></div>${g.pinned?'<div class="g-pin">📌</div>':''}${g.forSale?'<div class="g-ribbon sale">продаётся</div>':(g.isNft?`<div class="g-ribbon">#${g.num}</div>`:'')}${giftImgHtml(g,62)}${g.forSale?`<div class="g-price-pill">★ ${g.salePrice}</div>`:''}</div>`).join('') : `<div style="grid-column:span 3;text-align:center;color:var(--muted);padding:26px;">Подарков пока нет</div>`;
  const saved = stories.filter(s => s.userId === u.id && s.savedToProfile);
  $('saved-stories-grid').innerHTML = saved.length ? saved.map(s => `<div class="g-card" style="padding:8px;font-size:12px;">${esc(s.text||'История')}</div>`).join('') : `<div style="grid-column:span 3;text-align:center;color:var(--muted);padding:26px;">Сохранённых историй нет</div>`;
}

function setProfileTab(t) { $('p-tab-posts').classList.toggle('hidden', t !== 'posts'); $('p-tab-gifts').classList.toggle('hidden', t !== 'gifts'); $('ps-posts').classList.toggle('active', t === 'posts'); $('ps-gifts').classList.toggle('active', t === 'gifts'); }
function copyTxt(t) { navigator.clipboard?.writeText(t); showToast('Скопировано: ' + t); }
function quickAvatarChange(inp) { uploadAvatarFile(inp, null, null, async url => { const r = await api('PATCH','/api/profile',{avatar:url}); currentUser = r.user; renderAll(); showToast('Фото обновлено'); }); }

function openEditProfile() {
  const u = currentUser; editAva = u.avatar;
  openModal(`<h3 style="margin-bottom:14px;">Изменить профиль</h3><div class="ava-up" onclick="$('ep-f').click()"><img id="ep-p" src="${esc(u.avatar||'')}" class="${u.avatar?'':'hidden'}"/><span id="ep-ph" class="ava-ph ${u.avatar?'hidden':''}">📷<br>Фото</span></div><input id="ep-f" type="file" accept="image/*" class="hidden" onchange="uploadAvatarFile(this,'ep-p','ep-ph',v=>editAva=v)"/><div class="fg"><input id="ep-fn" class="tf" placeholder="Имя" value="${esc(u.firstName)}"/><input id="ep-ln" class="tf" placeholder="Фамилия" value="${esc(u.lastName)}"/><input id="ep-un" class="tf" placeholder="@username" value="${esc(u.username)}"/><input id="ep-bio" class="tf" placeholder="О себе" value="${esc(u.bio)}"/><input id="ep-bd" class="tf" placeholder="День рождения" value="${esc(u.birthday)}"/><input id="ep-ad" class="tf" placeholder="Адрес" value="${esc(u.address)}"/></div><button class="btn1" onclick="saveProfile()">Сохранить</button>`);
}
async function saveProfile() {
  try {
    const r = await api('PATCH', '/api/profile', { firstName: $('ep-fn').value, lastName: $('ep-ln').value, username: $('ep-un').value, bio: $('ep-bio').value, birthday: $('ep-bd').value, address: $('ep-ad').value, avatar: editAva });
    currentUser = r.user; closeModal(); renderAll(); showToast('Сохранено');
  } catch (e) { showToast(e.message); }
}

function openChatAppearanceModal() {
  const s = currentUser.settings || {};
  openModal(`<h3 style="margin-bottom:12px;">Оформление</h3><div class="fg"><select id="ap-th" class="tf"><option value="dark" ${s.theme!=='light'?'selected':''}>Тёмная тема</option><option value="light" ${s.theme==='light'?'selected':''}>Светлая тема</option></select><select id="ap-fs" class="tf"><option value="14" ${s.fontSize===14?'selected':''}>Текст 14px</option><option value="15" ${!s.fontSize||s.fontSize===15?'selected':''}>Текст 15px</option><option value="17" ${s.fontSize===17?'selected':''}>Текст 17px</option></select></div><button class="btn1" onclick="saveAppearance()">Применить</button>`);
}
async function saveAppearance() {
  const r = await api('PATCH', '/api/profile/settings', { theme: $('ap-th').value, fontSize: parseInt($('ap-fs').value, 10) });
  currentUser.settings = r.settings; applySettings(); closeModal(); showToast('Оформление обновлено');
}
async function toggleUserSetting(k) {
  const v = currentUser.settings?.[k] === false;
  const r = await api('PATCH', '/api/profile/settings', { [k]: v });
  currentUser.settings = r.settings; applySettings(); showToast('Настройка обновлена');
}

function openPrivacyModal() {
  const p = currentUser.privacy || {};
  const opt = (id, lbl, val) => `<div style="padding:8px 14px;border-bottom:1px solid var(--div);display:flex;justify-content:space-between;align-items:center;"><span style="font-size:14px;">${lbl}</span><select id="${id}" style="background:var(--card2);color:var(--text);border:none;padding:6px;border-radius:8px;"><option value="everybody" ${val==='everybody'?'selected':''}>Все</option><option value="contacts" ${val==='contacts'?'selected':''}>Контакты</option><option value="nobody" ${val==='nobody'?'selected':''}>Никто</option></select></div>`;
  openModal(`<h3 style="margin-bottom:12px;">Конфиденциальность</h3><div class="fg">${opt('pr-ph','Номер телефона',p.phone)}${opt('pr-ls','Время захода',p.lastSeen)}${opt('pr-bd','День рождения',p.birthday)}${opt('pr-ms','Кто пишет мне',p.messages)}${opt('pr-gr','Приглашения в группы',p.groups)}${opt('pr-gf','Мои подарки',p.gifts)}</div><button class="btn1" style="margin-bottom:10px;" onclick="savePrivacy()">Сохранить приватность</button><button class="btn2" onclick="openSecurityModal()">Смена номера / пароля / 2FA</button>`);
}
async function savePrivacy() {
  const r = await api('PATCH', '/api/profile/privacy', { phone: $('pr-ph').value, lastSeen: $('pr-ls').value, birthday: $('pr-bd').value, messages: $('pr-ms').value, groups: $('pr-gr').value, gifts: $('pr-gf').value });
  currentUser.privacy = r.privacy; closeModal(); showToast('Приватность сохранена');
}
function openSecurityModal() {
  openModal(`<h3 style="margin-bottom:12px;">Безопасность</h3><div class="fg"><input id="sec-cur" class="tf" type="password" placeholder="Текущий пароль *"/><input id="sec-ph" class="tf" placeholder="Новый номер (необязательно)"/><input id="sec-np" class="tf" type="password" placeholder="Новый пароль"/><input id="sec-nc" class="tf" type="password" placeholder="Новый облачный пароль"/></div><button class="btn1" onclick="saveSecurity()">Обновить</button>`);
}
async function saveSecurity() {
  try {
    const r = await api('PATCH', '/api/profile/security', { currentPassword: $('sec-cur').value, newPhone: $('sec-ph').value || undefined, newPassword: $('sec-np').value || undefined, newCloudPassword: $('sec-nc').value || undefined });
    currentUser = r.user; closeModal(); renderAll(); showToast('Данные обновлены');
  } catch (e) { showToast(e.message); }
}

async function openSessionsModal() {
  const r = await api('GET', '/api/auth/sessions');
  openModal(`<h3 style="margin-bottom:12px;">Устройства</h3>` + r.sessions.map(s => `<div class="card-blk" style="margin:0 0 8px;"><b>${s.current?'Текущее устройство':'Сессия'}</b><div class="muted" style="font-size:12px;">${esc(s.device)} • ${fmtTime(s.lastActive)}</div></div>`).join(''));
}
function openSettingsMoreMenu() { openModal(`<button class="btn2" style="color:var(--red);" onclick="closeModal();logout()">Выйти из аккаунта</button>`); }
function openQrModal() { openModal(`<div style="text-align:center;padding:16px 0;"><div class="cw-logo" style="margin:0 auto 12px;">C</div><h3>${esc(currentUser.firstName)} ${esc(currentUser.lastName)}</h3><p class="muted" style="margin:6px 0 14px;">${esc(currentUser.username || currentUser.phone)}</p><button class="btn2" onclick="copyTxt('${esc(currentUser.username||currentUser.id)}')">Копировать ссылку</button></div>`); }
function openAboutModal() { openModal(`<div style="text-align:center;padding:14px 0;"><div class="cw-logo">C</div><h3>CW-Gram v1.0</h3><p class="muted" style="margin-top:8px;font-size:13.5px;">Мессенджер в реальном времени с поддержкой чатов, каналов, историй, подарков и серверной авторизацией.</p></div>`); }

// ==================== ЗВЁЗДЫ, TON, PREMIUM, МАГАЗИН, МАРКЕТ ====================
function openStarsModal() {
  const hist = (currentUser.starHistory || []).slice(0, 8).map(h => `<div class="set-row"><div class="set-txt"><div class="set-t">${esc(h.title)}</div></div><span class="cyan-val">${esc(h.amount)}</span></div>`).join('');
  openModal(`<div style="text-align:center;padding:10px 0 14px;"><div style="font-size:46px;">⭐</div><div style="font-size:28px;font-weight:800;">${(currentUser.stars||0).toLocaleString('ru-RU')} ★</div><div class="muted" style="font-size:13px;">Баланс Звёзд CW-Gram</div></div>${hist?`<div class="card-blk" style="margin:0;">${hist}</div>`:''}`);
}
function openTonModal() {
  openModal(`<div style="text-align:center;padding:14px 0;"><div style="font-size:46px;">💎</div><div style="font-size:26px;font-weight:800;margin:6px 0;">${currentUser.ton || 0} TON</div><p class="muted" style="font-size:13px;line-height:1.4;">Внутренний баланс TON CW-Gram. Настоящие блокчейн-транзакции требуют подключения TON Connect.</p></div>`);
}
function openPremiumModal() {
  openModal(`<div style="text-align:center;padding:12px 0;"><div style="font-size:48px;">⭐</div><h3>CW-Gram Premium</h3><p class="muted" style="margin:8px 0 14px;font-size:13.5px;">Статус: <b>${currentUser.premium?'Активен ✔':'Не активен'}</b></p><div class="card-blk" style="margin:0;text-align:left;font-size:13.5px;line-height:1.7;">• Значок ⭐ рядом с именем<br>• Ускоренная загрузка медиа<br>• Расширенные лимиты профиля и реакций</div></div>`);
}

function openGiftShop(tab = 'regular', chatId = null) {
  const cp = chatId ? `'${chatId}'` : 'null';
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3>${chatId?'Отправить подарок':'Магазин и Маркет'}</h3><span class="cyan-val">★ ${(currentUser.stars||0).toLocaleString('ru-RU')}</span></div>
    <div class="seg"><button class="seg-b ${tab==='regular'?'active':''}" onclick="openGiftShop('regular',${cp})">Обычные</button><button class="seg-b ${tab==='nft'?'active':''}" onclick="openGiftShop('nft',${cp})">NFT</button><button class="seg-b ${tab==='market'?'active':''}" onclick="openGiftShop('market',${cp})">Маркет</button></div>
    <div class="g-grid" style="padding:0;">
      ${tab === 'regular' ? catalog.regular.map(g => `<div class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]});" onclick="buyShopGift('regular','${g.id}',${cp})"><div style="font-size:36px;">${g.emoji}</div><div style="font-size:11px;font-weight:700;margin-top:4px;">${esc(g.name)}</div><div class="g-price-pill">★ ${g.stars}</div></div>`).join('') :
        tab === 'nft' ? catalog.nft.map(g => `<div class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]});" onclick="buyShopGift('nft','${g.slug}',${cp})">${giftImgHtml({isNft:true,...g},48)}<div style="font-size:10.5px;font-weight:700;margin-top:4px;">${esc(g.name)}</div><div class="g-price-pill">★ ${g.stars}</div></div>`).join('') :
        (catalog.market.length ? catalog.market.map(g => `<div class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]});" onclick="buyMarketLot('${g.uid}')"><div class="g-ribbon sale">лот</div>${giftImgHtml(g,48)}<div style="font-size:10.5px;font-weight:700;margin-top:4px;">${esc(g.name)} ${g.isNft?'#'+g.num:''}</div><div class="g-price-pill">★ ${g.salePrice}</div></div>`).join('') : '<div style="grid-column:span 3;text-align:center;color:var(--muted);padding:24px;">На маркете пока нет лотов</div>')}
    </div>`);
}
async function buyShopGift(kind, idOrSlug, targetChatId) {
  try { await api('POST', '/api/gifts/buy', { kind, idOrSlug, targetChatId }); closeModal(); await refreshAllData(); showToast(targetChatId ? 'Подарок отправлен' : 'Подарок куплен'); } catch (e) { showToast(e.message); }
}
async function buyMarketLot(uid) {
  try { await api('POST', `/api/gifts/${uid}/buy-market`); closeModal(); await refreshAllData(); showToast('Лот куплен!'); } catch (e) { showToast(e.message); }
}

function viewMyGift(uid) {
  const g = myGifts.find(x => x.uid === uid); if (!g) return;
  openModal(`
    <div style="border-radius:16px;padding:18px;background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]});text-align:center;margin-bottom:14px;">
      <div style="display:flex;justify-content:center;margin-bottom:8px;">${giftImgHtml(g,86)}</div>
      <div style="font-size:19px;font-weight:700;color:#fff;">${esc(g.name)} ${g.isNft?'#'+g.num:''}</div>
      ${g.isNft?`<div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">Модель: ${esc(g.model)} • Узор: ${esc(g.pattern)} • ${esc(g.rarity)}</div>`:''}
    </div>
    ${g.isNft?`<button class="btn1" style="margin-bottom:8px;" onclick="pinMyGift('${uid}')">${g.pinned?'Открепить от профиля':'📌 Закрепить вокруг аватарки'}</button>`:''}
    <button class="btn2" style="margin-bottom:8px;" onclick="saleMyGiftPrompt('${uid}',${g.forSale})">${g.forSale?'Снять с продажи':'Выставить на маркет'}</button>
    <button class="btn2" onclick="sendMyGiftPrompt('${uid}')">🎁 Подарить в чат</button>`);
}
async function pinMyGift(uid) { await api('POST', `/api/gifts/${uid}/pin`); closeModal(); await refreshAllData(); showToast('Обновлено'); }
function saleMyGiftPrompt(uid, onSale) {
  if (onSale) return api('POST', `/api/gifts/${uid}/sale`, {}).then(() => { closeModal(); refreshAllData(); showToast('Снято с продажи'); });
  openModal(`<h3 style="margin-bottom:10px;">Цена продажи (★)</h3><div class="fg"><input id="sl-p" class="tf" type="number" value="500"/></div><button class="btn1" onclick="doSale('${uid}')">Выставить</button>`);
}
async function doSale(uid) { await api('POST', `/api/gifts/${uid}/sale`, { price: $('sl-p').value }); closeModal(); await refreshAllData(); showToast('Выставлено на маркет'); }
function sendMyGiftPrompt(uid) { openModal(`<h3 style="margin-bottom:10px;">Выберите чат</h3>` + chats.map(c => `<div class="c-row" onclick="doSendGift('${uid}','${c.id}')"><span>${esc(c.title)}</span></div>`).join('')); }
async function doSendGift(uid, chatId) { await api('POST', `/api/gifts/${uid}/send`, { chatId }); closeModal(); await refreshAllData(); openChat(chatId); showToast('Отправлено'); }

// ==================== ЗВОНКИ ====================
function startVoiceCallFromRoom() {
  const c = chats.find(x => x.id === activeChatId); if (!c || !c.peer) return showToast('Позвонить можно в личном чате');
  callPeerId = c.peer.id; $('call-name').textContent = c.title; $('call-ava').style.background = c.color; $('call-ava').textContent = c.title[0];
  $('call-status').textContent = 'Вызов...'; $('call-overlay').classList.remove('hidden');
  ws?.send(JSON.stringify({ event: 'call:signal', payload: { toId: callPeerId, signal: 'offer', fromName: `${currentUser.firstName} ${currentUser.lastName}`.trim() } }));
}
function acceptCall(peerId, name) {
  callPeerId = peerId; $('call-name').textContent = name; $('call-ava').textContent = name[0];
  $('call-status').textContent = 'Разговор • 00:00'; $('call-overlay').classList.remove('hidden');
  ws?.send(JSON.stringify({ event: 'call:signal', payload: { toId: peerId, signal: 'accept' } }));
  startCallCounter();
}
function startCallCounter() { let s = 0; clearInterval(callTimer); callTimer = setInterval(() => { s++; $('call-status').textContent = `Разговор • ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }, 1000); }
function toggleMuteCall() { callMuted = !callMuted; showToast(callMuted ? 'Микрофон выкл' : 'Микрофон вкл'); }
function endCall(remote = false) {
  clearInterval(callTimer); $('call-overlay').classList.add('hidden');
  if (!remote && callPeerId) {
    ws?.send(JSON.stringify({ event: 'call:signal', payload: { toId: callPeerId, signal: 'end' } }));
    api('POST', '/api/calls', { toId: callPeerId, peerName: $('call-name').textContent, duration: $('call-status').textContent }).catch(() => {});
  }
  callPeerId = null;
}
async function openCallsHistoryModal() {
  const r = await api('GET', '/api/calls');
  openModal(`<h3 style="margin-bottom:12px;">История звонков</h3>` + (r.calls.length ? r.calls.map(c => `<div class="set-row"><div class="set-txt"><div class="set-t">${esc(c.peerName)}</div><div class="set-s">${esc(c.duration)} • ${fmtTime(c.createdAt)}</div></div></div>`).join('') : '<p class="muted">Звонков пока нет</p>'));
}

// ==================== АДМИН-ПАНЕЛЬ (СЕРВЕРНАЯ ПРОВЕРКА) ====================
async function openAdminPanel() {
  try {
    const data = await api('GET', '/api/admin/overview');
    const uO = data.users.map(u => `<option value="${u.id}">${esc(u.firstName)} ${esc(u.lastName)} (${esc(u.phone)})</option>`).join('');
    const nO = catalog.nft.map(g => `<option value="${g.slug}">${esc(g.name)}</option>`).join('');
    const rO = catalog.regular.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
    openModal(`
      <h3 style="margin-bottom:8px;">Управление CW-Gram</h3>
      <div class="muted" style="font-size:12px;margin-bottom:12px;">Пользователей: ${data.users.length} • Чатов: ${data.totalChats} • Подарков: ${data.totalGifts}</div>
      <div class="fg"><select id="au" class="tf">${uO}</select><input id="as" class="tf" type="number" value="5000" placeholder="Количество ★ / TON"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <button class="btn1" onclick="admGrant('stars')">Выдать ★</button>
        <button class="btn2" onclick="admGrant('ton')">Выдать TON</button>
        <button class="btn2" onclick="admGrant('verified')">Галочка ✔</button>
        <button class="btn2" onclick="admGrant('premium')">Премиум ⭐</button>
        <button class="btn2" style="grid-column:span 2;color:var(--red);" onclick="admGrant('ban')">Бан / Разбан</button>
      </div>
      <div class="fg"><select id="an" class="tf">${nO}</select><input id="anum" class="tf" type="number" value="1" placeholder="Номер #"/></div>
      <button class="btn1" style="margin-bottom:8px;" onclick="admGift('nft')">Выдать NFT</button>
      <div class="fg"><select id="ar" class="tf">${rO}</select></div>
      <button class="btn2" style="margin-bottom:12px;" onclick="admGift('regular')">Выдать обычный подарок</button>
      <div class="fg"><input id="acast" class="tf" placeholder="Рассылка во все чаты..."/></div>
      <button class="btn2" style="margin-bottom:12px;" onclick="admBroadcast()">Отправить рассылку</button>
      <div class="muted" style="font-size:12px;">Последние действия: ${data.audit.slice(0,4).map(a=>esc(a.details)).join(' | ')}</div>`);
  } catch (e) { showToast(e.message); }
}
async function admGrant(action) { try { await api('POST', '/api/admin/grant', { targetUserId: $('au').value, action, amount: $('as').value }); await refreshAllData(); showToast('Выполнено'); } catch (e) { showToast(e.message); } }
async function admGift(kind) { try { await api('POST', '/api/admin/grant', { targetUserId: $('au').value, action: 'gift', giftKind: kind, giftKey: kind === 'nft' ? $('an').value : $('ar').value, giftNum: $('anum').value }); await refreshAllData(); showToast('Подарок выдан'); } catch (e) { showToast(e.message); } }
async function admBroadcast() { try { await api('POST', '/api/admin/broadcast', { text: $('acast').value }); closeModal(); await refreshAllData(); showToast('Рассылка отправлена'); } catch (e) { showToast(e.message); } }

if (token) bootApp().catch(() => logout(true));