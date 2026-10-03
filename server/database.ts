import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';
import { rootCertificates } from 'node:tls';

export function databaseTlsOptions() {
  const certificate=process.env.SUPABASE_DB_CA?.replace(/\\n/g,'\n') ??
    (process.env.SUPABASE_DB_CA_FILE ? readFileSync(process.env.SUPABASE_DB_CA_FILE,'utf8') : readFileSync(new URL('./certificates/supabase-root-2021.crt',import.meta.url),'utf8'));
  return {rejectUnauthorized:true,...(certificate ? {ca:[...rootCertificates,certificate]} : {})};
}

type Row = Record<string, unknown>;
export interface Database {
  prepare(sql: string): { get(...values: unknown[]): Promise<Row | undefined>; all(...values: unknown[]): Promise<Row[]>; run(...values: unknown[]): Promise<void> };
  transaction<T>(fn: () => Promise<T>, readOnly?: boolean): Promise<T>;
  close(): Promise<void>;
}
export function openDatabase(connection: string): Database {
  if (/^postgres(?:ql)?:\/\//.test(connection)) {
    const url=new URL(connection);
    // URL SSL parameters must not override verified TLS configuration.
    for(const name of ['ssl','sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(name);
    const pool = new pg.Pool({ connectionString: url.toString(), max: 5,
      ssl: databaseTlsOptions(),
      connectionTimeoutMillis: 10000, statement_timeout: 15000 });
    const current = new AsyncLocalStorage<pg.PoolClient>();
    const query = async (sql: string, values: unknown[]) => {
      let index = 0;
      const translated = sql.replace(/\?/g, () => `$${++index}`);
      return (current.getStore() ?? pool).query(translated, values);
    };
    return {
      prepare: sql => ({ get: async (...v) => (await query(sql,v)).rows[0], all: async (...v) => (await query(sql,v)).rows, run: async (...v) => { await query(sql,v); } }),
      transaction: async (fn,readOnly=false) => {
        const client = await pool.connect();
        try {
          await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
          // Serialize game mutations across processes, including joins and AI turns.
          if(!readOnly)await client.query('SELECT pg_advisory_xact_lock(734829105)');
          await client.query('SET LOCAL search_path TO monopoly, pg_catalog');
          const result = await current.run(client,fn);
          await client.query('COMMIT');
          return result;
        } catch(error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
      close: async () => { await pool.end(); },
    };
  }
  if(connection!==':memory:')mkdirSync(dirname(connection),{recursive:true});
  const sqlite = new DatabaseSync(connection);
  sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL,key TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS completed(code TEXT PRIMARY KEY,payload TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS administrators(user_id TEXT PRIMARY KEY REFERENCES users(id));`);
  let queue: Promise<unknown> = Promise.resolve();
  return {
    prepare: sql => ({ get: async (...v) => sqlite.prepare(sql).get(...v as never[]) as Row|undefined, all: async (...v) => sqlite.prepare(sql).all(...v as never[]) as Row[], run: async (...v) => {sqlite.prepare(sql).run(...v as never[]);} }),
    transaction: fn => {
      const work = queue.then(async () => {
        sqlite.exec('BEGIN');
        try { const result = await fn(); sqlite.exec('COMMIT'); return result; }
        catch(error) {sqlite.exec('ROLLBACK');throw error;}
      });
      queue=work.catch(()=>{});return work;
    },
    close: async()=>{await queue;sqlite.close();},
  };
}
