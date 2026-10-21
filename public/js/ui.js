/* Ajudas de tela: formatação, formulários, janelas, avisos e gráfico. */
(function (root) {
  'use strict';
  const D = root.Domain;
  const U = {};

  /* ---------- formatação ---------- */
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.brl = (c) => (c == null ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100));
  U.n = (v, dec = 3) => (v == null ? '-' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: dec }).format(v));
  U.q = (v, un) => U.n(v) + ' ' + un;
  U.kg = (v) => U.n(v) + ' kg';
  U.pct = (v) => (v == null ? '-' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%');
  U.pp = (v) => (v == null ? '-' : (v > 0 ? '+' : v < 0 ? '-' : '') + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(v)) + ' pontos');
  U.data = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '-');
  U.mes = (m) => { const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return nomes[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4); };
  U.dataHora = (iso) => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  U.icon = (n) => '<i class="ph ph-' + n + '" aria-hidden="true"></i>';
  U.badge = (txt, tipo) => '<span class="badge ' + (tipo || '') + '">' + U.esc(txt) + '</span>';
  U.provisorio = () => U.badge('Provisório', 'warn');
  U.estimativa = () => U.badge('Estimativa', 'info');

  U.parseNum = function (txt) {
    if (txt == null) return null;
    let t = String(txt).trim().replace(/\s/g, '').replace(/^R\$/, '');
    if (t === '') return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error('Número inválido: "' + txt + '". Use só números e vírgula, por exemplo 12,5.');
    return n;
  };
  U.centavos = (txt) => { const n = U.parseNum(txt); return n == null ? null : Math.round(n * 100); };

  /* ---------- avisos ---------- */
  U.toast = function (msg, tipo) {
    const el = document.createElement('div');
    el.className = 'toast ' + (tipo || '');
    el.setAttribute('role', tipo === 'bad' ? 'alert' : 'status');
    el.innerHTML = U.icon(tipo === 'bad' ? 'warning-circle' : 'check-circle') + '<div>' + U.esc(msg) + '</div>';
    document.getElementById('toast-root').appendChild(el);
    setTimeout(() => el.remove(), tipo === 'bad' ? 7000 : 3200);
  };

  /* ---------- janelas ---------- */
  let fechaAtual = null;
  U.fechar = function () { const r = document.getElementById('modal-root'); r.innerHTML = ''; fechaAtual = null; };
  function abrirModal({ titulo, intro, corpo, rodape }) {
    const root0 = document.getElementById('modal-root');
    root0.innerHTML = '<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="' + U.esc(titulo) + '">' +
      '<div class="modal-head"><div><h2>' + U.esc(titulo) + '</h2>' + (intro ? '<p>' + U.esc(intro) + '</p>' : '') + '</div>' +
      '<button class="btn ghost icon sm" type="button" data-fechar aria-label="Fechar">' + U.icon('x') + '</button></div>' +
      '<form class="modal-form" novalidate><div class="modal-body">' + corpo + '</div><div class="modal-foot">' + rodape + '</div></form></div></div>';
    const ov = root0.querySelector('.overlay');
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) U.fechar(); });
    root0.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', U.fechar));
    fechaAtual = U.fechar;
    const primeiro = root0.querySelector('input:not([disabled]):not([type=hidden]), select, textarea');
    if (primeiro) setTimeout(() => primeiro.focus(), 30);
    return root0.querySelector('form');
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fechaAtual) U.fechar(); });

  /* ---------- campos ---------- */
  function opcoes(ops, atual) {
    return ops.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return '<option value="' + U.esc(v) + '"' + (String(v) === String(atual) ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    }).join('');
  }
  U.campo = function (c) {
    if (c.t === 'html') return c.html;
    const id = 'f_' + c.n;
    const rot = c.r ? '<label for="' + id + '">' + U.esc(c.r) + (c.req ? ' <span class="req">*</span>' : '') + '</label>' : '';
    const aj = c.ajuda ? '<div class="help">' + U.esc(c.ajuda) + '</div>' : '';
    let el = '';
    const v = c.v == null ? '' : c.v;
    const dis = c.dis ? ' disabled' : '';
    switch (c.t) {
      case 'date': el = '<input type="date" id="' + id + '" name="' + c.n + '" value="' + U.esc(v) + '"' + dis + '>'; break;
      case 'select': el = '<select id="' + id + '" name="' + c.n + '"' + dis + '>' + opcoes(c.op, v) + '</select>'; break;
      case 'area': el = '<textarea id="' + id + '" name="' + c.n + '"' + dis + ' placeholder="' + U.esc(c.ph || '') + '">' + U.esc(v) + '</textarea>'; break;
      case 'radio':
        return '<div class="field"><span class="lbl">' + U.esc(c.r) + '</span><div class="choice">' +
          c.op.map(([val, lab]) => '<label><input type="radio" name="' + c.n + '" value="' + U.esc(val) + '"' + (String(val) === String(v) ? ' checked' : '') + '> ' + U.esc(lab) + '</label>').join('') +
          '</div>' + aj + '</div>';
      case 'check':
        return '<div class="field"><div class="choice"><label><input type="checkbox" name="' + c.n + '"' + (v ? ' checked' : '') + dis + '> ' + U.esc(c.r) + '</label></div>' + aj + '</div>';
      case 'num': case 'brl':
        el = '<div class="with-suf"><input type="text" inputmode="decimal" autocomplete="off" id="' + id + '" name="' + c.n + '" value="' + U.esc(v) + '"' + dis +
          ' placeholder="' + U.esc(c.ph || '') + '"><span class="suf">' + U.esc(c.suf || (c.t === 'brl' ? 'R$' : '')) + '</span></div>';
        break;
      default: el = '<input type="text" id="' + id + '" name="' + c.n + '" value="' + U.esc(v) + '"' + dis + ' placeholder="' + U.esc(c.ph || '') + '"' + (c.lista ? ' list="dl_' + c.n + '"' : '') + '>' +
        (c.lista ? '<datalist id="dl_' + c.n + '">' + c.lista.map((x) => '<option value="' + U.esc(x) + '">').join('') + '</datalist>' : '');
    }
    return '<div class="field">' + rot + el + aj + '</div>';
  };

  function lerValores(form, campos) {
    const out = {};
    for (const c of campos) {
      if (!c.n) continue;
      if (c.t === 'radio') { const x = form.querySelector('[name="' + c.n + '"]:checked'); out[c.n] = x ? x.value : null; continue; }
      const el = form.elements[c.n];
      if (!el) continue;
      if (c.t === 'check') { out[c.n] = el.checked; continue; }
      const bruto = el.value;
      if (c.t === 'num') out[c.n] = U.parseNum(bruto);
      else if (c.t === 'brl') out[c.n] = U.centavos(bruto);
      else out[c.n] = bruto;
      if (c.req && (out[c.n] === null || out[c.n] === '')) throw new Error('Preencha: ' + (c.r || c.n) + '.');
    }
    return out;
  }

  /* Abre um formulário e chama onSubmit(valores). Se onSubmit lançar erro, mostra dentro da janela. */
  U.form = function ({ titulo, intro, campos, enviar, onSubmit, onMount, extra }) {
    const corpo = '<div class="form-erro hide" role="alert"></div>' + campos.map(U.campo).join('') + (extra || '');
    const rodape = '<button class="btn ghost" type="button" data-fechar>Cancelar</button><button class="btn primary" type="submit">' + U.icon('check') + ' ' + U.esc(enviar || 'Salvar') + '</button>';
    const form = abrirModal({ titulo, intro, corpo, rodape });
    form.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', U.fechar));
    const mostrarErro = (m) => { const e = form.querySelector('.form-erro'); e.textContent = m; e.classList.remove('hide'); e.scrollIntoView({ block: 'nearest' }); };
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      try {
        const val = lerValores(form, campos);
        const r = onSubmit(val, form);
        if (r !== false) U.fechar();
      } catch (e) { mostrarErro(e.message || String(e)); }
    });
    if (onMount) onMount(form);
    return form;
  };

  /* Confirmação simples com motivo opcional/obrigatório */
  U.confirmar = function ({ titulo, texto, enviar, motivo, perigo, onOk }) {
    const campos = motivo ? [{ n: 'motivo', t: 'area', r: motivo === true ? 'Motivo' : motivo, req: true, ph: 'Escreva em poucas palavras' }] : [];
    const f = U.form({
      titulo, intro: texto, campos, enviar: enviar || 'Confirmar',
      onSubmit: (v) => { onOk(v.motivo); }
    });
    if (perigo) f.querySelector('.btn.primary').classList.add('danger');
  };

  /* ---------- tabela e vazios ---------- */
  U.vazio = (icone, titulo, texto, botao) =>
    '<div class="empty">' + U.icon(icone) + '<b>' + U.esc(titulo) + '</b><p>' + U.esc(texto || '') + '</p>' + (botao || '') + '</div>';
  U.aviso = (tipo, html) => {
    const ic = { warn: 'warning', bad: 'warning-octagon', ok: 'check-circle', info: 'info' }[tipo || 'info'];
    return '<div class="callout ' + (tipo || '') + '">' + U.icon(ic) + '<div>' + html + '</div></div>';
  };

  /* ---------- gráfico de linhas (estimado x real por mês) ---------- */
  U.grafico = function (pontos) {
    const W = 760, H = 280, m = { t: 16, r: 18, b: 34, l: 46 };
    if (!pontos.length) return '';
    const vals = pontos.flatMap((p) => [p.estimado, p.real]).filter((v) => v != null);
    if (!vals.length) return '';
    let lo = Math.floor(Math.min(...vals) / 10) * 10 - 10, hi = Math.ceil(Math.max(...vals) / 10) * 10 + 10;
    lo = Math.max(0, lo); hi = Math.min(100, Math.max(hi, lo + 20));
    const x = (i) => m.l + (pontos.length === 1 ? (W - m.l - m.r) / 2 : i * (W - m.l - m.r) / (pontos.length - 1));
    const y = (v) => m.t + (hi - v) * (H - m.t - m.b) / (hi - lo);
    const ticks = []; for (let v = lo; v <= hi; v += 10) ticks.push(v);
    const linha = (chave, cor, trace) => {
      const seg = []; let atual = [];
      pontos.forEach((p, i) => { if (p[chave] == null) { if (atual.length) seg.push(atual); atual = []; } else atual.push([x(i), y(p[chave])]); });
      if (atual.length) seg.push(atual);
      return seg.map((s) => s.length > 1 ? '<polyline fill="none" stroke="' + cor + '" stroke-width="2.5" stroke-linejoin="round" ' + (trace ? 'stroke-dasharray="7 6" ' : '') + 'points="' + s.map((p) => p.join(',')).join(' ') + '"/>' : '').join('') +
        pontos.map((p, i) => p[chave] == null ? '' : '<circle cx="' + x(i) + '" cy="' + y(p[chave]) + '" r="4.5" fill="' + cor + '"><title>' + U.mes(p.mes) + ': ' + U.pct(p[chave]) + '</title></circle>').join('');
    };
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolução do rendimento estimado e real por mês">' +
      '<g class="grid">' + ticks.map((v) => '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '%</text>').join('') + '</g>' +
      pontos.map((p, i) => '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + U.mes(p.mes) + '</text>').join('') +
      linha('estimado', 'var(--info)', true) + linha('real', 'var(--accent)', false) + '</svg>' +
      '<div class="legend"><span><i></i>Rendimento real (do corte)</span><span><i class="alt"></i>Rendimento estimado (das entradas)</span></div>';
  };

  root.UI = U;
})(window);
