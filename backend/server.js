// ===== Qota Finance - Backend (Node/Express + Postgres) =====
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { openDb, all, get, run } from "./db.pg.js";

// --- paths auxiliares ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Public: sua SPA está em ./public
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.use(express.json());

// ---------- CORS (lendo ALLOWED_ORIGINS) ----------
const ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"));
    },
    credentials: true,
  })
);

// ---------- Anti-cache somente para a API ----------
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

// ---------- Servir SPA com cache correto ----------
app.use((req, res, next) => {
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  next();
});
app.use(express.static(PUBLIC_DIR, { index: false, etag: true, lastModified: true }));

app.get(
  ["/", "/principal", "/receitas", "/graficos", "/despesas", "/produtos", "/#/.*"],
  (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  }
);

// ---------- DB ----------
const db = openDb();

// ---------- utils ----------
const money = (x) => (Number.isFinite(+x) ? +x : 0);

// YYYY-MM robusto para string ou Date
function yyyymm(d) {
  if (!d) return "";
  // se já veio como string YYYY-MM-... ou YYYY-MM
  if (typeof d === "string") {
    const m = d.match(/^(\d{4}-\d{2})/);
    if (m) return m[1];
  }
  // tenta converter para Date
  const dt = new Date(d);
  if (!isNaN(dt)) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  return "";
}

// Filtro por mês usando to_char
function monthFilterClause(tableDateCol = "data") {
  return ` WHERE to_char(${tableDateCol}::date, 'YYYY-MM') = ? `;
}

// ---------- endpoints CRUD ----------
// Gastos
app.get("/api/gastos", async (req, res) => {
  const { month } = req.query;
  const rows = await all(
    db,
    `SELECT * FROM gastos ${month ? monthFilterClause("data") : ""} ORDER BY (data)::date DESC, id DESC`,
    month ? [month] : []
  );
  res.json(rows);
});
app.post("/api/gastos", async (req, res) => {
  const r = req.body;
  const sql = `INSERT INTO gastos (data,categoria,descricao,valor_brl,valor_usd,metodo,conta,quem)
               VALUES (?,?,?,?,?,?,?,?)`;
  const out = await run(db, sql, [
    r.data,
    r.categoria,
    r.descricao || "",
    money(r.valor_brl),
    money(r.valor_usd),
    r.metodo || "",
    r.conta || "",
    r.quem || "",
  ]);
  res.json(out);
});
app.delete("/api/gastos/:id", async (req, res) => {
  const out = await run(db, "DELETE FROM gastos WHERE id = ?", [req.params.id]);
  res.json(out);
});

// Investimentos
app.get("/api/investimentos", async (req, res) => {
  const { month } = req.query;
  const rows = await all(
    db,
    `SELECT * FROM investimentos ${month ? monthFilterClause("data") : ""} ORDER BY (data)::date DESC, id DESC`,
    month ? [month] : []
  );
  res.json(rows);
});
app.post("/api/investimentos", async (req, res) => {
  const r = req.body;
  const sql = `INSERT INTO investimentos (data,valor_brl,valor_usd,metodo,conta,quem)
               VALUES (?,?,?,?,?,?)`;
  const out = await run(db, sql, [
    r.data,
    money(r.valor_brl),
    money(r.valor_usd),
    r.metodo || "",
    r.conta || "",
    r.quem || "",
  ]);
  res.json(out);
});
app.delete("/api/investimentos/:id", async (req, res) => {
  const out = await run(db, "DELETE FROM investimentos WHERE id = ?", [req.params.id]);
  res.json(out);
});

