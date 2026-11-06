// Scene Reader — script library (plain script, loaded before app.js).
// Scripts are stored ONLY on this device, in the browser's IndexedDB database.
// A script keeps its breakdown, your character, voices, tone tags and folder.
// Backups are a single .json file you save yourself (nothing is uploaded).
'use strict';

const LIB = { db: null, ok: false, timer: 0 };
const idbReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbDone = (tx) => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('scene-reader', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('scenes')) r.result.createObjectStore('scenes', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}

// Load all scripts (moving any from the old v1.0–1.2 storage the first time)
async function libLoad() {
  try {
    if (!('indexedDB' in window)) throw new Error('no IndexedDB');
    LIB.db = await idbOpen();
    LIB.ok = true;
    let list = await idbReq(LIB.db.transaction('scenes').objectStore('scenes').getAll());
    if (!localStorage.getItem('sr.migrated')) {
      const legacy = load(KEY_SCENES, []);
      const have = new Set(list.map((s) => s.id));
      const add = legacy.filter((s) => s && s.id && !have.has(s.id));
      if (add.length) {
        const tx = LIB.db.transaction('scenes', 'readwrite');
        add.forEach((s) => tx.objectStore('scenes').put(s));
        await idbDone(tx);
        list = list.concat(add);
      }
      try { localStorage.setItem('sr.migrated', '1'); } catch {} // the old copy is left in place as a safety net
    }
    return list.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  } catch (e) {
    console.warn('Script library: IndexedDB unavailable, using basic storage', e);
    LIB.ok = false;
    return load(KEY_SCENES, []);
  }
}

function libSave() { clearTimeout(LIB.timer); LIB.timer = setTimeout(libFlush, 200); }
async function libFlush() {
  clearTimeout(LIB.timer);
  if (!LIB.ok) return save(KEY_SCENES, scenes);
  try {
    const tx = LIB.db.transaction('scenes', 'readwrite');
    const st = tx.objectStore('scenes');
    const ids = new Set(scenes.map((s) => s.id));
    const keys = await idbReq(st.getAllKeys());
    keys.filter((k) => !ids.has(k)).forEach((k) => st.delete(k));
    scenes.forEach((s) => st.put(s));
    await idbDone(tx);
  } catch (e) { console.warn(e); toast('Couldn’t save — storage is full or blocked.'); }
}
addEventListener('pagehide', () => { if (LIB.timer) libFlush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && LIB.timer) libFlush(); });

/* ------------------------------------------------------------------ library on the home screen */

