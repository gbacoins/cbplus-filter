// ==UserScript==
// @name         cbplus (fixed + right-list gender filter)
// @namespace    https://github.com/valzar-cbp/
// @downloadURL  https://raw.githubusercontent.com/valzar-cbp/cbplus/master/index.js
// @version      1.3.6
// @description  Better Chaturbate! (stability fixes + 3-way right-list filter + All reset)
// @author       ValzarMen (patches by ChatGPT)
// @include      https://www.chaturbate.com/*
// @include      https://chaturbate.com/*
// @require      https://raw.githubusercontent.com/valzar-cbp/cbplus/master/require/video.min.js
// @require      https://raw.githubusercontent.com/valzar-cbp/cbplus/master/require/jquery.min.js
// @require      https://raw.githubusercontent.com/valzar-cbp/cbplus/master/require/jquery-ui.min.js
// @resource     vjCSS https://raw.githubusercontent.com/valzar-cbp/cbplus/master/resource/video-js.css
// @resource     jqCSS https://raw.githubusercontent.com/valzar-cbp/cbplus/master/resource/jquery-ui.css
// @resource     cbCSS https://raw.githubusercontent.com/valzar-cbp/cbplus/master/resource/cbplus.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // --- styles
  try { GM_addStyle(GM_getResourceText('vjCSS')); } catch {}
  try { GM_addStyle(GM_getResourceText('jqCSS')); } catch {}
  try { GM_addStyle(GM_getResourceText('cbCSS')); } catch {}

  // small style for the filter bar (kept inline so it always loads)
  GM_addStyle(`
    .cbplus-filterbar {
      display:flex; gap:6px; align-items:center; padding:6px 8px; border-bottom:1px solid #444;
      background:#1b1b1b; position:sticky; top:0; z-index:9999; font:600 12px/1.2 system-ui,Roboto,Segoe UI,Arial;
    }
    .cbplus-filterbar .cbp-btn {
      padding:6px 10px; border-radius:8px; border:1px solid #666; background:#2a2a2a; color:#eee; cursor:pointer;
      user-select:none;
    }
    .cbplus-filterbar .cbp-btn.active { border-color:gold; color:#111; background:gold; }
    .cbplus-filterbar .cbp-spacer { flex:1; opacity:.5; font-weight:500; color:#bbb }
  `);

  const globals = {
    camsPath: '/cams-cbplus/',
    blackPath: '/cams-blacklist/',
    toursPath: '/tours/3/',
    chat: null,
  };

  // --- utils
  function makeid(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function sanitizeModelName(name) {
    if (!name) return '';
    if (name.includes('/')) name = name.split('/').filter(Boolean).pop();
    return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  }

  async function fetchHtml(url) {
    const res = await fetch(url, { credentials: 'include', mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  function getEventContainer(e, levelsUp = 2) {
    let target = null;
    if (e && typeof e.composedPath === 'function') {
      const path = e.composedPath();
      target = path.find(el => el && el.classList && el.classList.contains('cam'));
    }
    if (!target) {
      target = e && e.currentTarget;
      for (let i = 0; i < levelsUp && target && target.parentNode; i++) target = target.parentNode;
      if (!(target && target.classList && target.classList.contains('cam'))) {
        const btn = e && (e.target || e.srcElement);
        if (btn && btn.closest) target = btn.closest('div.cam');
      }
    }
    return target || null;
  }

  // --- main
  function generalStuff() {
    const terms = document.querySelector('#close_entrance_terms');
    if (terms) terms.click(); // accept terms

    addTabs();
    cleanPage();

    const path = document.location.pathname;
    if (path === globals.camsPath) camsSite();
    else if (path === globals.blackPath) blackSite();
    else if (path === globals.toursPath) toursPage();
  }

  function camsSite() {
    const playerID = makeid(32);
    globals.chat = new BroadcastChannel(playerID);

    document.title = 'CBPlus Cams';
    const head = document.getElementById('header');

    document.body.innerHTML = '';
    Object.assign(document.body.style, {
      height: '100vh', display: 'flex', flexDirection: 'column'
    });
    if (head) document.body.appendChild(head);

    const body_main = document.createElement('div');
    Object.assign(body_main.style, { display: 'flex', flexDirection: 'row', flex: '1' });

    const main = document.createElement('div');
    main.id = 'mainDiv';
    Object.assign(main.style, { boxSizing: 'border-box', flex: '1', display: 'grid' });
    main.className = 'oneCam';
    main.appendChild(camDiv());

    const rightMenu = document.createElement('div');
    rightMenu.id = 'rightMenu';
    Object.assign(rightMenu.style, { top: '0', bottom: '0', right: '0', width: '600px', display: 'flex', flexDirection: 'column' });

    // --- FILTER BAR (parent page only)
    const filterBar = buildFilterBar((mode) => {
      localStorage.setItem('cbplus_gender_filter', mode);
      if (globals.chat) globals.chat.postMessage(`filter ${mode}`);
    });
    rightMenu.appendChild(filterBar);

    const frame = document.createElement('iframe');
    frame.src = `https://chaturbate.com/tours/3/?p=1&c=200&playerID=${playerID}`;
    Object.assign(frame.style, { flex: '1', border: '0', width: '600px' });

    // HIDE/SHOW LIST toggle in site nav
    const subnav = document.getElementById('nav');
    if (subnav) {
      const hideMenu = document.createElement('li');
      hideMenu.innerHTML = `<a style="color: gold;">HIDE/SHOW LIST</a>`;
      hideMenu.style.cursor = 'pointer';
      hideMenu.onclick = function () { $('div#rightMenu').toggle(250); };
      subnav.appendChild(hideMenu);
    }

    rightMenu.appendChild(frame);
    body_main.appendChild(main);
    body_main.appendChild(rightMenu);
    document.body.appendChild(body_main);

    $('div#mainDiv').sortable({ tolerance: 'pointer', revert: true, stop: function (event, ui) { Dropped(event, ui); } });

    globals.chat.onmessage = readMessage;

    // initialize filter UI to last choice
    const saved = localStorage.getItem('cbplus_gender_filter') || 'all';
    setActiveFilterButton(filterBar, saved);
    if (globals.chat) globals.chat.postMessage(`filter ${saved}`);
  }

  function Dropped(_event, ui) {
    const player = ui && ui.item && ui.item[0] && ui.item[0].querySelector('video');
    if (player && player.play) { try { player.play(); } catch {} }
  }

  function blackSite() {
    document.title = 'CBPlus Blacklist';
    const mainD = document.getElementById('main');
    if (!mainD) return;
    const body = mainD.getElementsByClassName('content_body')[0] || mainD;
    const ul = document.createElement('ul');

    const keys = Object.keys(localStorage);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k.startsWith('cbplus_blacklist_')) continue;
      const title = k.substring('cbplus_blacklist_'.length);
      const li = document.createElement('li');
      li.textContent = `${title}, ${localStorage.getItem(k)}`;
      li.style.cursor = 'pointer';
      li.onclick = function () {
        const name = (this.textContent || '').split(',')[0];
        if (confirm(`Delete ${name} from blacklist?`)) {
          localStorage.removeItem(`cbplus_blacklist_${name}`);
          this.remove();
        }
      };
      li.onmouseover = function () { this.style.textDecoration = 'line-through'; };
      li.onmouseout = function () { this.style.textDecoration = 'none'; };
      ul.appendChild(li);
    }

    body.innerHTML = '';
    body.appendChild(ul);
  }

  function toursPage() {
    document.body.style.padding = '0 8px';
    addMiniButtons();

    // auto-refresh like before
    setTimeout(function () { window.location.reload(); }, 60000);

    // BroadcastChannel for filter + “watch” messages
    const m = location.search.match(/[?&]playerID=([^&]+)/);
    const playerID = m ? m[1] : null;
    if (playerID) globals.chat = new BroadcastChannel(playerID);

    // Build a filter bar INSIDE the iframe only when opened directly (no playerID)
    // This removes the duplicate buttons when embedded in /cams-cbplus.
    const openedByParent = !!playerID;
    if (!openedByParent) {
      const container = document.querySelector('[data-testid="room-list-container"]');
      if (container && !document.querySelector('.cbplus-filterbar')) {
        const fb = buildFilterBar((mode) => {
          localStorage.setItem('cbplus_gender_filter', mode);
          applyGenderFilter(mode);
        });
        container.parentNode.insertBefore(fb, container);
        const saved = localStorage.getItem('cbplus_gender_filter') || 'all';
        setActiveFilterButton(fb, saved);
        applyGenderFilter(saved);
      }
    } else {
      // if something already injected, remove it to prevent duplicates
      const dup = document.querySelector('.cbplus-filterbar');
      if (dup) dup.remove();
    }

    // react to parent page messages (filter + watch)
    if (globals.chat) {
      globals.chat.onmessage = (evt) => {
        if (!evt || !evt.data) return;
        const [cmd, arg] = String(evt.data).split(' ');
        if (cmd === 'filter') {
          localStorage.setItem('cbplus_gender_filter', arg);
          applyGenderFilter(arg);
        }
      };
    }

    // re-apply filter as the list mutates (pagination / lazy loads)
    const list = document.querySelector('ul.list.tour_list');
    if (list) {
      const obs = new MutationObserver(() => {
        const mode = localStorage.getItem('cbplus_gender_filter') || 'all';
        applyGenderFilter(mode);
      });
      obs.observe(list, { childList: true, subtree: true });
    }
  }

  // ——— FILTER CORE ———
  function buildFilterBar(onChange) {
    const bar = document.createElement('div');
    bar.className = 'cbplus-filterbar';

    const label = document.createElement('span');
    label.textContent = 'Filter:';
    label.style.marginRight = '6px';
    label.style.color = '#bbb';

    const mkBtn = (mode, text) => {
      const b = document.createElement('button');
      b.className = 'cbp-btn';
      b.dataset.mode = mode;
      b.textContent = text;
      b.addEventListener('click', () => {
        setActiveFilterButton(bar, mode);
        if (typeof onChange === 'function') onChange(mode);
      });
      return b;
    };

    bar.appendChild(label);
    bar.appendChild(mkBtn('all', 'All'));
    bar.appendChild(mkBtn('female', 'Female'));
    bar.appendChild(mkBtn('couple', 'Couples'));
    bar.appendChild(mkBtn('trans', 'Trans'));
    const spacer = document.createElement('span');
    spacer.className = 'cbp-spacer';
    spacer.textContent = 'CBPlus';
    bar.appendChild(spacer);

    return bar;
  }

  function setActiveFilterButton(bar, mode) {
    bar.querySelectorAll('.cbp-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  function applyGenderFilter(mode) {
    // list items are li.room_list_room.roomCard; gender spans live under .age_gender_container
    const cards = document.querySelectorAll('ul.list.tour_list li.room_list_room.roomCard');
    cards.forEach(li => {
      const g = li.querySelector('.age_gender_container span[class^="gender"]');
      const cls = g ? g.className : ''; // e.g., 'genderf', 'genderc', 'genders'
      let show = true;

      if (mode === 'female') show = /\bgenderf\b/.test(cls);
      else if (mode === 'couple') show = /\bgenderc\b/.test(cls);
      else if (mode === 'trans') show = /\bgenders\b/.test(cls);
      else show = true; // 'all'

      li.style.display = show ? '' : 'none';
    });
  }

  // ——— end filter core ———

  async function readMessage(msg) {
    if (!msg || !msg.data) return;
    const parts = String(msg.data).split(' ');
    const cmd = parts[0];
    const model = sanitizeModelName(parts[1] || '');

    const existing = document.body.querySelectorAll(`div#mainDiv > div[name="${model}"]`);
    let wins = document.querySelectorAll('div#mainDiv > div.free');
    if (wins.length === 0 && !existing.length) wins = addCamPlace();

    if (cmd === 'watch' && model.length > 0 && wins.length > 0 && !existing.length) {
      try {
        const html = await fetchHtml(`https://chaturbate.com/${model}`);
        addCam(html, wins[0], model);
      } catch (e) {
        console.warn('Failed to load model page:', e);
      }
    } else if (existing.length) {
      console.log(`already watching ${model}!`);
    }
  }

  function cleanPage() {
    const removeParent = sel => { const el = document.querySelector(sel); if (el && el.parentNode) try { el.parentNode.remove(); } catch {} };
    const remove = sel => { const el = document.querySelector(sel); if (el) try { el.remove(); } catch {} };

    removeParent('.remove_ads');
    remove('.ad');
    removeParent('.logo-zone');

    const content = document.querySelector('.content');
    if (content) content.style.padding = '10px 0';

    const c1Main = document.querySelector('.c-1.endless_page_template');
    if (c1Main) c1Main.style.margin = '0 5px';
    const c1 = document.querySelector('.c-1');
    if (c1) c1.style.margin = '0 5px';

    const blogPosts = document.querySelector('.c-1.featured_blog_posts');
    if (blogPosts) blogPosts.remove();
  }

  function addCamPlace() {
    const main = document.querySelector('div#mainDiv');
    const len = main.querySelectorAll('div.cam').length;
    let loops = 0;
    let mainClass = 'Cams35';

    if (len === 1) { loops = 1; mainClass = 'Cams2'; }
    else if (len === 2) { loops = 1; mainClass = 'Cams3'; }
    else if (len === 3) { loops = 1; mainClass = 'Cams4'; }
    else if (len === 4) { loops = 1; mainClass = 'Cams5'; }
    else if (len === 5) { loops = 1; mainClass = 'Cams6'; }
    else if (len === 6) { loops = 3; mainClass = 'Cams9'; }
    else if (len === 9) { loops = 3; mainClass = 'Cams12'; }
    else if (len === 12) { loops = 4; mainClass = 'Cams16'; }
    else if (len === 16) { loops = 4; mainClass = 'Cams20'; }
    else if (len === 20) { loops = 5; mainClass = 'Cams25'; }
    else if (len === 25) { loops = 5; mainClass = 'Cams30'; }
    else if (len === 30) { loops = 5; mainClass = 'Cams35'; }

    for (let i = 0; i < loops; i++) main.appendChild(camDiv());
    main.className = mainClass;
    return main.querySelectorAll('div.free');
  }

  function cleanCams() {
    const main = document.querySelector('div#mainDiv');
    const frees = main.querySelectorAll('div.free');
    frees.forEach(f => main.removeChild(f));

    const len = main.querySelectorAll('div.cam').length;
    let loops = 0;
    let mainClass = 'oneCam';

    if (len > 30) { loops = 35 - len; mainClass = 'Cams35'; }
    else if (len > 25) { loops = 30 - len; mainClass = 'Cams30'; }
    else if (len > 20) { loops = 25 - len; mainClass = 'Cams25'; }
    else if (len > 16) { loops = 20 - len; mainClass = 'Cams20'; }
    else if (len > 12) { loops = 16 - len; mainClass = 'Cams16'; }
    else if (len > 9)  { loops = 12 - len; mainClass = 'Cams12'; }
    else if (len > 6)  { loops = 9  - len; mainClass = 'Cams9'; }
    else if (len > 5)  { loops = 6  - len; mainClass = 'Cams6'; }
    else if (len > 4)  { loops = 5  - len; mainClass = 'Cams5'; }
    else if (len > 3)  { loops = 4  - len; mainClass = 'Cams4'; }
    else if (len > 2)  { loops = 3  - len; mainClass = 'Cams3'; }
    else if (len > 1)  { loops = 2  - len; mainClass = 'Cams2'; }
    else if (!len)     { loops = 1; }

    for (let i = 0; i < loops; i++) main.appendChild(camDiv());
    main.className = mainClass;
  }

  function camDiv() {
    const c = document.createElement('div');
    c.className = 'cam ui-sortable-handle free';
    c.appendChild(plusButton());
    return c;
  }

  function addMiniButtons() {
    const rooms = document.querySelectorAll('ul.list > li');
    if (!rooms.length) return false;

    for (let i = 0; i < rooms.length; i++) {
      const a = rooms[i].querySelector('a');
      if (!a) continue;
      const name = sanitizeModelName(a.getAttribute('href') || '');
      if (!name) continue;

      if (localStorage.getItem(`cbplus_blacklist_${name}`) != null) {
        rooms[i].style.display = 'none';
        continue;
      }

      const titleLink = rooms[i].querySelector('div.title a');
      const tmpName = titleLink ? sanitizeModelName(titleLink.getAttribute('href')) : name;

      a.removeAttribute('href'); // click triggers watch
      rooms[i].style.cursor = 'pointer';
      a.setAttribute('name', tmpName);
      a.onclick = () => { if (globals.chat) globals.chat.postMessage(`watch ${tmpName}`); };
      if (titleLink) { titleLink.setAttribute('target', '_blank'); titleLink.style.cursor = 'pointer'; }

      const buttons = document.createElement('div');
      Object.assign(buttons.style, { top: '2px', left: '2px', position: 'absolute', cursor: 'pointer' });

      const blockButton = document.createElement('div');
      blockButton.textContent = '⛔';
      blockButton.setAttribute('name', tmpName);
      blockButton.onclick = function () {
        const cam = this.parentNode && this.parentNode.parentNode ? this.parentNode.parentNode : rooms[i];
        const nm = this.getAttribute('name');
        if (!nm) return;
        if (confirm(`Add ${nm} to blacklist?`)) {
          const span = cam.querySelector('div.title span');
          const gender = span && span.className ? span.className.slice(-1) : '?';
          const age = span ? span.textContent.trim() : '?';
          const value = `${gender} ${age} added: ${new Date().toLocaleString()}`;
          cam.style.display = 'none';
          localStorage.setItem(`cbplus_blacklist_${nm}`, value);
        }
      };
      buttons.appendChild(blockButton);

      // leave default rendering to full list; filtering is handled centrally now
      rooms[i].appendChild(buttons);
    }
    return true;
  }

  async function addCam(respHtml, div, model) {
    let stream = '';
    const m3u8Pos = respHtml.indexOf('.m3u8');
    if (m3u8Pos !== -1) {
      const start = respHtml.indexOf('https://edge');
      const end = m3u8Pos + 5;
      if (start !== -1 && end > start) {
        stream = respHtml.substring(start, end).replace(/\\u002D/g, '-');
      }
    }
    if (!stream) stream = 'no data';

    const poster = `https://cbjpeg.stream.highwebmedia.com/stream?room=${model}&f=${Math.random()}`;
    const id = `cam${Math.floor(Math.random() * 1e9)}`;

    div.classList.remove('free');
    div.setAttribute('name', model);
    div.innerHTML =
      `<video style="width:100%;height:100%;" id="${id}" class="video-js" poster="${poster}">
         <source src="${stream}" type="application/x-mpegURL"></source>
       </video>`;
    div.appendChild(topButtons(model));

    try {
      const player = window.videojs && window.videojs(id, {
        controls: true, autoplay: true, preload: 'auto', fluid: false, enableLowInitialPlaylist: true
      });
      if (player && player.volume) player.volume(0.01);
    } catch (e) {
      console.warn('videojs init failed', e);
    }
  }

  async function refreshCam(div) {
    if (!div) return;
    div.innerHTML = '';
    div.classList.add('free');
    const model = sanitizeModelName(div.getAttribute('name') || '');
    div.removeAttribute('name');
    if (!model) return;
    try {
      const html = await fetchHtml(`https://chaturbate.com/${model}`);
      addCam(html, div, model);
    } catch (e) {
      console.warn('Failed to refresh cam:', e);
    }
  }

  function removeCam(div) {
    if (!div) return;
    div.innerHTML = '';
    div.classList.add('free');
    div.removeAttribute('name');
    div.appendChild(plusButton());
    cleanCams();
  }

  function plusButton() {
    const b = document.createElement('button');
    b.textContent = 'ADD';
    b.classList.add('plusButton');
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      let user_data = prompt('Enter cb model name:', '');
      user_data = sanitizeModelName(user_data || '');
      if (!user_data) return;

      try {
        const html = await fetchHtml(`https://chaturbate.com/${user_data}`);
        const container = getEventContainer(e, 1) || (b.parentNode || null);
        if (container) addCam(html, container, user_data);
      } catch (err) {
        console.warn('Failed to add cam:', err);
      }
    });
    return b;
  }

  function topButtons(name) {
    const top = document.createElement('div');
    top.classList.add('topFrame');

    const r = document.createElement('button');
    r.classList.add('topButton');
    r.textContent = `${name} 🔄`;

    const x = document.createElement('button');
    x.classList.add('topButton');
    x.textContent = '❌';

    r.addEventListener('click', (e) => {
      e.preventDefault();
      const container = getEventContainer(e);
      if (container) refreshCam(container);
    });

    x.addEventListener('click', (e) => {
      e.preventDefault();
      const container = getEventContainer(e);
      if (container) removeCam(container);
    });

    top.appendChild(r);
    top.appendChild(x);
    return top;
  }

  function addTabs() {
    const sub_nav = document.getElementById('nav');
    if (sub_nav) {
      const navBar = document.querySelector('div.nav-bar');
      if (navBar) navBar.style.height = 'auto';

      const camsTab = document.createElement('li');
      camsTab.innerHTML = `<a style="color: gold;" href="/cams-cbplus/">CBPLUS</a>`;
      sub_nav.appendChild(camsTab);

      const blackTab = document.createElement('li');
      blackTab.innerHTML = `<a href="/cams-blacklist/">BLACKLIST</a>`;
      sub_nav.appendChild(blackTab);
    }
  }

  // kick things off
  generalStuff();
})();

