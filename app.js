(function(){
  function syncSize(){
    document.documentElement.style.setProperty('--app-w', window.innerWidth+'px');
    document.documentElement.style.setProperty('--app-h', window.innerHeight+'px');
  }
  syncSize();
  window.addEventListener('resize', syncSize);
  window.addEventListener('orientationchange', ()=> setTimeout(syncSize,50));
  if(window.visualViewport){ window.visualViewport.addEventListener('resize', syncSize); }

  let wakeLock = null;
  async function requestWakeLock(){
    try{
      if('wakeLock' in navigator){ wakeLock = await navigator.wakeLock.request('screen'); }
    }catch(e){ /* not supported / denied */ }
  }
  requestWakeLock();
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') requestWakeLock();
  });
  document.addEventListener('pointerdown', ()=>{ if(!wakeLock) requestWakeLock(); }, {passive:true});

  const state = { a:0, b:0, seconds:0, running:false };
  let timerInterval = null;

  const scoreEl = { a: document.getElementById('scoreA'), b: document.getElementById('scoreB') };
  const panelEl = { a: document.getElementById('panelA'), b: document.getElementById('panelB') };
  const nameEl  = { a: document.getElementById('nameA'), b: document.getElementById('nameB') };
  const timerEl = document.getElementById('timer');

  // --- auto-save (rede de segurança contra a aba ser descartada pelo sistema) ---
  const STORAGE_KEY = 'placar-volei-state-v1';
  function saveState(){
    try{
      const css = getComputedStyle(document.documentElement);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        a: state.a, b: state.b, seconds: state.seconds, running: state.running,
        nameA: nameEl.a.textContent, nameB: nameEl.b.textContent,
        colorA: css.getPropertyValue('--team-a').trim(),
        colorADim: css.getPropertyValue('--team-a-dim').trim(),
        colorB: css.getPropertyValue('--team-b').trim(),
        colorBDim: css.getPropertyValue('--team-b-dim').trim()
      }));
    }catch(e){ /* localStorage indisponível (ex: modo privado) — ignora */ }
  }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      const s = JSON.parse(raw);
      state.a = s.a||0; state.b = s.b||0; state.seconds = s.seconds||0;
      scoreEl.a.textContent = state.a; scoreEl.b.textContent = state.b;
      timerEl.textContent = fmt(state.seconds);
      if(s.nameA) nameEl.a.textContent = s.nameA;
      if(s.nameB) nameEl.b.textContent = s.nameB;
      if(s.colorA) document.documentElement.style.setProperty('--team-a', s.colorA);
      if(s.colorADim) document.documentElement.style.setProperty('--team-a-dim', s.colorADim);
      if(s.colorB) document.documentElement.style.setProperty('--team-b', s.colorB);
      if(s.colorBDim) document.documentElement.style.setProperty('--team-b-dim', s.colorBDim);
      if(s.running) startTimer();
    }catch(e){ /* estado salvo corrompido — ignora e segue com o padrão */ }
  }
  function clearState(){
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  }

  function fmt(s){
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const r = (s%60).toString().padStart(2,'0');
    return m+':'+r;
  }
  function startTimer(){
    if(state.running) return;
    state.running = true;
    timerEl.classList.add('running');
    timerInterval = setInterval(()=>{
      state.seconds++;
      timerEl.textContent = fmt(state.seconds);
      saveState();
    },1000);
    saveState();
  }
  function pauseTimer(){
    state.running = false;
    timerEl.classList.remove('running');
    clearInterval(timerInterval);
    saveState();
  }
  timerEl.addEventListener('click', ()=> state.running ? pauseTimer() : startTimer());

  function pulse(key){
    scoreEl[key].classList.add('pulse');
    setTimeout(()=>scoreEl[key].classList.remove('pulse'),120);
  }
  function addPoint(key, delta){
    state[key] = Math.max(0, state[key]+delta);
    scoreEl[key].textContent = state[key];
    pulse(key);
    if(!state.running) startTimer();
    saveState();
  }

  panelEl.a.addEventListener('click', ()=> addPoint('a', 1));
  panelEl.b.addEventListener('click', ()=> addPoint('b', 1));

  document.querySelectorAll('.stepper button').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      addPoint(btn.dataset.key, parseInt(btn.dataset.delta,10));
    });
  });

  [ ['a', nameEl.a], ['b', nameEl.b] ].forEach(([key, el])=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      el.setAttribute('contenteditable','true');
      el.focus();
      document.execCommand('selectAll', false, null);
    });
    el.addEventListener('blur', ()=>{
      el.setAttribute('contenteditable','false');
      if(!el.textContent.trim()) el.textContent = key==='a' ? 'Time 1' : 'Time 2';
      saveState();
    });
    el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); el.blur(); } });
  });

  const PALETTE = ['#2F6FED','#E5484D','#2FB67C','#B23FED','#F2A93B','#3FA9F5'];
  function shade(hex, factor){
    const n = parseInt(hex.slice(1),16);
    const r = Math.round(((n>>16)&255)*factor);
    const g = Math.round(((n>>8)&255)*factor);
    const b = Math.round((n&255)*factor);
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  function setupPicker(team, dotsBtnId, swatchesId){
    const btn = document.getElementById(dotsBtnId);
    const box = document.getElementById(swatchesId);
    PALETTE.forEach(c=>{
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.background = c;
      sw.addEventListener('click', e=>{
        e.stopPropagation();
        document.documentElement.style.setProperty('--team-'+team, c);
        document.documentElement.style.setProperty('--team-'+team+'-dim', shade(c,0.62));
        box.classList.remove('open');
        saveState();
      });
      box.appendChild(sw);
    });
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      box.classList.toggle('open');
    });
  }
  setupPicker('a','dotsA','swatchesA');
  setupPicker('b','dotsB','swatchesB');
  document.addEventListener('click', ()=>{
    document.getElementById('swatchesA').classList.remove('open');
    document.getElementById('swatchesB').classList.remove('open');
  });

  const overlay = document.getElementById('modalOverlay');
  document.getElementById('resetBtn').addEventListener('click', ()=> overlay.classList.add('open'));
  document.getElementById('cancelReset').addEventListener('click', ()=> overlay.classList.remove('open'));
  document.getElementById('confirmReset').addEventListener('click', ()=>{
    state.a = 0; state.b = 0; state.seconds = 0;
    scoreEl.a.textContent = 0; scoreEl.b.textContent = 0;
    pauseTimer();
    timerEl.textContent = '00:00';
    overlay.classList.remove('open');
    clearState();
  });

  loadState();
})();
