import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Neon exige SSL
});

// converte "?" para $1, $2, ... (mantém suas queries atuais)
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

export const openDb = () => pool;
export const all = async (_db, sql, params = []) =>
  (await pool.query(toPg(sql), params)).rows;

export const get = async (_db, sql, params = []) =>
  (await pool.query(toPg(sql), params)).rows[0] || null;

export const run = async (_db, sql, params = []) =>
  (await pool.query(toPg(sql), params));
