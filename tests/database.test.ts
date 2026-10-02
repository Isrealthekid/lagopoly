import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseTlsOptions, openDatabase } from '../server/database';
it('rolls back partial writes and preserves sessions and room data across restarts',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'monopoly-storage-')),file=join(folder,'accounts.sqlite');
  let db=openDatabase(file);
  try{
    await expect(db.transaction(async()=>{
      await db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('failed','Failed','failed','salt','hash');
      throw new Error('interrupt');
    })).rejects.toThrow('interrupt');
    expect(await db.prepare('SELECT id FROM users WHERE id=?').get('failed')).toBeUndefined();
    await db.transaction(async()=>{
      await db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('retained','Ada','ada','salt','hash');
      await db.prepare('INSERT INTO sessions(token,"user",expires) VALUES (?,?,?)').run('session','retained',Date.now()+10000);
      await db.prepare('INSERT INTO rooms VALUES (?,?)').run('ABC234','{"revision":3}');
      await db.prepare('INSERT INTO completed VALUES (?,?,?)').run('DONE23','{"winner":0}',Date.now()+10000);
    });
    await db.close();db=openDatabase(file);
    expect((await db.prepare('SELECT "user" FROM sessions WHERE token=?').get('session'))?.user).toBe('retained');
    expect((await db.prepare('SELECT payload FROM rooms WHERE code=?').get('ABC234'))?.payload).toBe('{"revision":3}');
    expect((await db.prepare('SELECT payload FROM completed WHERE code=?').get('DONE23'))?.payload).toBe('{"winner":0}');
  }finally{
    await db.close();for(const suffix of ['','-wal','-shm'])if(existsSync(file+suffix))unlinkSync(file+suffix);rmdirSync(folder);
  }
});

afterEach(()=>vi.unstubAllEnvs());
it('trusts the configured Supabase certificate while keeping TLS verification enabled',()=>{
  vi.stubEnv('SUPABASE_DB_CA','-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----');
  const ssl=databaseTlsOptions();
  expect(ssl.rejectUnauthorized).toBe(true);
  expect(ssl.ca?.at(-1)).toBe('-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----');
  expect(ssl.ca!.length).toBeGreaterThan(1);
});
