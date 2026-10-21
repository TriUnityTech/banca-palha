// Servidor local da Banca de Palha. Sem dependências: só o Node.
// Guarda tudo em dados/banco.json e faz uma cópia por dia em dados/copias/.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA = Number(process.env.PORTA || 4180);
const HOST = process.env.HOST || '127.0.0.1'; // para abrir na rede da banca: HOST=0.0.0.0
const RAIZ = path.join(__dirname, 'public');
const PASTA_DADOS = path.join(__dirname, 'dados');
const ARQUIVO = path.join(PASTA_DADOS, 'banco.json');
const COPIAS = path.join(PASTA_DADOS, 'copias');
fs.mkdirSync(COPIAS, { recursive: true });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function lerBanco() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')); } catch { return null; }
}
function gravarBanco(obj) {
  const hoje = new Date().toISOString().slice(0, 10);
  const copia = path.join(COPIAS, 'banco-' + hoje + '.json');
  if (fs.existsSync(ARQUIVO) && !fs.existsSync(copia)) fs.copyFileSync(ARQUIVO, copia);
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, ARQUIVO);
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/banco') {
    if (req.method === 'GET') {
      const b = lerBanco();
      return json(res, 200, b || { vazio: true });
    }
    if (req.method === 'PUT') {
      let corpo = '';
      req.on('data', (c) => { corpo += c; if (corpo.length > 60e6) req.destroy(); });
      req.on('end', () => {
        try {
          const novo = JSON.parse(corpo);
          const atual = lerBanco();
          const revAtual = atual ? atual.rev || 0 : 0;
          if (atual && (novo.baseRev || 0) !== revAtual) return json(res, 409, { erro: 'conflito', rev: revAtual });
          delete novo.baseRev;
          novo.rev = revAtual + 1;
          gravarBanco(novo);
          json(res, 200, { rev: novo.rev });
        } catch (e) { json(res, 400, { erro: 'dados inválidos' }); }
      });
      return;
    }
    return json(res, 405, { erro: 'método não permitido' });
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const arq = path.normalize(path.join(RAIZ, rel));
  if (!arq.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  fs.readFile(arq, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

servidor.listen(PORTA, HOST, () => {
  console.log('Banca de Palha rodando em http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORTA);
  console.log('Seus dados ficam em: ' + ARQUIVO);
  console.log('Para fechar, feche esta janela.');
});
