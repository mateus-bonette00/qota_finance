// =======================================
// Qota Finance - app.js (SPA com hash routes)
// =======================================

// ======= Config =======
const API = "/api";

// ======= Helpers DOM / formato =======
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const fmtUSD = (x) =>
  `$ ${Number(x || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtBRL = (x) =>
  `R$ ${Number(x || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtPct = (x) =>
  x == null || Number.isNaN(+x) ? "-" : `${(+x).toFixed(1)}%`;

// dd/mm/yyyy a partir de 'YYYY-MM-DD' ou ISO
function fmtDateBR(s) {
  if (!s) return "";
  try {
    // aceita 'YYYY-MM-DD' ou ISO 'YYYY-MM-DDTHH:mm:ssZ'
    const d = new Date(s);
    if (!isNaN(d)) {
      return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    }
    // fallback: tenta parse manual YYYY-MM-DD
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  } catch {}
  return s;
}

const signCls = (x) => (Number(x) > 0 ? "pos" : Number(x) < 0 ? "neg" : "");

const MESES_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

const monthLabel = (m) => {
  if (!m) return "";
  const [y, mm] = m.split("-");
  const idx = Math.max(1, parseInt(mm, 10)) - 1;
  const label = MESES_PT[idx] || "";
  return `${label.charAt(0).toUpperCase() + label.slice(1)} (${y})`;
};

// popula selects de mês/ano do header
function initMonthYear() {
  const selMes = $("#selMes");
  const selAno = $("#selAno");
  if (!selMes || !selAno) return;

  selMes.innerHTML = "";
  for (let i = 1; i <= 12; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    const label = MESES_PT[i - 1].charAt(0).toUpperCase() + MESES_PT[i - 1].slice(1);
    opt.textContent = label;
    selMes.appendChild(opt);
  }
  const yNow = new Date().getFullYear();
  const years = [];
  for (let y = yNow - 4; y <= yNow + 1; y++) years.push(y);
  selAno.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");

  selMes.value = new Date().getMonth() + 1;
  selAno.value  = yNow;

  selMes.addEventListener("change", refreshRoute);
  selAno.addEventListener("change", refreshRoute);
}

// ========== custos & margens ==========
function produtoTotalUSD(p) {
  const qty     = Number(p.quantidade || 0);
  const unit    = Number(p.custo_base || 0);
  const prep    = Number(p.prep || 0);
  const freight = Number(p.freight || 0);
  return (qty * (unit + prep)) + freight;
}
const unitP2B = (p) => {
  const qty = Number(p.quantidade || 0);
  const rateio = qty > 0 ? (Number(p.tax || 0) + Number(p.freight || 0)) / qty : 0;
  return Number(p.custo_base || 0) + rateio;
};
const gpUnit = (p) =>
  Number(p.sold_for || 0) -
  Number(p.amazon_fees || 0) -
  Number(p.prep || 0) -
  unitP2B(p);
const marginPct = (p) => {
  const sold = Number(p.sold_for || 0);
  if (sold <= 0) return null;
  return (gpUnit(p) / sold) * 100;
};

// mês 'YYYY-MM' vindo dos selects
function currentMonthStr() {
  const m = String($("#selMes").value).padStart(2, "0");
  const y = $("#selAno").value;
  return `${y}-${m}`;
}

function activateTab() {
  $$(".tabs a").forEach((a) =>
    a.classList.toggle("active", a.getAttribute("href") === location.hash)
  );
  window.scrollTo({ top: 0, behavior: "instant" });
}

// fetch wrapper
async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json();
}

// ================= Ícones / componentes dos KPIs =================
const ICONS = {
  up: "assets/triangle-up.svg",
  down: "assets/triangle-down.svg",
  coin: "assets/coins.svg",
  amz: "assets/amazon.svg",
};

// Monta um card KPI com ícone (verde/ vermelho / azul)
function kpiCardHTML(kind, label, usd, brl) {
  const icon =
    kind === "receita" ? ICONS.up : kind === "despesa" ? ICONS.down : ICONS.coin;

  const usdCls = kind === "result" ? signCls(usd) : "";
  const brlCls = kind === "result" ? signCls(brl) : "";

  return `
    <div class="kpi-card ${kind}">
      <div class="ico"><img src="${icon}" alt=""></div>
      <div class="txt">
        <div class="lbl">${label}</div>
        <div class="usd ${usdCls}">USD: ${fmtUSD(usd).replace("$ ","$ ")}</div>
        <div class="brl ${brlCls}">BRL: ${fmtBRL(brl).replace("R$ ","R$ ")}</div>
      </div>
    </div>`;
}

// Linha com 3 KPIs
function kpiRow3HTML(items) {
  return `<div class="kpi-row3">${items
    .map((it) => kpiCardHTML(it.kind, it.label, it.usd, it.brl))
    .join("")}</div>`;
}

// ====================== Views ======================

// ------- Principal -------
async function renderPrincipal(root) {
  const mes = currentMonthStr();

  const saldo = await api("/amazon_saldos/latest");
  const kMes  = await api(`/metrics/resumo?month=${mes}`);
  const kTot  = await api(`/metrics/totais`);
  const { lucroPeriodo, lucroTotal } = await api(`/metrics/lucros?month=${mes}`);

  root.innerHTML = `
    <section class="amz-card">
      <div class="amz-ico"></div>
      <div>
        <div class="amz-title">SALDO AMAZON (DISPONÍVEL) — USD</div>
        <div class="amz-value">${fmtUSD(saldo?.disponivel || 0)}</div>
      </div>
    </section>

    <h3 class="h3-center">Resumo do Mês — ${monthLabel(mes)}</h3>
    <div id="kpimes"></div>

    <hr class="hr-soft"/>

    <h3 class="h3-center">Valor Total — Somas de Todos os Meses</h3>
    <div id="kpitotal"></div>

    <hr class="hr-soft"/>

    <h3 class="h3-center" style="margin-top:22px">Lucros</h3>
    <div class="cards-lucros">
      <section class="lucro-card" style="margin-top:10px">
        <div class="ico"><img src="${ICONS.up}" alt=""></div>
        <div>
          <div class="title">Lucro realizado no período — ${monthLabel(mes)}</div>
          <div class="value">${fmtUSD(lucroPeriodo)}</div>
        </div>
      </section>

      <section class="lucro-card" style="margin-top:14px">
        <div class="ico"><img src="${ICONS.up}" alt=""></div>
        <div>
          <div class="title">Lucro TOTAL — soma de todos os meses</div>
          <div class="value">${fmtUSD(lucroTotal)}</div>
        </div>
      </section>
    </div>
  `;

  $("#kpimes").innerHTML = kpiRow3HTML([
    { kind: "receita", label: "Receitas (mês)", usd: kMes.recUSD, brl: kMes.recBRL },
    { kind: "despesa", label: "Despesas (mês)", usd: kMes.despUSD, brl: kMes.despBRL },
    { kind: "result",  label: "Resultado (mês)",
      usd: kMes.recUSD - kMes.despUSD, brl: kMes.recBRL - kMes.despBRL },
  ]);

  $("#kpitotal").innerHTML = kpiRow3HTML([
    { kind: "receita", label: "Receitas (total — todos os meses)", usd: kTot.recUSD, brl: kTot.recBRL },
    { kind: "despesa", label: "Despesas (total — todos os meses)", usd: kTot.despUSD, brl: kTot.despBRL },
    { kind: "result",  label: "Resultado (total — todos os meses)",
      usd: kTot.recUSD - kTot.despUSD, brl: kTot.recBRL - kTot.despBRL },
  ]);
}

// ------- Receitas (FBA) -------
async function renderReceitas(root) {
  const mes = currentMonthStr();
  const prods = await api(`/produtos?month=${mes}`);

  root.innerHTML = `
    <h2 class="h3-center">Produtos Vendidos (Receitas)</h2>

    <form id="formRec" class="panel form">
      <label>Data do crédito
        <input type="date" name="data" required />
      </label>

      <label>Produto vendido (SKU | UPC | Nome)
        <select name="produto_id" id="selProd"></select>
      </label>

      <label>Quantidade vendida
        <input type="number" name="quantidade" value="1" min="1" required />
      </label>

      <label>Valor recebido (USD) por unidade
        <input type="number" step="0.01" name="valor_unidade" required />
      </label>

      <label>Quem lançou
        <select name="quem"><option>Bonette</option><option>Daniel</option></select>
      </label>

      <label>Observação
        <input type="text" name="obs" />
      </label>

      <div>
        <button class="btn" type="submit">Adicionar recebimento (Amazon)</button>
      </div>
    </form>

    <div id="cardsRec" class="row"></div>
    <div class="panel"><table class="tbl" id="tblRec"></table></div>
  `;

  // select de produtos
  const sel = $("#selProd");
  sel.innerHTML = prods
    .map((p) => {
      const label = `${(p.sku || "").trim()} | ${(p.upc || "").trim()} | ${p.nome}`.replaceAll(" | | ", " | ");
      return `<option value="${p.id}" data-sold="${p.sold_for || 0}" data-sku="${p.sku || ""}" data-nome="${p.nome || ""}">${label}</option>`;
    }).join("");

  const soldInput = $('input[name="valor_unidade"]', $("#formRec"));
  sel.addEventListener("change", () => {
    const opt = sel.selectedOptions[0];
    soldInput.value = opt?.dataset?.sold || 0;
  });
  if (sel.options.length) sel.dispatchEvent(new Event("change"));

  $("#formRec").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const produto_id = Number(fd.get("produto_id")) || null;
    const opt = sel.selectedOptions[0] || {};
    const body = {
      data: fd.get("data"),
      produto_id,
      quantidade: Number(fd.get("quantidade")),
      valor_usd: Number(fd.get("valor_unidade")) * Number(fd.get("quantidade")),
      quem: fd.get("quem"),
      obs: fd.get("obs") || "",
      sku: opt.dataset.sku || "",
      produto: opt.dataset.nome || "",
    };
    await api("/amazon_receitas", { method: "POST", body: JSON.stringify(body) });
    await renderReceitas(root);
  });

  // totais
  const all = await api("/amazon_receitas");
  const period = all.filter((r) => (r.data || "").slice(0, 7) === mes);
  const totQty    = period.reduce((s, r) => s + Number(r.quantidade || 0), 0);
  const totVal    = period.reduce((s, r) => s + Number(r.valor_usd || 0), 0);
  const totQtyAll = all.reduce((s, r) => s + Number(r.quantidade || 0), 0);
  const totValAll = all.reduce((s, r) => s + Number(r.valor_usd || 0), 0);

  $("#cardsRec").innerHTML = `
    <div class="panel" style="flex:1">
      <div style="opacity:.85;text-transform:uppercase;font-weight:800">Vendido no período — ${monthLabel(mes)}</div>
      <div style="font-size:28px;font-weight:900">Quantidade: ${totQty} <br/> Valor: ${fmtUSD(totVal)}</div>
    </div>
    <div class="panel" style="flex:1">
      <div style="opacity:.85;text-transform:uppercase;font-weight:800">Vendido (TOTAL — todos os meses)</div>
      <div style="font-size:28px;font-weight:900">Quantidade: ${totQtyAll} <br/> Valor: ${fmtUSD(totValAll)}</div>
    </div>
  `;

  // tabela
  const header = ["ID", "Data", "Produto", "SKU", "Qtd", "Valor (USD)", "Quem", "Ações"];
  const prodsMap = new Map(prods.map((p) => [p.id, p]));
  const html = [
    `<thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>`,
  ];
  for (const r of period) {
    const p = prodsMap.get(r.produto_id) || {};
    const nome = r.produto || p.nome || "";
    const sku  = r.sku || p.sku || "";
    html.push(`<tr>
      <td>${r.id}</td>
      <td>${fmtDateBR(r.data)}</td>
      <td>${nome}</td>
      <td>${sku}</td>
      <td>${r.quantidade}</td>
      <td>${fmtUSD(r.valor_usd)}</td>
      <td>${r.quem || ""}</td>
      <td><button class="btn secondary" data-del="${r.id}">Excluir</button></td>
    </tr>`);
  }
  html.push("</tbody>");
  $("#tblRec").innerHTML = html.join("");

  $("#tblRec").addEventListener("click", async (e) => {
    const id = e.target?.dataset?.del;
    if (!id) return;
    if (!confirm("Tem certeza que deseja excluir?")) return;
    await api(`/amazon_receitas/${id}`, { method: "DELETE" });
    await renderReceitas(root);
  });
}