const folders = () => [...new Set(scenes.map((s) => s.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const libQuery = { q: '' };

function libMatches(s, q) {
  if (!q) return true;
  const hay = [s.title, s.folder, s.me, ...characters(s.blocks).map((c) => c.name), ...s.blocks.map((b) => b.text)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function libItem(s) {
  return `<li class="scene-item">
      <button class="scene-open" data-act="open" data-id="${s.id}">
        <span class="scene-title">${esc(s.title)}</span>
        <span class="scene-meta">${s.folder ? `<span class="fchip">${esc(s.folder)}</span>` : ''}${s.me ? `You’re ${esc(s.me)} · ` : ''}${characters(s.blocks).length} characters · ${new Date(s.updated || Date.now()).toLocaleDateString()}</span>
      </button>
      <button class="icon-btn" data-act="lib-menu" data-id="${s.id}" aria-label="More for ${esc(s.title)}">⋯</button>
    </li>`;
}

function libListHtml() {
  const f = settings.libFolder || '';
  let list = scenes.filter((s) => libMatches(s, libQuery.q));
  if (f === '__none') list = list.filter((s) => !s.folder);
  else if (f) list = list.filter((s) => s.folder === f);
  if (!list.length) return `<p class="note lib-empty">${libQuery.q ? 'No scripts match your search.' : 'No scripts in this folder yet.'}</p>`;
  if (f || libQuery.q) return `<ul class="scene-list">${list.map(libItem).join('')}</ul>`;
  // "All": group by folder, unfiled last
  const groups = [...folders().map((name) => [name, list.filter((s) => s.folder === name)]), ['', list.filter((s) => !s.folder)]].filter(([, l]) => l.length);
  return groups.map(([name, l]) => `${groups.length > 1 || name ? `<h3 class="lib-group">${name ? esc(name) : 'No folder'}</h3>` : ''}<ul class="scene-list">${l.map(libItem).join('')}</ul>`).join('');
}

function libSectionHtml() {
  const f = settings.libFolder || '';
  const fs = folders();
  const chip = (v, label) => `<button class="lchip ${f === v ? 'on' : ''}" data-act="lib-folder" data-f="${esc(v)}">${esc(label)}</button>`;
  return `<section class="library">
      <div class="lib-head"><h2 class="section-h">Your scripts <span>${scenes.length}</span></h2></div>
      ${scenes.length ? `
        <input type="search" class="lib-search" id="lib-q" placeholder="Search titles, characters, lines…" value="${esc(libQuery.q)}" autocomplete="off" aria-label="Search your scripts">
        <div class="lchips">${chip('', 'All')}${fs.map((x) => chip(x, x)).join('')}${fs.length ? chip('__none', 'No folder') : ''}
          ${f && f !== '__none' ? `<button class="lchip ghost" data-act="lib-rename-folder">Rename folder</button>` : ''}</div>
        <div id="lib-list">${libListHtml()}</div>` : '<p class="note">Scripts you open or paste are saved here, on this device only.</p>'}
      <div class="lib-tools">
        ${scenes.length ? '<button class="btn ghost small" data-act="lib-backup">Back up all scripts</button>' : ''}
        <button class="btn ghost small" data-act="lib-restore">Restore from a backup</button>
        <input type="file" id="lib-file" accept=".json,application/json" hidden>
      </div>
    </section>`;
}

function libBind() {
  const q = $('#lib-q');
  if (q) q.addEventListener('input', () => { libQuery.q = q.value; $('#lib-list').innerHTML = libListHtml(); });
  $('#lib-file')?.addEventListener('change', (e) => { libImport(e.target.files[0]); e.target.value = ''; });
}

function libDownload(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const slug = (t) => (t || 'script').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'script';
const backupOf = (list) => ({ app: 'scene-reader', kind: 'backup', version: 1, appVersion: APP_VERSION, exported: new Date().toISOString(),
  scenes: list, prefs: { kFavs: settings.kFavs || [], keymap: settings.keymap || {} } });

async function libImport(file) {
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('That file isn’t a Scene Reader backup.'); }
  const list = Array.isArray(data) ? data : data && data.app === 'scene-reader' && Array.isArray(data.scenes) ? data.scenes : null;
  if (!list) return toast('That file isn’t a Scene Reader backup.');
  let added = 0, same = 0, copies = 0;
  const strip = (s) => JSON.stringify({ ...s, updated: 0 });
  for (const s of list) {
    if (!s || !s.id || !Array.isArray(s.blocks)) continue;
    const mine = getScene(s.id);
    if (!mine) { scenes.push(s); added++; }
    else if (strip(mine) === strip(s)) same++;
    else { scenes.push({ ...s, id: newId(), title: s.title + ' (from backup)' }); copies++; } // never overwrite your version
  }
  if (data.prefs) {
    settings.kFavs = [...new Set([...(settings.kFavs || []), ...(data.prefs.kFavs || [])])];
    if (!settings.keymap || !Object.keys(settings.keymap).length) settings.keymap = data.prefs.keymap || {};
    saveSettings();
  }
  scenes.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  saveScenes();
  renderHome();
  toast(`Restored: ${added} new${copies ? `, ${copies} kept as copies (you had different versions)` : ''}${same ? `, ${same} already here` : ''}.`);
}

async function libMenu(s) {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog" class="dlg sheet">
      <h3>${esc(s.title)}</h3>
      <div class="menu-list">
        <button value="open" class="menu-btn">Rehearse</button>
        <button value="edit" class="menu-btn">Edit the breakdown</button>
        <button value="rename" class="menu-btn">Rename</button>
        <button value="move" class="menu-btn">Move to folder${s.folder ? ` <em>(${esc(s.folder)})</em>` : ''}</button>
        <button value="dup" class="menu-btn">Duplicate</button>
        <button value="export" class="menu-btn">Export this script (file)</button>
        <button value="delete" class="menu-btn danger">Delete</button>
      </div>
      <div class="dlg-row"><span class="grow"></span><button value="cancel" class="btn ghost">Cancel</button></div>
    </form>`;
  d.returnValue = 'cancel';
  const choice = await new Promise((res) => { d.onclose = () => res(d.returnValue); d.showModal(); });
  if (choice === 'open') go(s.me ? '#/cast/' + s.id : '#/edit/' + s.id);
  else if (choice === 'edit') go('#/edit/' + s.id);
  else if (choice === 'rename') {
    const r = await ask({ title: 'Rename script', value: s.title, plain: true });
    if (r.action === 'ok' && r.value) { s.title = r.value; touch(s); renderHome(); }
  } else if (choice === 'move') {
    const f = await pickFolder(s.folder);
    if (f !== null) { s.folder = f || undefined; if (!s.folder) delete s.folder; touch(s); renderHome(); toast(f ? `Moved to “${f}”.` : 'Removed from folder.'); }
  } else if (choice === 'dup') {
    const copy = JSON.parse(JSON.stringify(s));
    Object.assign(copy, { id: newId(), title: s.title + ' (copy)', created: Date.now(), updated: Date.now() });
    copy.blocks.forEach((b) => (b.id = newId()));
    scenes.unshift(copy); saveScenes(); renderHome(); toast('Duplicated.');
  } else if (choice === 'export') libDownload({ ...backupOf([s]), kind: 'script' }, slug(s.title) + '.scene-reader.json');
  else if (choice === 'delete') {
    if (confirm(`Delete “${s.title}” from this device? (Tip: export it first if you might want it back.)`)) { scenes = scenes.filter((x) => x !== s); saveScenes(); renderHome(); }
  }
}

function pickFolder(cur) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    d.innerHTML = `<form method="dialog" class="dlg sheet">
        <h3>Move to folder</h3>
        <p class="note">Folders are for a show or an audition — e.g. “LAST CALL ep 104”.</p>
        <div class="menu-list">${folders().map((f) => `<button value="f:${esc(f)}" class="menu-btn ${f === cur ? 'on' : ''}">${esc(f)}</button>`).join('')}
          ${cur ? '<button value="none" class="menu-btn">No folder</button>' : ''}</div>
        <label class="field col"><span>New folder</span><input id="new-folder" placeholder="Show or audition name" autocomplete="off"></label>
        <div class="dlg-row"><span class="grow"></span><button value="cancel" class="btn ghost">Cancel</button><button value="new" class="btn primary">Create &amp; move</button></div>
      </form>`;
    d.returnValue = 'cancel';
    d.onclose = () => {
      const v = d.returnValue;
      if (v === 'cancel') return resolve(null);
      if (v === 'none') return resolve('');
      if (v === 'new') { const n = $('#new-folder').value.trim(); return resolve(n || null); }
      resolve(v.slice(2));
    };
    d.showModal();
  });
}

async function libClick(act, btn) {
  if (act === 'lib-menu') { const s = getScene(btn.dataset.id); if (s) libMenu(s); return true; }
  if (act === 'lib-folder') { settings.libFolder = btn.dataset.f; saveSettings(); renderHome(); return true; }
  if (act === 'lib-backup') { libDownload(backupOf(scenes), `scene-reader-backup-${new Date().toISOString().slice(0, 10)}.json`); toast('Backup saved to your downloads. Keep it somewhere safe.'); return true; }
  if (act === 'lib-restore') { $('#lib-file').click(); return true; }
  if (act === 'lib-rename-folder') {
    const old = settings.libFolder;
    const r = await ask({ title: 'Rename folder', value: old, plain: true });
    if (r.action === 'ok' && r.value && r.value !== old) {
      scenes.forEach((s) => { if (s.folder === old) { s.folder = r.value; s.updated = Date.now(); } });
      settings.libFolder = r.value; saveSettings(); saveScenes(); renderHome();
    }
    return true;
  }
  return false;
}
