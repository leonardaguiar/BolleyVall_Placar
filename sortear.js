(function(){
  const $ = id => document.getElementById(id);
  const mixed = $('mixed'), trio = $('trio'), fixed = $('fixed'), dynamic = $('dynamic');
  let lines = [];

  // ---------- interface ----------
  function syncUI(){
    $('boxAll').hidden = mixed.checked;
    $('boxMixed').hidden = !mixed.checked;
    fixed.disabled = dynamic.disabled = trio.checked;
    $('modeRow').classList.toggle('off', trio.checked);
  }
  // fixa/dinâmica se comportam como opção única
  fixed.addEventListener('change', ()=>{ dynamic.checked = !fixed.checked; });
  dynamic.addEventListener('change', ()=>{ fixed.checked = !dynamic.checked; });
  mixed.addEventListener('change', syncUI);
  trio.addEventListener('change', syncUI);
  syncUI();

  // ---------- utilitários ----------
  const parse = t => t.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
  function shuffle(a){
    a = a.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }
  function combos(n,k){
    const out = [];
    (function rec(s,cur){
      if(cur.length===k){ out.push(cur.slice()); return; }
      for(let i=s;i<n;i++){ cur.push(i); rec(i+1,cur); cur.pop(); }
    })(0,[]);
    return out;
  }
  function sig(str){
    let h = 5381;
    for(const c of str) h = ((h<<5)+h+c.charCodeAt(0))>>>0;
    return 'BVP-'+h.toString(16).toUpperCase().padStart(8,'0');
  }

  function getPlayers(){
    let list;
    if(mixed.checked){
      list = parse($('namesM').value).map(n=>({n,g:'M'}))
        .concat(parse($('namesF').value).map(n=>({n,g:'F'})));
    }else{
      list = parse($('namesAll').value).map(n=>({n,g:null}));
    }
    const seen = new Set();
    for(const p of list){
      const k = p.n.toLowerCase();
      if(seen.has(k)) throw new Error('Nome repetido: '+p.n+'. Use nomes diferentes (ex.: Ana S. e Ana M.).');
      seen.add(k);
    }
    return list;
  }

  // ---------- dupla fixa: monta as equipes uma vez e sorteia a fila ----------
  function formFixed(P,k,isMixed){
    let pool = shuffle(P);
    const r = pool.length % k;
    const reserve = r ? pool.splice(pool.length-r, r) : [];
    if(isMixed){
      pool = [...shuffle(pool.filter(p=>p.g==='M')), ...shuffle(pool.filter(p=>p.g==='F'))];
    }
    const T = pool.length / k;
    const teams = Array.from({length:T}, ()=>[]);
    pool.forEach((p,i)=> teams[i % T].push(p));
    return { teams: shuffle(teams), reserve };
  }

   // ---------- dupla dinâmica: todas as duplas possíveis, em ordem de fila ----------
  // Prioridades: 1) ninguém repetido em jogos seguidos, 2) cada parceria aparece uma vez,
  // 3) mistas primeiro, 4) participação e espera equilibradas, 5) evitar repetir quem acabou de jogar.
  function genPairs(P,isMixed){
    const n = P.length;
    const rem = combos(n,2);
    const played = new Array(n).fill(0), rest = new Array(n).fill(0);
    const seq = [];
    while(rem.length){
      const recent = new Set();
      for(const t of seq.slice(-2)) t.forEach(i=>recent.add(i));
      let bi = 0, bs = Infinity;
      rem.forEach((c,idx)=>{
        let s = Math.random()*0.5;
        for(const i of c){
          if(recent.has(i)) s += 1e6;
          s += 10*played[i] - 3*rest[i];
        }
        if(isMixed && P[c[0]].g === P[c[1]].g) s += 1e3;
        if(s < bs){ bs = s; bi = idx; }
      });
      const c = rem.splice(bi,1)[0];
      seq.push(c);
      for(let i=0;i<n;i++){ if(c.includes(i)){ played[i]++; rest[i] = 0; } else rest[i]++; }
    }
    return seq.map(c=>c.map(i=>P[i]));
  }

  // ---------- resultado ----------
  function build(){
    const P = getPlayers();
    const isTrio = trio.checked, k = isTrio ? 3 : 2;
    const isFixed = isTrio || fixed.checked, isMixed = mixed.checked;
    const unit = isTrio ? 'Trio' : 'Dupla';

    if(isMixed && (!P.some(p=>p.g==='M') || !P.some(p=>p.g==='F'))){
      throw new Error('No sorteio misto, informe homens e mulheres (ou desmarque "Priorizar misto").');
    }
    if(P.length < 2*k){
      throw new Error('Informe pelo menos '+(2*k)+' jogadores para sortear '+(isTrio ? 'trios' : 'duplas')+'.');
    }

    const nm = t => t.map(p=>p.n).join(' + ');
    const modo = isTrio ? 'Trio (fixo)' : fixed.checked ? 'Dupla fixa' : 'Dupla dinâmica';
    const L = [
      ['title','Sorteio de times'],
      ['m','Filtros: '+modo+' | Priorizar misto: '+(isMixed ? 'sim' : 'não')+' | '+P.length+' jogadores']
    ];

    if(isFixed){
      const { teams, reserve } = formFixed(P,k,isMixed);
      L.push(['h','JOGO 1'], ['t',unit+' 1: '+nm(teams[0])], ['t',unit+' 2: '+nm(teams[1])]);
      if(teams.length > 2){
        L.push(['h','FILA (ordem de entrada)']);
        teams.slice(2).forEach((t,i)=> L.push(['t',(i+1)+'º - '+unit+' '+(i+3)+': '+nm(t)]));
      }
      if(reserve.length) L.push(['h','RESERVAS'], ['t',reserve.map(p=>p.n).join(', ')]);
      L.push(['m','O vencedor enfrenta o próximo da fila.']);
    }else{
      const seq = genPairs(P,isMixed);
      L.push(['h','JOGO 1'], ['t','Dupla 1: '+nm(seq[0])], ['t','Dupla 2: '+nm(seq[1])]);
      if(seq.length > 2){
        L.push(['h','FILA (ordem de entrada)']);
        seq.slice(2).forEach((t,i)=> L.push(['t',(i+1)+'º - Dupla '+(i+3)+': '+nm(t)]));
      }
      L.push(['m',seq.length+' duplas possíveis: todos jogam com todos. O vencedor enfrenta a próxima dupla da fila.']);
    }

    const body = L.map(x=>x[1]).join('|');
    L.push(['sig','Sorteio gerado pelo app BolleyVall Placar em '+new Date().toLocaleString('pt-BR')+' | Assinatura '+sig(body)]);
    return L;
  }

  const toText = L => L.map(([t,s])=>(t==='h' ? '\n' : '')+s).join('\n').replace(/\n{3,}/g,'\n\n');

  $('go').addEventListener('click', ()=>{
    try{
      lines = build();
      $('err').hidden = true;
      $('resultText').textContent = toText(lines);
      $('result').hidden = false;
      $('result').scrollIntoView({behavior:'smooth'});
    }catch(e){
      $('err').textContent = e.message;
      $('err').hidden = false;
      $('result').hidden = true;
    }
  });

  // ---------- copiar ----------
  $('copyBtn').addEventListener('click', async ()=>{
    const txt = toText(lines), btn = $('copyBtn');
    try{ await navigator.clipboard.writeText(txt); }
    catch(e){
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    btn.textContent = 'Copiado!';
    setTimeout(()=> btn.textContent = 'Copiar', 1500);
  });

  // ---------- PDF ----------
  $('pdfBtn').addEventListener('click', ()=>{
    if(!window.jspdf){ alert('Não foi possível carregar a biblioteca de PDF. Verifique a conexão e tente de novo.'); return; }
    const doc = new window.jspdf.jsPDF({unit:'mm', format:'a4'});
    const x = 18, W = 174;
    let y = 20;
    const need = h => { if(y+h > 282){ doc.addPage(); y = 20; } };

    lines.forEach(([t,s])=>{
      if(t==='title'){
        doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(0);
        need(10); doc.text(s,x,y); y += 10;
      }else if(t==='h'){
        y += 3;
        doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(0);
        need(8); doc.text(s,x,y); y += 7;
      }else{
        const meta = (t==='m' || t==='sig');
        doc.setFont('helvetica', t==='sig' ? 'italic' : 'normal');
        doc.setFontSize(meta ? 9 : 11);
        doc.setTextColor(meta ? 110 : 0);
        if(t==='sig'){ y += 6; need(10); doc.setDrawColor(180); doc.line(x,y-4,x+W,y-4); }
        const rows = doc.splitTextToSize(s, W);
        rows.forEach(r=>{ need(6); doc.text(r,x,y); y += meta ? 5 : 6; });
      }
    });
    doc.save('sorteio-bolleyvall.pdf');
  });
})();