// ------- Gráficos -------
async function renderGraficos(root) {
  const mes = currentMonthStr();
  const now = new Date();
  const year  = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");

  root.innerHTML = `
    <h2 class="h3-center">Gráficos</h2>

    <div class="row">
      <div class="panel" style="flex:1">
        <h4>Receitas x Despesas (USD) — ${monthLabel(mes)}</h4>
        <canvas id="line"></canvas>
      </div>
      <div class="panel" style="flex:1">
        <h4>Resultado por mês (USD)</h4>
        <canvas id="bars"></canvas>
      </div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="panel" style="flex:1">
        <h4>Top produtos (MÊS) — mais vendidos</h4>
        <canvas id="topMonth"></canvas>
      </div>
      <div class="panel" style="flex:1">
        <h4>Top produtos (ANO) — mais vendidos</h4>
        <canvas id="topYear"></canvas>
      </div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="panel" style="flex:1">
        <h4>Bottom produtos (MÊS) — menos vendidos</h4>
        <canvas id="bottomMonth"></canvas>
      </div>
      <div class="panel" style="flex:1">
        <h4>Bottom produtos (ANO) — menos vendidos</h4>
        <canvas id="bottomYear"></canvas>
      </div>
    </div>
  `;

  // série receitas x despesas
  const series = await api("/metrics/series");
  const meses     = series.map((s) => s.mes);
  const receitas  = series.map((s) => s.receitas_amz);
  const despesas  = series.map((s) => s.despesas_totais);
  const resultado = series.map((s) => s.resultado);

  new Chart($("#line"), {
    type: "line",
    data: {
      labels: meses,
      datasets: [
        { label: "Receitas (Amazon)", data: receitas },
        { label: "Despesas Totais",   data: despesas },
      ],
    },
    options: { responsive: true }
  });

  new Chart($("#bars"), {
    type: "bar",
    data: { labels: meses, datasets: [{ label: "Resultado", data: resultado }] },
    options: { responsive: true }
  });

  // ======== Top/Bottom vendidos ========
  const fetchSales = (scope, order) =>
    api(`/metrics/products/sales?scope=${scope}&order=${order}&limit=10&year=${year}&month=${month}`);

  const BAR_STROKE = "#3498DB";
  const BAR_FILL   = "rgba(52, 152, 219, 0.32)";

  const makeHBar = (canvas, rows, title) => {
    const labels = rows.map(r => r.sku || "(sem SKU)");
    const data   = rows.map(r => r.qty || 0);

    new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: title,
          data,
          backgroundColor: BAR_FILL,
          borderColor: BAR_STROKE,
          borderWidth: 1,
          borderSkipped: false,
          borderAlign: "inner",
          barThickness: 22,
          hoverBackgroundColor: BAR_FILL,
          hoverBorderColor: BAR_STROKE
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
          datalabels: {
            anchor: "end",
            align: "right",
            formatter: (v) => v,
            clamp: true,
            color: BAR_STROKE,
            font: { weight: 600 }
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { ticks: { autoSkip: false } }
        }
      },
      plugins: [ChartDataLabels]
    });
  };

  const [topM, topY, botM, botY] = await Promise.all([
    fetchSales("month", "desc"),
    fetchSales("year",  "desc"),
    fetchSales("month", "asc"),
    fetchSales("year",  "asc"),
  ]);

  makeHBar($("#topMonth"),   topM, "Qtd vendida");
  makeHBar($("#topYear"),    topY, "Qtd vendida");
  makeHBar($("#bottomMonth"),botM, "Qtd vendida");
  makeHBar($("#bottomYear"), botY, "Qtd vendida");
}

