const tg = window.Telegram && Telegram.WebApp;
if (tg && tg.initData !== undefined) {
  document.documentElement.classList.add('tg');
  tg.ready(); tg.expand();
}
const haptic = () => { try { tg && tg.HapticFeedback.selectionChanged(); } catch (e) {} };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

// Избранное: Telegram CloudStorage (своё у каждого пользователя, синхронизируется
// между устройствами); вне Telegram — localStorage.
const cloud = tg && tg.initData && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9') ? tg.CloudStorage : null;
let favs = new Set();
function loadFavs(done) {
  const apply = v => { try { favs = new Set(JSON.parse(v || '[]').map(String)); } catch (e) {} done(); };
  if (cloud) cloud.getItem('fav', (err, v) => apply(err ? null : v));
  else apply(store.get('fav'));
}
function saveFavs() {
  const v = JSON.stringify([...favs]);
  if (cloud) cloud.setItem('fav', v, () => {}); else store.set('fav', v);
}
function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  try { tg && tg.HapticFeedback.impactOccurred('light'); } catch (e) {}
  saveFavs();
  const n = document.getElementById('fav-n'); if (n) n.textContent = favs.size;
  render();
}

let DATA, tab = store.get('tab') || 'all', query = '';
const closed = new Set(JSON.parse(store.get('closed') || '[]'));
const norm = s => s.toLowerCase().replace(/ё/g, 'е');
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function highlight(text) {
  if (!query) return esc(text);
  const i = norm(text).indexOf(norm(query));
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + query.length)) + '</mark>' + esc(text.slice(i + query.length));
}

function openPost(id) {
  haptic();
  const url = `https://t.me/c/${DATA.channel}/${id}`;
  if (tg && tg.openTelegramLink && tg.initData) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

function itemHtml(id) {
  const p = DATA.posts[id];
  if (!p) return '';
  const video = p.type === 'video';
  const on = favs.has(String(id));
  return `<div class="item" role="button" data-id="${id}">
    <div class="ico ${video ? 'video' : ''}">${video ? '🎬' : '📊'}</div>
    <div class="t"><div class="name">${highlight(p.title)}</div>
      <div class="meta">${video ? 'Видео' : 'Презентация'}</div></div>
    <button class="star ${on ? 'on' : ''}" data-fav="${id}" aria-label="${on ? 'Убрать из избранного' : 'В избранное'}">${on ? '★' : '☆'}</button>
    <span class="chev">›</span></div>`;
}

function render() {
  const list = document.getElementById('list');
  const q = norm(query.trim());
  let html = '', found = 0;
  for (const s of DATA.sections) {
    if (!q && tab !== 'all' && tab !== 'fav' && tab !== s.id) continue;
    const onlyFav = !q && tab === 'fav';
    let secHtml = '';
    for (const g of s.groups) {
      const items = g.items.filter(id => DATA.posts[id] && (!onlyFav || favs.has(String(id))) &&
        (!q || norm(DATA.posts[id].title).includes(q) || norm(g.title).includes(q)));
      if (!items.length) continue;
      found += items.length;
      const key = s.id + '/' + g.title;
      const isClosed = !q && closed.has(key);
      secHtml += `<div class="group ${isClosed ? 'closed' : ''}" data-key="${esc(key)}">
        <div class="group-h"><span>${highlight(g.title)}</span>
          <span class="cnt">${items.length} <span class="arr">▾</span></span></div>
        <div class="items">${items.map(itemHtml).join('')}</div></div>`;
    }
    if (secHtml) html += `<div class="sec-title">${s.icon} ${esc(s.title)}</div>` + secHtml;
  }
  list.innerHTML = html || (!q && tab === 'fav'
    ? '<div class="empty"><b>☆</b>Здесь пока пусто.<br>Нажмите ☆ рядом с презентацией, чтобы она появилась в избранном.</div>'
    : `<div class="empty"><b>🔍</b>Ничего не нашлось по запросу «${esc(query)}»</div>`);
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', !q && t.dataset.id === tab));
}

function renderTabs() {
  const count = s => s.groups.reduce((n, g) => n + g.items.filter(id => DATA.posts[id]).length, 0);
  const total = DATA.sections.reduce((n, s) => n + count(s), 0);
  const tabs = [{ id: 'all', short: 'Все', n: total }, ...DATA.sections.map(s => ({ id: s.id, short: s.icon + ' ' + s.short, n: count(s) }))];
  tabs.unshift({ id: 'fav', short: '★ Избранное', n: favs.size });
  document.getElementById('tabs').innerHTML = tabs.map(t =>
    `<button class="tab" data-id="${t.id}">${esc(t.short)}<span class="n"${t.id === 'fav' ? ' id="fav-n"' : ''}>${t.n}</span></button>`).join('');
  const posts = Object.values(DATA.posts);
  const v = posts.filter(p => p.type === 'video').length;
  document.getElementById('sub').textContent =
    `${posts.length - v} презентаций` + (v ? ` · ${v} видео` : '') + ' · нажмите, чтобы открыть пост';
}

document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  haptic(); tab = b.dataset.id; store.set('tab', tab);
  query = ''; q.value = ''; clearBtn.style.display = 'none';
  render(); window.scrollTo(0, 0);
});
document.getElementById('list').addEventListener('click', e => {
  const star = e.target.closest('.star');
  if (star) { e.stopPropagation(); return toggleFav(star.dataset.fav); }
  const it = e.target.closest('.item');
  if (it) return openPost(it.dataset.id);
  const h = e.target.closest('.group-h');
  if (h && !query) {
    const g = h.parentElement, key = g.dataset.key;
    g.classList.toggle('closed');
    g.classList.contains('closed') ? closed.add(key) : closed.delete(key);
    store.set('closed', JSON.stringify([...closed]));
  }
});
const q = document.getElementById('q'), clearBtn = document.getElementById('clear');
q.addEventListener('input', () => { query = q.value; clearBtn.style.display = query ? 'block' : 'none'; render(); });
clearBtn.addEventListener('click', () => { q.value = ''; query = ''; clearBtn.style.display = 'none'; render(); q.focus(); });

fetch('data.json?v=' + Date.now()).then(r => r.json()).then(d => {
  DATA = d;
  if (tab !== 'all' && tab !== 'fav' && !d.sections.some(s => s.id === tab)) tab = 'all';
  loadFavs(() => { renderTabs(); render(); });
}).catch(() => {
  document.getElementById('list').innerHTML = '<div class="empty"><b>⚠️</b>Не удалось загрузить список. Попробуйте позже.</div>';
});
