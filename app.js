(() => {
  const $ = (id) => document.getElementById(id);
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');

  const state = {
    voices: [],
    selectedVoiceURI: localStorage.getItem('voiceURI') || '',
    rate: parseFloat(localStorage.getItem('rate') || '1'),
    accent: localStorage.getItem('accent') || 'en-US',
    currentCategory: Object.keys(window.WORD_LIBRARY)[0],
    practiceWord: null,
    bestStreak: parseInt(localStorage.getItem('bestStreak') || '0', 10),
    streak: 0,
    todayKey: new Date().toISOString().slice(0, 10),
    todayCount: 0,
    recognition: null,
    recognizing: false,
    premiumEnabled: localStorage.getItem('premiumEnabled') === '1',
    workerUrl: (localStorage.getItem('workerUrl') || '').trim(),
    premiumVoice: localStorage.getItem('premiumVoice') || 'Kore',
    premiumDisabledUntil: 0,
    audioCache: new Map(),
    currentAudio: null
  };

  // Restore today's count
  try {
    const saved = JSON.parse(localStorage.getItem('todayStats') || '{}');
    if (saved.date === state.todayKey) state.todayCount = saved.count || 0;
  } catch (_) {}

  // ---------- Tabs ----------
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panels.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('tab-' + t.dataset.tab).classList.add('active');
    });
  });

  // ---------- Voices / TTS ----------
  function loadVoices() {
    state.voices = (speechSynthesis.getVoices() || []).filter(v => v.lang.startsWith('en'));
    const sel = $('voiceSelect');
    sel.innerHTML = '';
    if (!state.voices.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Default system voice';
      sel.appendChild(opt);
      return;
    }
    state.voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === state.selectedVoiceURI) opt.selected = true;
      sel.appendChild(opt);
    });
    if (!state.selectedVoiceURI) {
      const preferred = state.voices.find(v => /Google.*US English/i.test(v.name))
        || state.voices.find(v => v.lang === 'en-US')
        || state.voices[0];
      if (preferred) {
        state.selectedVoiceURI = preferred.voiceURI;
        sel.value = preferred.voiceURI;
        localStorage.setItem('voiceURI', preferred.voiceURI);
      }
    }
  }

  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  $('voiceSelect').addEventListener('change', (e) => {
    state.selectedVoiceURI = e.target.value;
    localStorage.setItem('voiceURI', state.selectedVoiceURI);
  });

  $('rateRange').value = state.rate;
  $('rateValue').textContent = state.rate.toFixed(2) + '×';
  $('rateRange').addEventListener('input', (e) => {
    state.rate = parseFloat(e.target.value);
    $('rateValue').textContent = state.rate.toFixed(2) + '×';
    localStorage.setItem('rate', String(state.rate));
  });

  $('accentSelect').value = state.accent;
  $('accentSelect').addEventListener('change', (e) => {
    state.accent = e.target.value;
    localStorage.setItem('accent', state.accent);
  });

  $('resetProgressBtn').addEventListener('click', () => {
    if (!confirm('Reset all progress and settings?')) return;
    localStorage.clear();
    location.reload();
  });

  // Premium voice settings
  $('premiumToggle').checked = state.premiumEnabled;
  $('workerUrlInput').value = state.workerUrl;
  $('premiumVoiceSelect').value = state.premiumVoice;

  $('premiumToggle').addEventListener('change', (e) => {
    state.premiumEnabled = e.target.checked;
    localStorage.setItem('premiumEnabled', state.premiumEnabled ? '1' : '0');
    refreshPremiumStatus();
  });
  $('workerUrlInput').addEventListener('change', (e) => {
    state.workerUrl = e.target.value.trim().replace(/\/+$/, '');
    localStorage.setItem('workerUrl', state.workerUrl);
    state.audioCache.clear();
    refreshPremiumStatus();
  });
  $('premiumVoiceSelect').addEventListener('change', (e) => {
    state.premiumVoice = e.target.value;
    localStorage.setItem('premiumVoice', state.premiumVoice);
    state.audioCache.clear();
  });
  $('testPremiumBtn').addEventListener('click', async () => {
    if (!state.workerUrl) { toast('Enter your worker URL first.'); return; }
    const status = $('premiumStatus');
    status.textContent = 'Calling worker…';
    try {
      await speakPremium('This is the premium voice from Gemini.', { force: true });
      status.textContent = 'Worker is reachable. Premium voice ready.';
      status.style.color = 'var(--good)';
    } catch (err) {
      status.textContent = 'Worker call failed: ' + err.message;
      status.style.color = 'var(--bad)';
    }
  });
  refreshPremiumStatus();

  function refreshPremiumStatus() {
    const status = $('premiumStatus');
    if (!state.premiumEnabled) {
      status.textContent = 'Premium off — using device voice.';
      status.style.color = '';
    } else if (!state.workerUrl) {
      status.textContent = 'Add your TTS worker URL to enable premium voice.';
      status.style.color = 'var(--warn)';
    } else {
      status.textContent = 'Premium on. Tap "Test premium voice" to verify.';
      status.style.color = '';
    }
  }

  function stopAllAudio() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (state.currentAudio) {
      try { state.currentAudio.pause(); } catch (_) {}
      state.currentAudio = null;
    }
  }

  function speak(text) {
    stopAllAudio();
    const usePremium =
      state.premiumEnabled &&
      state.workerUrl &&
      Date.now() > state.premiumDisabledUntil;

    if (usePremium) {
      speakPremium(text).catch((err) => {
        // Cool-down: don't keep slamming a broken worker for 60s.
        state.premiumDisabledUntil = Date.now() + 60_000;
        toast('Premium voice unavailable, using device voice (' + err.message + ').');
        speakDevice(text);
      });
    } else {
      speakDevice(text);
    }
  }

  function speakDevice(text) {
    if (!('speechSynthesis' in window)) {
      toast('This browser does not support speech synthesis.');
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const voice = state.voices.find(v => v.voiceURI === state.selectedVoiceURI);
    if (voice) u.voice = voice;
    u.rate = state.rate;
    u.pitch = 1;
    u.lang = (voice && voice.lang) || state.accent || 'en-US';
    speechSynthesis.speak(u);
  }

  async function speakPremium(text, opts = {}) {
    const cacheKey = state.premiumVoice + '\n' + text;
    let url = state.audioCache.get(cacheKey);
    if (!url) {
      const res = await fetch(state.workerUrl + '/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: state.premiumVoice })
      });
      if (!res.ok) {
        let detail = res.status + '';
        try {
          const j = await res.json();
          detail = j.error || detail;
          if (j.error === 'daily_limit_reached') detail = 'daily cap reached';
        } catch (_) {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      state.audioCache.set(cacheKey, url);
    }
    await new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.playbackRate = state.rate;
      audio.onended = () => { state.currentAudio = null; resolve(); };
      audio.onerror = () => reject(new Error('audio playback failed'));
      state.currentAudio = audio;
      audio.play().catch(reject);
    });
  }

  // ---------- Library ----------
  function renderCategoryBar() {
    const bar = $('categoryBar');
    bar.innerHTML = '';
    Object.keys(window.WORD_LIBRARY).forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (cat === state.currentCategory ? ' active' : '');
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        state.currentCategory = cat;
        renderCategoryBar();
        renderWordList();
      });
      bar.appendChild(chip);
    });
  }

  function renderWordList() {
    const list = $('wordList');
    list.innerHTML = '';
    const words = window.WORD_LIBRARY[state.currentCategory] || [];
    words.forEach(item => {
      const li = document.createElement('li');
      li.className = 'word-item';
      li.innerHTML = `
        <div class="word-text">
          <div class="word"></div>
          <div class="ipa"></div>
          <div class="meaning"></div>
        </div>
        <div class="word-actions">
          <button class="btn small primary" aria-label="Listen">▶</button>
          <button class="btn small" aria-label="Practice">Practice</button>
        </div>`;
      li.querySelector('.word').textContent = item.word;
      li.querySelector('.ipa').textContent = item.ipa;
      li.querySelector('.meaning').textContent = item.meaning;
      const [listenBtn, practiceBtn] = li.querySelectorAll('button');
      listenBtn.addEventListener('click', () => speak(item.word));
      practiceBtn.addEventListener('click', () => {
        startPractice(item);
        document.querySelector('.tab[data-tab="practice"]').click();
      });
      list.appendChild(li);
    });
  }

  // ---------- Practice ----------
  function pickRandomWord() {
    const allCats = Object.keys(window.WORD_LIBRARY);
    const cat = allCats[Math.floor(Math.random() * allCats.length)];
    const arr = window.WORD_LIBRARY[cat];
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function startPractice(item) {
    const word = item || pickRandomWord();
    state.practiceWord = word;
    $('practiceWord').textContent = word.word;
    $('practiceIpa').textContent = word.ipa || '';
    $('practiceMeaning').textContent = word.meaning || '';
    $('practiceResult').textContent = '';
    $('practiceResult').className = 'result';
    $('practiceTranscript').innerHTML = '';
    $('practiceScoreFill').style.width = '0%';
  }
  $('practiceNextBtn').addEventListener('click', () => startPractice());
  $('practiceListenBtn').addEventListener('click', () => {
    if (state.practiceWord) speak(state.practiceWord.word);
  });
  $('practiceRecordBtn').addEventListener('click', () => {
    if (!state.practiceWord) startPractice();
    toggleRecord({
      target: state.practiceWord.word,
      btn: $('practiceRecordBtn'),
      resultEl: $('practiceResult'),
      transcriptEl: $('practiceTranscript'),
      scoreEl: $('practiceScoreFill'),
      onScore: handlePracticeScore
    });
  });

  function handlePracticeScore(score) {
    if (score >= 80) {
      state.streak += 1;
      if (state.streak > state.bestStreak) {
        state.bestStreak = state.streak;
        localStorage.setItem('bestStreak', String(state.bestStreak));
      }
    } else {
      state.streak = 0;
    }
    state.todayCount += 1;
    localStorage.setItem('todayStats', JSON.stringify({ date: state.todayKey, count: state.todayCount }));
    $('bestStreak').textContent = state.bestStreak;
    $('todayCount').textContent = state.todayCount;
  }

  // ---------- Custom ----------
  $('customListenBtn').addEventListener('click', () => {
    const text = $('customInput').value.trim();
    if (!text) { toast('Type something first.'); return; }
    speak(text);
  });
  $('customRecordBtn').addEventListener('click', () => {
    const text = $('customInput').value.trim();
    if (!text) { toast('Type something first.'); return; }
    toggleRecord({
      target: text,
      btn: $('customRecordBtn'),
      resultEl: $('customResult'),
      transcriptEl: $('customTranscript'),
      scoreEl: $('customScoreFill')
    });
  });

  // ---------- Speech Recognition ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function toggleRecord({ target, btn, resultEl, transcriptEl, scoreEl, onScore }) {
    if (!SR) {
      resultEl.textContent = 'Speech recognition not supported in this browser. Try Chrome on Android.';
      resultEl.className = 'result warn';
      return;
    }
    if (state.recognizing) {
      try { state.recognition.stop(); } catch (_) {}
      return;
    }

    const rec = new SR();
    rec.lang = state.accent || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    state.recognition = rec;
    state.recognizing = true;
    btn.classList.add('recording');
    const lbl = btn.querySelector('.record-label');
    if (lbl) lbl.textContent = 'Stop';
    resultEl.textContent = 'Listening… speak now.';
    resultEl.className = 'result';
    transcriptEl.innerHTML = '';

    let bestScore = 0;
    let bestHeard = '';

    rec.onresult = (e) => {
      const alts = e.results[0];
      for (let i = 0; i < alts.length; i++) {
        const heard = alts[i].transcript;
        const s = scorePronunciation(target, heard);
        if (s > bestScore) { bestScore = s; bestHeard = heard; }
      }
    };
    rec.onerror = (e) => {
      resultEl.className = 'result bad';
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        resultEl.textContent = 'Microphone permission denied.';
      } else if (e.error === 'no-speech') {
        resultEl.textContent = 'No speech detected. Try again.';
      } else {
        resultEl.textContent = 'Error: ' + e.error;
      }
    };
    rec.onend = () => {
      state.recognizing = false;
      btn.classList.remove('recording');
      if (lbl) lbl.textContent = 'Record';
      if (bestHeard) {
        renderResult(target, bestHeard, bestScore, resultEl, transcriptEl, scoreEl);
        if (onScore) onScore(bestScore);
      }
    };

    try { rec.start(); }
    catch (err) {
      state.recognizing = false;
      btn.classList.remove('recording');
      resultEl.textContent = 'Could not start microphone.';
      resultEl.className = 'result bad';
    }
  }

  function renderResult(target, heard, score, resultEl, transcriptEl, scoreEl) {
    scoreEl.style.width = Math.max(2, Math.min(100, score)) + '%';
    let label, cls;
    if (score >= 90)      { label = `Excellent! ${score}%`; cls = 'good'; }
    else if (score >= 75) { label = `Great! ${score}%`;     cls = 'good'; }
    else if (score >= 55) { label = `Close — ${score}%. Try again.`; cls = 'warn'; }
    else                  { label = `Not quite — ${score}%. Listen and try again.`; cls = 'bad'; }
    resultEl.textContent = label;
    resultEl.className = 'result ' + cls;
    transcriptEl.innerHTML = `Heard: <span class="heard">${diffWords(target, heard)}</span>`;
  }

  // Pronunciation scoring: word-overlap + Levenshtein on normalized phonetic-ish strings.
  function normalize(s) {
    return s.toLowerCase()
      .replace(/[^a-z0-9'\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    const v0 = new Array(bl + 1);
    const v1 = new Array(bl + 1);
    for (let i = 0; i <= bl; i++) v0[i] = i;
    for (let i = 0; i < al; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < bl; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= bl; j++) v0[j] = v1[j];
    }
    return v1[bl];
  }
  function scorePronunciation(target, heard) {
    const t = normalize(target);
    const h = normalize(heard);
    if (!t || !h) return 0;
    const charScore = 1 - (levenshtein(t, h) / Math.max(t.length, h.length));
    const tWords = t.split(' ');
    const hWords = h.split(' ');
    let matched = 0;
    tWords.forEach(tw => {
      const idx = hWords.findIndex(hw => hw === tw || levenshtein(hw, tw) <= Math.max(1, Math.floor(tw.length * 0.25)));
      if (idx !== -1) { matched++; hWords.splice(idx, 1); }
    });
    const wordScore = matched / tWords.length;
    return Math.round((charScore * 0.55 + wordScore * 0.45) * 100);
  }
  function diffWords(target, heard) {
    const t = normalize(target).split(' ');
    const h = normalize(heard).split(' ');
    const used = new Array(h.length).fill(false);
    return t.map(tw => {
      const idx = h.findIndex((hw, i) => !used[i] && (hw === tw || levenshtein(hw, tw) <= Math.max(1, Math.floor(tw.length * 0.25))));
      if (idx !== -1) {
        used[idx] = true;
        return `<span class="diff-good">${escapeHtml(h[idx])}</span>`;
      }
      return `<span class="diff-bad">${escapeHtml(tw)}</span>`;
    }).join(' ');
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Init ----------
  renderCategoryBar();
  renderWordList();
  $('bestStreak').textContent = state.bestStreak;
  $('todayCount').textContent = state.todayCount;

  if (!SR) {
    const note = 'Tip: pronunciation scoring needs Chrome (Android) or another browser with the Web Speech API.';
    setTimeout(() => toast(note), 600);
  }
})();
