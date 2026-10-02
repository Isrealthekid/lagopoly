import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database';
if(!process.env.SUPABASE_DB_URL || !process.argv[2])throw new Error('Set SUPABASE_DB_URL and supply the existing SQLite path.');
const source=new DatabaseSync(process.argv[2],{readOnly:true});
const destination=openDatabase(process.env.SUPABASE_DB_URL);
try {
  await destination.transaction(async()=>{
    if(Number((await destination.prepare('SELECT count(*) AS count FROM users').get())!.count)!==0 || Number((await destination.prepare('SELECT count(*) AS count FROM rooms').get())!.count)!==0)throw new Error('Import requires an empty target. No existing records will be overwritten.');
    for(const row of source.prepare('SELECT * FROM users').all())await destination.prepare('INSERT INTO users(id,username,key,salt,password) VALUES (?,?,?,?,?)').run(row.id,row.username,row.key,row.salt,row.password);
    for(const row of source.prepare('SELECT * FROM sessions').all())await destination.prepare('INSERT INTO sessions(token,"user",expires) VALUES (?,?,?)').run(row.token,row.user,row.expires);
    for(const row of source.prepare('SELECT * FROM rooms').all())await destination.prepare('INSERT INTO rooms(code,payload) VALUES (?,?)').run(row.code,row.payload);
  });
  console.log('Account, session and room import completed. Source database was not modified.');
}finally{source.close();await destination.close();}
