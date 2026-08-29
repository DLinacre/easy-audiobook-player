(() => {
  'use strict';

  const STORE_KEY = 'easyAudiobookLibrary:v3';
  const STATE_KEY = 'easyAudiobookState:v3';
  const POS_PREFIX = 'easyAudiobookPosition:v3:';

  const sampleBooks = [
    {
      title: 'Sample Audio Book',
      author: 'Replace or delete this',
      source: 'Demo links',
      chapters: [
        { title: 'Demo Chapter 1', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
        { title: 'Demo Chapter 2', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' }
      ]
    }
  ];

  const $ = (id) => document.getElementById(id);
  const dom = {
    bookSelect: $('bookSelect'), deleteBook: $('deleteBook'), coverBox: $('coverBox'),
    tabPaste: $('tabPaste'), tabPage: $('tabPage'), tabFiles: $('tabFiles'),
    pastePanel: $('pastePanel'), pagePanel: $('pagePanel'), filesPanel: $('filesPanel'),
    pasteTitle: $('pasteTitle'), pasteAuthor: $('pasteAuthor'), pasteText: $('pasteText'),
    scanPaste: $('scanPaste'), addPaste: $('addPaste'), pageUrl: $('pageUrl'), importPage: $('importPage'),
    fileTitle: $('fileTitle'), fileAuthor: $('fileAuthor'), fileInput: $('fileInput'), dropZone: $('dropZone'),
    status: $('status'), jsonBox: $('jsonBox'), exportJson: $('exportJson'), importJsonFile: $('importJsonFile'),
    copyJson: $('copyJson'), resetAll: $('resetAll'), loadJson: $('loadJson'), bookMeta: $('bookMeta'),
    bookTitle: $('bookTitle'), chapterTitle: $('chapterTitle'), player: $('player'), prevBtn: $('prevBtn'),
    backBtn: $('backBtn'), playBtn: $('playBtn'), fwdBtn: $('fwdBtn'), nextBtn: $('nextBtn'),
    progressText: $('progressText'), speedSelect: $('speedSelect'), chapterFilter: $('chapterFilter'),
    chapterList: $('chapterList'), emptyTemplate: $('emptyTemplate'), themeToggle: $('themeToggle')
  };

  let books = loadJson(STORE_KEY, sampleBooks);
  let state = loadJson(STATE_KEY, { book: 0, chapter: 0, speed: 1, theme: 'dark' });
  let currentBook = clampNumber(state.book, 0, Math.max(books.length - 1, 0));
  let currentChapter = Math.max(0, Number(state.chapter) || 0);
  let restoreAfterMetadata = true;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function loadJson(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : clone(fallback); } catch { return clone(fallback); } }
  function clampNumber(value, min, max) { const number = Number(value) || 0; return Math.max(min, Math.min(number, max)); }
  function activeBook() { return books[currentBook]; }
  function activeChapter() { return activeBook()?.chapters?.[currentChapter]; }
  function positionKey() { const b = activeBook(); const c = activeChapter(); return `${POS_PREFIX}${b?.title || ''}:${c?.title || ''}`; }

  function save() {
    state = { book: currentBook, chapter: currentChapter, speed: Number(dom.speedSelect.value) || 1, theme: document.documentElement.dataset.theme || 'dark' };
    localStorage.setItem(STORE_KEY, JSON.stringify(books));
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    dom.jsonBox.value = JSON.stringify(books, null, 2);
  }

  function showStatus(message, type = '') { dom.status.className = `status ${type}`.trim(); dom.status.textContent = message; dom.status.classList.remove('hidden'); }
  function hideStatus() { dom.status.classList.add('hidden'); }
  function cleanUrl(url) { return String(url).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/^["'(<\[]+/, '').replace(/["')>\]]+$/, '').trim(); }
  function uniqueUrls(urls) { const seen = new Set(); return urls.map(cleanUrl).filter((url) => url && !seen.has(url) && seen.add(url)); }
  function naturalCompare(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }

  function extractAudioLinks(text) {
    const source = String(text || '').replace(/\\\//g, '/').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
    const links = [];
    const absoluteAudio = /https?:\/\/[^\s"'<>]+?\.(?:mp3|m4a|ogg|oga|wav|aac|flac|opus)(?:\?[^\s"'<>]*)?/gi;
    const srcAttribute = /(?:src|href)\s*=\s*["']([^"']+\.(?:mp3|m4a|ogg|oga|wav|aac|flac|opus)(?:\?[^"']*)?)["']/gi;
    let match;
    while ((match = absoluteAudio.exec(source))) links.push(match[0]);
    while ((match = srcAttribute.exec(source))) links.push(match[1]);
    return uniqueUrls(links).sort(naturalCompare);
  }

  function titleFromUrl(url, index) {
    try {
      const file = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || '');
      const base = file.replace(/\.(mp3|m4a|ogg|oga|wav|aac|flac|opus)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      return base ? base.replace(/\b\w/g, (char) => char.toUpperCase()) : `Chapter ${index + 1}`;
    } catch { return `Chapter ${index + 1}`; }
  }

  function makeBook({ title, author = '', source = 'Manual import', urls }) {
    return { title: title || 'Untitled Audiobook', author, source, chapters: urls.map((url, index) => ({ title: titleFromUrl(url, index), url })) };
  }

  function validateLibrary(library) {
    if (!Array.isArray(library)) throw new Error('Library JSON must be an array of books.');
    library.forEach((book, bookIndex) => {
      if (!book || typeof book !== 'object') throw new Error(`Book ${bookIndex + 1} is not an object.`);
      if (!book.title || typeof book.title !== 'string') throw new Error(`Book ${bookIndex + 1} needs a title.`);
      if (!Array.isArray(book.chapters)) throw new Error(`Book “${book.title}” needs a chapters array.`);
      book.chapters.forEach((chapter, chapterIndex) => {
        if (!chapter.title || typeof chapter.title !== 'string') throw new Error(`Chapter ${chapterIndex + 1} in “${book.title}” needs a title.`);
        if (!chapter.url || typeof chapter.url !== 'string') throw new Error(`Chapter ${chapterIndex + 1} in “${book.title}” needs a url.`);
      });
    });
    return library;
  }

  function formatTime(seconds) { if (!Number.isFinite(seconds)) return '0:00'; const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60); return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }

  function renderBookSelect() {
    dom.bookSelect.innerHTML = '';
    dom.deleteBook.disabled = books.length === 0;
    if (!books.length) { const option = document.createElement('option'); option.textContent = 'No books added'; dom.bookSelect.append(option); dom.bookSelect.disabled = true; return; }
    dom.bookSelect.disabled = false;
    books.forEach((book, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = book.author ? `${book.title} — ${book.author}` : book.title; dom.bookSelect.append(option); });
    dom.bookSelect.value = String(currentBook);
  }

  function renderChapterList() {
    dom.chapterList.innerHTML = '';
    const book = activeBook();
    if (!book || !book.chapters.length) { dom.chapterList.append(dom.emptyTemplate.content.cloneNode(true)); return; }
    const filter = dom.chapterFilter.value.trim().toLowerCase();
    let visible = 0;
    book.chapters.forEach((chapter, index) => {
      if (filter && !chapter.title.toLowerCase().includes(filter)) return;
      visible += 1;
      const button = document.createElement('button');
      button.className = `button chapter-button ${index === currentChapter ? 'active' : ''}`.trim();
      button.type = 'button';
      button.innerHTML = '<span></span><small></small>';
      button.querySelector('span').textContent = chapter.title;
      button.querySelector('small').textContent = String(index + 1);
      button.addEventListener('click', () => loadChapter(index, true));
      dom.chapterList.append(button);
    });
    if (!visible) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.innerHTML = '<strong>No matching chapters.</strong><span>Clear the filter to see all chapters.</span>'; dom.chapterList.append(empty); }
  }

  function render() {
    currentBook = clampNumber(currentBook, 0, Math.max(books.length - 1, 0));
    const book = activeBook();
    renderBookSelect(); dom.jsonBox.value = JSON.stringify(books, null, 2);
    if (!book) {
      dom.coverBox.innerHTML = 'AUDIO<br>BOOK<br>PLAYER'; dom.bookMeta.textContent = 'No book selected'; dom.bookTitle.textContent = 'Add a book to start'; dom.chapterTitle.textContent = 'Paste legal audio links or import your own files.'; dom.player.removeAttribute('src'); renderChapterList(); updateProgress(); return;
    }
    currentChapter = clampNumber(currentChapter, 0, Math.max(book.chapters.length - 1, 0));
    const chapter = activeChapter();
    dom.coverBox.innerHTML = book.title.split(/\s+/).filter(Boolean).slice(0, 4).join('<br>') || 'AUDIO<br>BOOK';
    dom.bookMeta.textContent = [book.author, `${book.chapters.length} chapter${book.chapters.length === 1 ? '' : 's'}`, book.source].filter(Boolean).join(' • ');
    dom.bookTitle.textContent = book.title;
    dom.chapterTitle.textContent = chapter ? chapter.title : 'No chapters';
    renderChapterList(); updateProgress();
  }

  function loadChapter(index, autoplay = false) {
    const book = activeBook(); if (!book || !book.chapters[index]) return;
    currentChapter = index; const chapter = activeChapter(); restoreAfterMetadata = true;
    if (dom.player.getAttribute('src') !== chapter.url) { dom.player.setAttribute('src', chapter.url); dom.player.load(); }
    save(); render();
    if (autoplay) dom.player.play().catch(() => showStatus('Your browser blocked autoplay. Press Play to start.', 'bad'));
  }

  function updateProgress() {
    const chapter = activeChapter();
    dom.progressText.textContent = chapter ? `${chapter.title}: ${formatTime(dom.player.currentTime)} / ${formatTime(dom.player.duration)}. Progress saved automatically.` : 'Progress is saved automatically.';
  }

  function setTab(name) {
    [['Paste', dom.tabPaste, dom.pastePanel], ['Page', dom.tabPage, dom.pagePanel], ['Files', dom.tabFiles, dom.filesPanel]].forEach(([tabName, button, panel]) => {
      const active = tabName === name; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); panel.classList.toggle('hidden', !active);
    });
    hideStatus();
  }

  function addBookFromUrls(title, author, urls, source) {
    if (!urls.length) { showStatus('No audio links found. Add direct audio URLs ending in .mp3, .m4a, .ogg, .wav, .aac, .flac, or .opus.', 'bad'); return; }
    const book = makeBook({ title, author, source, urls });
    books.push(book); currentBook = books.length - 1; currentChapter = 0; save(); loadChapter(0, false);
    showStatus(`Added “${book.title}” with ${urls.length} chapter${urls.length === 1 ? '' : 's'}.`, 'ok');
  }

  async function importPage() {
    const url = dom.pageUrl.value.trim(); if (!url) { showStatus('Paste a page URL first.', 'bad'); return; }
    try {
      showStatus('Fetching page and looking for audio links…');
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text(); const urls = extractAudioLinks(html);
      if (!urls.length) { showStatus('Fetched the page, but found no audio links. Try copying the page HTML or direct audio links into Paste links/HTML.', 'bad'); return; }
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().replace(/\s*[-|].*$/, '') : 'Imported Audiobook';
      addBookFromUrls(title, '', urls, new URL(url).hostname);
    } catch (error) { showStatus(`Could not import that page automatically. Many websites block browser fetching with CORS. Copy the legal audio links or page HTML and use Paste links/HTML.\n\nError: ${error.message}`, 'bad'); }
  }

  function addLocalFiles(files) {
    const audioFiles = [...files].filter((file) => file.type.startsWith('audio/') || /\.(mp3|m4a|ogg|oga|wav|aac|flac|opus)$/i.test(file.name));
    if (!audioFiles.length) { showStatus('No audio files selected.', 'bad'); return; }
    audioFiles.sort((a, b) => naturalCompare(a.name, b.name));
    const title = dom.fileTitle.value.trim() || dom.pasteTitle.value.trim() || 'Local Audio Files';
    const author = dom.fileAuthor.value.trim() || dom.pasteAuthor.value.trim();
    const book = { title, author, source: 'Local files', chapters: audioFiles.map((file, index) => ({ title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') || `Chapter ${index + 1}`, url: URL.createObjectURL(file), local: true })) };
    books.push(book); currentBook = books.length - 1; currentChapter = 0; save(); loadChapter(0, false);
    showStatus(`Added ${audioFiles.length} local audio file${audioFiles.length === 1 ? '' : 's'}. Local file links may stop working after a browser reload.`, 'ok');
  }

  function exportLibrary() { const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'audiobook-library.json'; a.click(); URL.revokeObjectURL(url); }
  function loadLibraryFromText(text) { books = validateLibrary(JSON.parse(text)); currentBook = 0; currentChapter = 0; save(); loadChapter(0, false); showStatus('Library loaded.', 'ok'); }

  dom.tabPaste.addEventListener('click', () => setTab('Paste')); dom.tabPage.addEventListener('click', () => setTab('Page')); dom.tabFiles.addEventListener('click', () => setTab('Files'));
  dom.scanPaste.addEventListener('click', () => { const urls = extractAudioLinks(dom.pasteText.value); showStatus(urls.length ? `Found ${urls.length} audio link${urls.length === 1 ? '' : 's'}:\n\n${urls.join('\n')}` : 'No direct audio links found.', urls.length ? 'ok' : 'bad'); });
  dom.addPaste.addEventListener('click', () => addBookFromUrls(dom.pasteTitle.value.trim(), dom.pasteAuthor.value.trim(), extractAudioLinks(dom.pasteText.value), 'Pasted links/HTML'));
  dom.importPage.addEventListener('click', importPage);
  dom.fileInput.addEventListener('change', (event) => addLocalFiles(event.target.files));
  ['dragenter', 'dragover'].forEach((name) => dom.dropZone.addEventListener(name, (event) => { event.preventDefault(); dom.dropZone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((name) => dom.dropZone.addEventListener(name, (event) => { event.preventDefault(); dom.dropZone.classList.remove('dragover'); }));
  dom.dropZone.addEventListener('drop', (event) => addLocalFiles(event.dataTransfer.files));
  dom.bookSelect.addEventListener('change', (event) => { currentBook = Number(event.target.value); currentChapter = 0; save(); loadChapter(0, false); });
  dom.deleteBook.addEventListener('click', () => { const book = activeBook(); if (!book) return; if (confirm(`Delete “${book.title}” from this browser?`)) { books.splice(currentBook, 1); currentBook = Math.max(0, currentBook - 1); currentChapter = 0; save(); if (books.length) loadChapter(0, false); else render(); } });
  dom.exportJson.addEventListener('click', exportLibrary);
  dom.copyJson.addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(books, null, 2)); showStatus('Library JSON copied to clipboard.', 'ok'); } catch { dom.jsonBox.select(); showStatus('Could not use clipboard automatically. The JSON text is selected so you can copy it.', 'bad'); } });
  dom.importJsonFile.addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; try { loadLibraryFromText(await file.text()); } catch (error) { showStatus(`Could not load JSON file: ${error.message}`, 'bad'); } });
  dom.loadJson.addEventListener('click', () => { try { loadLibraryFromText(dom.jsonBox.value); } catch (error) { showStatus(`Bad JSON: ${error.message}`, 'bad'); } });
  dom.resetAll.addEventListener('click', () => { if (confirm('Reset the whole library and listening state?')) { localStorage.removeItem(STORE_KEY); localStorage.removeItem(STATE_KEY); Object.keys(localStorage).filter((key) => key.startsWith(POS_PREFIX)).forEach((key) => localStorage.removeItem(key)); books = clone(sampleBooks); currentBook = 0; currentChapter = 0; save(); loadChapter(0, false); showStatus('Library reset.', 'ok'); } });

  dom.prevBtn.addEventListener('click', () => { if (dom.player.currentTime > 10) dom.player.currentTime = 0; else if (currentChapter > 0) loadChapter(currentChapter - 1, true); });
  dom.backBtn.addEventListener('click', () => { dom.player.currentTime = Math.max(0, dom.player.currentTime - 15); });
  dom.playBtn.addEventListener('click', () => { if (dom.player.paused) dom.player.play().catch(() => showStatus('Press the browser audio play button if playback does not start.', 'bad')); else dom.player.pause(); });
  dom.fwdBtn.addEventListener('click', () => { dom.player.currentTime = Math.min(dom.player.duration || Infinity, dom.player.currentTime + 15); });
  dom.nextBtn.addEventListener('click', () => { const book = activeBook(); if (book && currentChapter < book.chapters.length - 1) loadChapter(currentChapter + 1, true); });
  dom.speedSelect.addEventListener('change', () => { dom.player.playbackRate = Number(dom.speedSelect.value) || 1; save(); });
  dom.chapterFilter.addEventListener('input', renderChapterList);
  dom.player.addEventListener('loadedmetadata', () => { dom.player.playbackRate = Number(dom.speedSelect.value) || 1; if (restoreAfterMetadata) { const saved = Number(localStorage.getItem(positionKey()) || 0); if (saved > 0 && saved < dom.player.duration - 5) dom.player.currentTime = saved; restoreAfterMetadata = false; } updateProgress(); });
  dom.player.addEventListener('timeupdate', () => { if (activeChapter()) localStorage.setItem(positionKey(), String(dom.player.currentTime)); updateProgress(); });
  dom.player.addEventListener('ended', () => { const book = activeBook(); if (book && currentChapter < book.chapters.length - 1) loadChapter(currentChapter + 1, true); });
  dom.player.addEventListener('error', () => { const chapter = activeChapter(); if (chapter) showStatus(`Could not play “${chapter.title}”. Check that the URL is direct audio and allows browser playback.`, 'bad'); });
  dom.themeToggle.addEventListener('click', () => { document.documentElement.dataset.theme = (document.documentElement.dataset.theme || 'dark') === 'dark' ? 'light' : 'dark'; save(); });
  document.addEventListener('keydown', (event) => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return; if (event.code === 'Space') { event.preventDefault(); dom.playBtn.click(); } if (event.code === 'ArrowLeft') dom.backBtn.click(); if (event.code === 'ArrowRight') dom.fwdBtn.click(); });

  document.documentElement.dataset.theme = state.theme || 'dark';
  dom.speedSelect.value = String(state.speed || 1); dom.player.playbackRate = Number(dom.speedSelect.value) || 1;
  save(); render(); if (books.length) loadChapter(currentChapter, false);
})();