// ------- Despesas / Investimentos -------
async function renderDespesas(root) {
  const mes = currentMonthStr();

  root.innerHTML = `
    <h2 style="font-size: 38px; color:#1a6bc6 !important; filter: saturate(1.25) contrast(3.45);" class="h3-center">Despesas</h2>

    <h3 class="h3-center">Gastos</h3>
    <form id="formG" class="panel form">
      <label>Data <input type="date" name="data" required></label>
      <label>Categoria
        <select name="categoria">
          <option>Compra de Produto</option><option>Mensalidade/Assinatura</option>
          <option>Contabilidade/Legal</option><option>Taxas/Impostos</option>
          <option>Frete/Logística</option><option>Outros</option>
        </select>
      </label>
      <label>Descrição <input type="text" name="descricao"></label>
      <label>Valor BRL <input type="number" step="0.01" name="valor_brl"></label>
      <label>Valor USD <input type="number" step="0.01" name="valor_usd"></label>
      <label>Método
        <select name="metodo">
          <option>Pix</option><option>Cartão de Crédito</option><option>Boleto</option>
          <option>Transferência</option><option>Dinheiro</option>
        </select>
      </label>
      <label>Conta
        <select name="conta">
          <option>Nubank</option><option>Nomad</option><option>Wise</option>
          <option>Mercury Bank</option><option>WesternUnion</option>
        </select>
      </label>
      <label>Quem
        <select name="quem"><option>Bonette</option><option>Daniel</option></select>
      </label>
      <div style="margin-top: 14px;"><button class="btn" type="submit">Adicionar Gasto</button></div>
    </form>

    <div class="panel"><table class="tbl" id="tblG"></table></div>

    <hr/>

    <h3 class="h3-center">Investimentos</h3>
    <form id="formI" class="panel form">
      <label>Data <input type="date" name="data" required></label>
      <label>Valor BRL <input type="number" step="0.01" name="valor_brl"></label>
      <label>Valor USD <input type="number" step="0.01" name="valor_usd"></label>
      <label>Método
        <select name="metodo">
          <option>Pix</option><option>Cartão de Crédito</option><option>Boleto</option>
          <option>Transferência</option><option>Dinheiro</option>
        </select>
      </label>
      <label>Conta
        <select name="conta">
          <option>Nubank</option><option>Nomad</option><option>Wise</option>
          <option>Mercury Bank</option><option>WesternUnion</option>
        </select>
      </label>
      <label>Quem
        <select name="quem"><option>Bonette</option><option>Daniel</option></select>
      </label>
      <div style="margin-top: 14px;"><button class="btn" type="submit">Adicionar Investimento</button></div>
    </form>

    <div class="panel"><table class="tbl" id="tblI"></table></div>

    <hr/>

    <h3 class="h3-center">Produtos Comprados</h3>
    <div class="panel">
      <table class="tbl" id="tblCompras"></table>
    </div>
  `;

  // submits
  $("#formG").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    await api("/gastos", { method: "POST", body: JSON.stringify(body) });
    await renderDespesas(root);
  });
  $("#formI").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    await api("/investimentos", { method: "POST", body: JSON.stringify(body) });
    await renderDespesas(root);
  });

  // ----- Tabela Gastos -----
  const gastos = await api(`/gastos?month=${mes}`);
  const gi = [["ID", "Data", "Categoria", "Descrição", "Valor (BRL)", "Valor (USD)", "Método", "Quem", "Ações"]];
  for (const g of gastos) {
    gi.push([
      g.id,
      fmtDateBR(g.data),
      g.categoria,
      g.descricao || "",
      `<span class="num">${fmtBRL(g.valor_brl)}</span>`,
      `<span class="num">${fmtUSD(g.valor_usd)}</span>`,
      g.metodo || "",
      g.quem || "",
      `<button class="btn secondary" data-del="g-${g.id}">Excluir</button>`,
    ]);
  }
  $("#tblG").innerHTML =
    gi.map((r, i) =>
      i ? `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`
        : `<thead><tr>${r.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`
    ).join("") + "</tbody>";

  // ----- Tabela Investimentos -----
  const inv = await api(`/investimentos?month=${mes}`);
  const ii = [["ID", "Data", "Valor (BRL)", "Valor (USD)", "Método", "Quem", "Ações"]];
  for (const g of inv) {
    ii.push([
      g.id,
      fmtDateBR(g.data),
      `<span class="num">${fmtBRL(g.valor_brl)}</span>`,
      `<span class="num">${fmtUSD(g.valor_usd)}</span>`,
      g.metodo || "",
      g.quem || "",
      `<button class="btn secondary" data-del="i-${g.id}">Excluir</button>`,
    ]);
  }
  $("#tblI").innerHTML =
    ii.map((r, i) =>
      i ? `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`
        : `<thead><tr>${r.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`
    ).join("") + "</tbody>";

  $("#tblG").addEventListener("click", async (e) => {
    const tag = e.target?.dataset?.del;
    if (!tag) return;
    if (!confirm("Tem certeza que deseja excluir?")) return;
    const id = tag.split("-")[1];
    await api(`/gastos/${id}`, { method: "DELETE" });
    await renderDespesas(root);
  });
  $("#tblI").addEventListener("click", async (e) => {
    const tag = e.target?.dataset?.del;
    if (!tag) return;
    if (!confirm("Tem certeza que deseja excluir?")) return;
    const id = tag.split("-")[1];
    await api(`/investimentos/${id}`, { method: "DELETE" });
    await renderDespesas(root);
  });

  // ----- Produtos Comprados (com Margem %) -----
  const prods = await api(`/produtos?month=${mes}`);
  const pc = [[
    "ID","Data","Nome","UPC","ASIN","Quantidade comprada","Valor total (USD)","Margem (%)","Ações"
  ]];

  for (const p of prods) {
    const total = produtoTotalUSD(p);
    const mrg   = marginPct(p);
    pc.push([
      p.id,
      fmtDateBR(p.data_add || ""),
      p.nome || "",
      p.upc || "",
      p.asin || "",
      `<span class="num">${Number(p.quantidade || 0)}</span>`,
      `<span class="num">${fmtUSD(total)}</span>`,
      `<span class="num">${fmtPct(mrg)}</span>`,
      `<button class="btn secondary" data-del-prod="${p.id}">Excluir</button>`
    ]);
  }

  $("#tblCompras").innerHTML =
    pc.map((r, i) =>
      i ? `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`
        : `<thead><tr>${r.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`
    ).join("") + "</tbody>";

  $("#tblCompras").addEventListener("click", async (e) => {
    const id = e.target?.dataset?.delProd;
    if (!id) return;
    if (!confirm("Excluir este produto?")) return;
    await api(`/produtos/${id}`, { method: "DELETE" });
    await renderDespesas(root);
  });
}

