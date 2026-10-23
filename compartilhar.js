// compartilhar.js - compartilha o SORTEIO (não o andamento) por link.
//
// Os dados do sorteio vão dentro do próprio link, depois do "#", compactados e em base64.
// O que fica depois do "#" não é enviado ao servidor: só viaja no link.
// Quem abre o link recebe as mesmas equipes e a mesma fila, e começa o acompanhamento do zero.
const Compartilhar = (function () {
  'use strict';

  const PREFIXO_HASH = '#sorteio=';
  const VERSAO_DO_FORMATO = 1;

  // O link é gerado logo depois do sorteio. Assim o botão responde na hora,
  // o que é necessário para o menu de compartilhar do celular abrir.
  let linkPronto = null;

  // ---------- conversões de texto e bytes ----------
  function bytesParaBase64Url(bytes) {
    let texto = '';
    bytes.forEach(byte => { texto += String.fromCharCode(byte); });
    return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlParaBytes(base64Url) {
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const texto = atob(base64);
    const bytes = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
    return bytes;
  }

  // ---------- compactação (deixa o link bem menor) ----------
  async function lerFluxoComoBytes(fluxo) {
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }

  function comprimir(bytes) {
    const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return lerFluxoComoBytes(fluxo);
  }

  function descomprimir(bytes) {
    const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return lerFluxoComoBytes(fluxo);
  }

  // O código começa com uma letra: "z" = compactado, "p" = texto puro (navegador sem compactação).
  async function codificar(dados) {
    const bytes = new TextEncoder().encode(JSON.stringify(dados));
    if (typeof CompressionStream === 'function') {
      return 'z' + bytesParaBase64Url(await comprimir(bytes));
    }
    return 'p' + bytesParaBase64Url(bytes);
  }

  async function decodificar(codigo) {
    const tipo = codigo.charAt(0);
    const bytes = base64UrlParaBytes(codigo.slice(1));
    if (tipo === 'z' && typeof DecompressionStream !== 'function') {
      throw new Error('Este navegador não consegue abrir o link compactado.');
    }
    const util = (tipo === 'z') ? await descomprimir(bytes) : bytes;
    return JSON.parse(new TextDecoder().decode(util));
  }

  // ---------- validação do que chega pelo link ----------
  function ehListaDeNomes(time) {
    return Array.isArray(time) && time.length > 0 && time.every(nome => typeof nome === 'string');
  }

  function ehFaseValida(fase) {
    return fase
      && (fase.modo === 'fila' || fase.modo === 'jogo')
      && typeof fase.titulo === 'string'
      && Array.isArray(fase.times)
      && fase.times.length >= 2
      && fase.times.every(ehListaDeNomes);
  }

  function ehLinhaValida(linha) {
    return Array.isArray(linha) && typeof linha[0] === 'string' && typeof linha[1] === 'string';
  }

  function dadosSaoValidos(dados) {
    return !!dados
      && dados.v === VERSAO_DO_FORMATO
      && !!dados.plano
      && typeof dados.plano.unit === 'string'
      && Array.isArray(dados.plano.fases)
      && dados.plano.fases.length > 0
      && dados.plano.fases.every(ehFaseValida)
      && Array.isArray(dados.linhas)
      && dados.linhas.every(ehLinhaValida);
  }

  // ---------- gerar o link ----------
  async function gerarLink() {
    const sorteio = Fila.obterSorteio();     // { plano, linhas } ou null
    if (!sorteio) return null;
    const codigo = await codificar({ v: VERSAO_DO_FORMATO, plano: sorteio.plano, linhas: sorteio.linhas });
    return location.href.split('#')[0] + PREFIXO_HASH + codigo;
  }

  async function prepararLink() {
    linkPronto = null;
    try { linkPronto = await gerarLink(); } catch (erro) { linkPronto = null; }
  }

  // ---------- botão "Compartilhar sorteio" ----------
  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (erro) {
      const campo = document.createElement('textarea');
      campo.value = texto;
      document.body.appendChild(campo);
      campo.select();
      const copiou = document.execCommand('copy');
      campo.remove();
      return copiou;
    }
  }

  function mostrarAvisoNoBotao(botao, texto) {
    const original = botao.textContent;
    botao.textContent = texto;
    setTimeout(() => { botao.textContent = original; }, 1800);
  }

// o menu de compartilhar do sistema só é usado em celular/tablet; no PC o link é copiado
  function ehCelularOuTablet() {
    const agente = navigator.userAgent;
    const ehAndroidOuIphone = /android|iphone|ipad|ipod/i.test(agente);
    const ehIpadComoMac = /macintosh/i.test(agente) && navigator.maxTouchPoints > 1;
    return ehAndroidOuIphone || ehIpadComoMac;
  }

  async function compartilhar(botao) {
    const link = linkPronto || await gerarLink();
    if (!link) {
      alert('Faça o sorteio antes de compartilhar.');
      return;
    }

    if (navigator.share && ehCelularOuTablet()) {
      try {
        await navigator.share({ title: 'Sorteio de times', text: 'Sorteio de times - BolleyVall Placar', url: link });
        return;
      } catch (erro) {
        if (erro.name === 'AbortError') return;   // a pessoa fechou o menu de compartilhar
        // qualquer outro erro: cai para copiar o link
      }
    }

    const copiou = await copiarTexto(link);
    mostrarAvisoNoBotao(botao, copiou ? 'Link copiado!' : 'Não foi possível copiar');
  }

  // ---------- abrir um link recebido ----------
  // Devolve { plano, linhas }, ou null se a página não foi aberta por um link de sorteio.
  // Lança erro se o link existir mas estiver incompleto ou inválido.
  async function lerDoLink() {
    if (location.hash.indexOf(PREFIXO_HASH) !== 0) return null;
    const dados = await decodificar(location.hash.slice(PREFIXO_HASH.length));
    if (!dadosSaoValidos(dados)) throw new Error('Sorteio inválido');
    return { plano: dados.plano, linhas: dados.linhas };
  }

  // Tira o código do endereço, para recarregar a página não importar o sorteio de novo.
  function limparLinkDaBarra() {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  return {
    prepararLink: prepararLink,
    compartilhar: compartilhar,
    lerDoLink: lerDoLink,
    limparLinkDaBarra: limparLinkDaBarra
  };
})();