// Produtos
app.get("/api/produtos", async (req, res) => {
  const { month } = req.query;
  const rows = await all(
    db,
    `SELECT id, COALESCE(data_amz, data_add) as data_add, nome, sku, upc, asin, estoque,
            custo_base, freight, tax, quantidade, prep, sold_for, amazon_fees,
            link_amazon, link_fornecedor
     FROM produtos
     ${month ? monthFilterClause("COALESCE(data_amz,data_add)") : ""}
     ORDER BY (COALESCE(data_amz, data_add))::date DESC, id DESC`,
    month ? [month] : []
  );
  res.json(rows);
});
app.post("/api/produtos", async (req, res) => {
  const r = req.body;
  const sql = `INSERT INTO produtos
    (data_add,nome,sku,upc,asin,estoque,custo_base,freight,tax,quantidade,prep,sold_for,amazon_fees,link_amazon,link_fornecedor,data_amz)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const out = await run(db, sql, [
    r.data_add,
    r.nome,
    r.sku || "",
    r.upc || "",
    r.asin || "",
    Number(r.estoque || 0),
    money(r.custo_base),
    money(r.freight),
    money(r.tax),
    Number(r.quantidade || 0),
    money(r.prep ?? 2),
    money(r.sold_for),
    money(r.amazon_fees),
    r.link_amazon || "",
    r.link_fornecedor || "",
    r.data_amz || null,
  ]);
  res.json(out);
});
app.delete("/api/produtos/:id", async (req, res) => {
  const out = await run(db, "DELETE FROM produtos WHERE id = ?", [req.params.id]);
  res.json(out);
});

// Amazon Receitas
app.get("/api/amazon_receitas", async (req, res) => {
  const { month } = req.query;
  const rows = await all(
    db,
    `SELECT id, data, produto_id, quantidade, valor_usd, quem, obs, sku, produto
     FROM amazon_receitas
     ${month ? monthFilterClause("data") : ""}
     ORDER BY (data)::date DESC, id DESC`,
    month ? [month] : []
  );
  res.json(rows);
});
app.post("/api/amazon_receitas", async (req, res) => {
  const r = req.body;
  const sql = `INSERT INTO amazon_receitas (data,produto_id,quantidade,valor_usd,quem,obs,sku,produto)
               VALUES (?,?,?,?,?,?,?,?)`;
  const out = await run(db, sql, [
    r.data,
    r.produto_id ?? null,
    Number(r.quantidade || 0),
    money(r.valor_usd),
    r.quem || "",
    r.obs || "",
    r.sku || "",
    r.produto || "",
  ]);

  // reduz estoque se vier produto_id
  if (r.produto_id) {
    await run(db, "UPDATE produtos SET estoque = GREATEST(0, estoque - ?) WHERE id = ?", [
      Number(r.quantidade || 0),
      Number(r.produto_id),
    ]);
  }
  res.json(out);
});
app.delete("/api/amazon_receitas/:id", async (req, res) => {
  const out = await run(db, "DELETE FROM amazon_receitas WHERE id = ?", [req.params.id]);
  res.json(out);
});

// Amazon saldos (card)
app.get("/api/amazon_saldos/latest", async (_req, res) => {
  const row = await get(
    db,
    `SELECT * FROM amazon_saldos ORDER BY (data)::date DESC, id DESC LIMIT 1`
  );
  res.json(row || { disponivel: 0, pendente: 0, moeda: "USD" });
});

// ---------- Métricas e KPIs ----------
app.get("/api/metrics/resumo", async (req, res) => {
  const { month } = req.query;

  const gastos = await all(
    db,
    `SELECT valor_brl, valor_usd FROM gastos ${month ? monthFilterClause("data") : ""}`,
    month ? [month] : []
  );
  const investimentos = await all(
    db,
    `SELECT valor_brl, valor_usd FROM investimentos ${month ? monthFilterClause("data") : ""}`,
    month ? [month] : []
  );
  const receitas = await all(
    db,
    `SELECT valor_brl, valor_usd FROM receitas ${month ? monthFilterClause("data") : ""}`,
    month ? [month] : []
  );
  const amz = await all(
    db,
    `SELECT valor_usd FROM amazon_receitas ${month ? monthFilterClause("data") : ""}`,
    month ? [month] : []
  );
  const prodsMes = await all(
    db,
    `SELECT * FROM produtos ${month ? monthFilterClause("COALESCE(data_amz,data_add)") : ""}`,
    month ? [month] : []
  );

  const comprasUSD = prodsMes.reduce((acc, p) => {
    const unit = (money(p.custo_base) + money(p.prep) + money(p.amazon_fees)) * money(p.quantidade);
    const total = unit + money(p.freight) + money(p.tax);
    return acc + total;
  }, 0);

  const recUSD = amz.reduce((s, r) => s + money(r.valor_usd), 0) + receitas.reduce((s, r) => s + money(r.valor_usd), 0);
  const recBRL = receitas.reduce((s, r) => s + money(r.valor_brl), 0);

  const despUSD =
    gastos.reduce((s, r) => s + money(r.valor_usd), 0) +
    investimentos.reduce((s, r) => s + money(r.valor_usd), 0) +
    comprasUSD;
  const despBRL =
    gastos.reduce((s, r) => s + money(r.valor_brl), 0) +
    investimentos.reduce((s, r) => s + money(r.valor_brl), 0);

  res.json({ recUSD, recBRL, despUSD, despBRL });
});

app.get("/api/metrics/totais", async (_req, res) => {
  const gastos = await all(db, `SELECT valor_brl, valor_usd FROM gastos`);
  const investimentos = await all(db, `SELECT valor_brl, valor_usd FROM investimentos`);
  const receitas = await all(db, `SELECT valor_brl, valor_usd FROM receitas`);
  const amz = await all(db, `SELECT valor_usd FROM amazon_receitas`);
  const prodsAll = await all(db, `SELECT * FROM produtos`);

  const comprasUSD = prodsAll.reduce((acc, p) => {
    const unit = (money(p.custo_base) + money(p.prep) + money(p.amazon_fees)) * money(p.quantidade);
    const total = unit + money(p.freight) + money(p.tax);
    return acc + total;
  }, 0);

  const recUSD = amz.reduce((s, r) => s + money(r.valor_usd), 0) + receitas.reduce((s, r) => s + money(r.valor_usd), 0);
  const recBRL = receitas.reduce((s, r) => s + money(r.valor_brl), 0);

  const despUSD =
    gastos.reduce((s, r) => s + money(r.valor_usd), 0) +
    investimentos.reduce((s, r) => s + money(r.valor_usd), 0) +
    comprasUSD;
  const despBRL =
    gastos.reduce((s, r) => s + money(r.valor_brl), 0) +
    investimentos.reduce((s, r) => s + money(r.valor_brl), 0);

  res.json({ recUSD, recBRL, despUSD, despBRL });
});

app.get("/api/metrics/lucros", async (req, res) => {
  const { month } = req.query;

  const amzAll = await all(
    db,
    `SELECT id, data, produto_id, quantidade, valor_usd, sku, produto FROM amazon_receitas`
  );
  const prodsAll = await all(db, `SELECT * FROM produtos`);

  const periodReceipts = month ? amzAll.filter((r) => yyyymm(r.data) === month) : amzAll;

  const byId = new Map(prodsAll.map((p) => [p.id, p]));
  const priceToBuyEff = (p) => {
    const base = money(p.custo_base);
    const tax = money(p.tax);
    const freight = money(p.freight);
    const qty = money(p.quantidade);
    const rateio = qty > 0 ? (tax + freight) / qty : 0;
    return base + rateio;
  };
  const grossProfitUnit = (p) => {
    const sold_for = money(p.sold_for);
    const amz = money(p.amazon_fees);
    const prep = money(p.prep);
    const p2b = priceToBuyEff(p);
    return sold_for - amz - prep - p2b;
  };
  let total = 0;
  for (const r of periodReceipts) {
    const prod = byId.get(r.produto_id);
    if (!prod) continue;
    total += grossProfitUnit(prod) * money(r.quantidade);
  }
  let totalAll = 0;
  for (const r of amzAll) {
    const prod = byId.get(r.produto_id);
    if (!prod) continue;
    totalAll += grossProfitUnit(prod) * money(r.quantidade);
  }

  res.json({ lucroPeriodo: total, lucroTotal: totalAll });
});

// --------- SÉRIE MENSAL: receitas x despesas x resultado ---------
app.get("/api/metrics/series", async (_req, res) => {
  const amz = await all(
    db,
    `SELECT to_char(data::date,'YYYY-MM-DD') as data, valor_usd FROM amazon_receitas`
  );
  const gastos = await all(
    db,
    `SELECT to_char(data::date,'YYYY-MM-DD') as data, valor_usd FROM gastos`
  );
  const invest = await all(
    db,
    `SELECT to_char(data::date,'YYYY-MM-DD') as data, valor_usd FROM investimentos`
  );
  const prods = await all(
    db,
    `SELECT to_char(COALESCE(data_amz, data_add)::date,'YYYY-MM-DD') as data_add,
            custo_base, prep, amazon_fees, quantidade, freight, tax
     FROM produtos`
  );

  const toMonth = (d) => yyyymm(d);
  const sumByMonthSimple = (rows) => {
    const m = {};
    for (const r of rows) {
      const k = toMonth(r.data);
      m[k] = (m[k] || 0) + money(r.valor_usd);
    }
    return m;
  };

  const receitasM = sumByMonthSimple(amz);
  const gastosM = sumByMonthSimple(gastos);
  const investM = sumByMonthSimple(invest);

  const comprasM = {};
  for (const p of prods) {
    const k = toMonth(p.data_add);
    const qty = money(p.quantidade);
    const unit = money(p.custo_base) + money(p.prep) + money(p.amazon_fees);
    const total = unit * qty + money(p.freight) + money(p.tax);
    comprasM[k] = (comprasM[k] || 0) + total;
  }

  const meses = Array.from(
    new Set([
      ...Object.keys(receitasM),
      ...Object.keys(gastosM),
      ...Object.keys(investM),
      ...Object.keys(comprasM),
    ])
  )
    .filter(Boolean)
    .sort();

  const out = meses.map((m) => {
    const despesasTotais =
      (gastosM[m] || 0) + (investM[m] || 0) + (comprasM[m] || 0);
    return {
      mes: m,
      receitas_amz: receitasM[m] || 0,
      despesas_totais: despesasTotais,
      resultado: (receitasM[m] || 0) - despesasTotais,
    };
  });

  res.json(out);
});

// --------- NOVO: Top/Bottom produtos por vendas (para os gráficos) ---------
app.get("/api/metrics/products/sales", async (req, res) => {
  let {
    scope = "month",     // "month" | "year"
    order = "desc",      // "desc" | "asc"
    limit = "10",
    year,
    month,
  } = req.query;

  const now = new Date();
  year  = String(year  ?? now.getFullYear());
  month = String(month ?? now.getMonth() + 1).padStart(2, "0");

  let where = "";
  let params = [];
  if (scope === "year") {
    where = `WHERE to_char(ar.data::date,'YYYY') = ?`;
    params = [year];
  } else {
    where = `WHERE to_char(ar.data::date,'YYYY-MM') = ?`;
    params = [`${year}-${month}`];
  }

  const ord = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";
  const lim = Number(limit) > 0 ? Number(limit) : 10;

  const rows = await all(
    db,
    `
    SELECT
      COALESCE(p.sku, ar.sku, '(sem SKU)')  AS sku,
      COALESCE(p.nome, ar.produto, '(sem nome)') AS nome,
      SUM(COALESCE(ar.quantidade,0))::int  AS qty
    FROM amazon_receitas ar
    LEFT JOIN produtos p ON p.id = ar.produto_id
    ${where}
    GROUP BY 1,2
    ORDER BY qty ${ord}
    LIMIT ${lim}
    `,
    params
  );

  res.json(rows);
});

// ===== (opcional) teste SP-API =====
app.get("/api/spapi/test", async (_req, res) => {
  try {
    const creds = {
      refresh_token: process.env.SPAPI_REFRESH_TOKEN,
      lwa_app_id: process.env.LWA_CLIENT_ID,
      lwa_client_secret: process.env.LWA_CLIENT_SECRET,
      aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
      aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
      role_arn: process.env.AWS_ROLE_ARN,
    };
    const { Sellers, Marketplaces } = await import("amazon-sp-api");
    const sellers = new Sellers({ marketplace: Marketplaces.US, credentials: creds });
    const r = await sellers.getMarketplaceParticipations();
    res.json({ ok: true, payload: r?.payload ?? null });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log("API rodando na porta " + PORT));