// ------- Produtos -------
async function renderProdutos(root) {
  const mes = currentMonthStr();

  root.innerHTML = `
    <h2 class="h3-center">Cadastro e Métricas por Produto (FBA)</h2>

    <form id="formP" class="panel form">
      <label>Data adicionada na Amazon / Data de compra
        <input type="date" name="data_add" required>
      </label>
      <label>Estoque
        <input type="number" name="estoque" value="0" min="0">
      </label>

      <label>Nome do produto *
        <input type="text" name="nome" required placeholder="Ex.: Carrinho">
      </label>
      <label>Quantidade comprada (para rateio)
        <input type="number" name="quantidade" value="0" min="0">
      </label>

      <label>SKU
        <input type="text" name="sku" placeholder="Ex.: ABC-123">
      </label>
      <label>Custo unitário base (USD)
        <input type="number" step="0.01" name="custo_base" placeholder="0,00">
      </label>

      <label>UPC
        <input type="text" name="upc">
      </label>
      <label>Frete do lote (USD)
        <input type="number" step="0.01" name="freight" placeholder="0,00">
      </label>

      <label>ASIN
        <input type="text" name="asin">
      </label>
      <label>TAX do lote (USD)
        <input type="number" step="0.01" name="tax" placeholder="0,00">
      </label>

      <label>Link do produto na Amazon
        <input type="url" name="link_amazon" placeholder="https://...">
      </label>
      <label>PREP (USD) por unidade
        <input type="number" step="0.01" name="prep" value="2.00">
      </label>

      <label>Link do fornecedor
        <input type="url" name="link_fornecedor" placeholder="https://...">
      </label>
      <label>Sold for (USD)
        <input type="number" step="0.01" name="sold_for" placeholder="0,00">
      </label>

      <div>
        <button style="margin-top: 14px;" class="btn" type="submit">Salvar Produto</button>
      </div>
      <label>Amazon Fees (USD)
        <input type="number" step="0.01" name="amazon_fees" placeholder="0,00">
      </label>
    </form>

    <div class="panel"><table class="tbl" id="tblP"></table></div>

    <div id="lucrosP" class="row"></div>
  `;

  $("#formP").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    await api("/produtos", { method: "POST", body: JSON.stringify(body) });
    await renderProdutos(root);
  });

  const prods = await api(`/produtos?month=${mes}`);
  const rows = [[
    "ID","Data","Nome","SKU","UPC","ASIN","Estoque","Price to Buy","Amazon Fees","PREP","Sold for","Gross Profit","Ações",
  ]];

  for (const p of prods) {
    const qty = Number(p.quantidade || 0) || 1;
    const rateio = (Number(p.tax || 0) + Number(p.freight || 0)) / qty;
    const unitP2Bv = Number(p.custo_base || 0) + (isFinite(rateio) ? rateio : 0);
    const gpUnitv =
      Number(p.sold_for || 0) -
      Number(p.amazon_fees || 0) -
      Number(p.prep || 0) -
      unitP2Bv;

    rows.push([
      p.id,
      fmtDateBR(p.data_add),
      p.nome,
      p.sku || "",
      p.upc || "",
      p.asin || "",
      p.estoque,
      fmtUSD(unitP2Bv),
      fmtUSD(p.amazon_fees),
      fmtUSD(p.prep),
      fmtUSD(p.sold_for),
      fmtUSD(gpUnitv),
      `<button class="btn secondary" data-del="${p.id}">Excluir</button>`,
    ]);
  }

  $("#tblP").innerHTML =
    rows.map((r, i) =>
      i
        ? `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`
        : `<thead><tr>${r.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`
    ).join("") + "</tbody>";

  $("#tblP").addEventListener("click", async (e) => {
    const id = e.target?.dataset?.del;
    if (!id) return;
    if (!confirm("Tem certeza que deseja excluir?")) return;
    await api(`/produtos/${id}`, { method: "DELETE" });
    await renderProdutos(root);
  });

  const { lucroPeriodo, lucroTotal } = await api(`/metrics/lucros?month=${mes}`);
  $("#lucrosP").innerHTML = `
    <div class="lucro-card" style="flex:1">
      <div class="ico"><img src="assets/triangle-up.svg" alt=""></div>
      <div>
        <div class="title">Lucro realizado no período — ${monthLabel(mes)}</div>
        <div class="value">${fmtUSD(lucroPeriodo)}</div>
      </div>
    </div>
    <div class="lucro-card" style="flex:1; margin-left:14px">
      <div class="ico"><img src="assets/triangle-up.svg" alt=""></div>
      <div>
        <div class="title">Lucro TOTAL — soma de todos os meses</div>
        <div class="value">${fmtUSD(lucroTotal)}</div>
      </div>
    </div>
  `;
}

// ====================== Router ======================
const routes = {
  "/principal": renderPrincipal,
  "/receitas":  renderReceitas,
  "/graficos":  renderGraficos,
  "/despesas":  renderDespesas,
  "/produtos":  renderProdutos,
};

async function router() {
  activateTab();
  const root = $("#app");
  const hash = location.hash.replace(/^#/, "") || "/principal";
  const view = routes[hash] || routes["/principal"];
  try {
    await view(root);
  } catch (e) {
    root.innerHTML = `<div class="panel">Erro: ${e.message}</div>`;
  }
}
function refreshRoute() { router(); }

// boot
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => {
  initMonthYear();
  if (!location.hash) location.hash = "/principal";
  router();
});
