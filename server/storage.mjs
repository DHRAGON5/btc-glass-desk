import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
export class Storage {
  constructor(dir){mkdirSync(dir,{recursive:true});this.db=new DatabaseSync(join(dir,'desk.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, time INTEGER, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, body TEXT NOT NULL, created INTEGER);
    CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, endpoint TEXT, body TEXT, created INTEGER, attempts INTEGER DEFAULT 0, next INTEGER DEFAULT 0);
  `);}
  get(key,fallback=null){const x=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);try{return x?JSON.parse(x.value):fallback;}catch{return fallback;}}
  set(key,value){this.db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key,JSON.stringify(value));}
  events(){return this.db.prepare('SELECT body FROM events ORDER BY time DESC LIMIT 200').all().map(x=>JSON.parse(x.body));}
  record(event,notify=false){
    this.db.exec('BEGIN IMMEDIATE');try{
      const result=this.db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?)').run(event.eventId,event.receivedAt,JSON.stringify(event));
      if(result.changes&&notify){for(const sub of this.subscriptions())this.db.prepare('INSERT OR IGNORE INTO outbox (id,endpoint,body,created) VALUES (?,?,?,?)').run(event.eventId+'|'+sub.endpoint,sub.endpoint,JSON.stringify(event),Date.now());}
      this.db.prepare('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY time DESC LIMIT 1000)').run();
      this.db.exec('COMMIT');return Boolean(result.changes);
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  subscriptions(){return this.db.prepare('SELECT body FROM subscriptions').all().map(x=>JSON.parse(x.body));}
  subscribe(sub){if(this.subscriptions().length>=10&&!this.subscriptions().some(x=>x.endpoint===sub.endpoint))throw Error('Maximal zehn Geräte');this.db.prepare('INSERT OR REPLACE INTO subscriptions VALUES (?,?,?)').run(sub.endpoint,JSON.stringify(sub),Date.now());}
  unsubscribe(endpoint){this.db.prepare('DELETE FROM subscriptions WHERE endpoint=?').run(endpoint);this.db.prepare('DELETE FROM outbox WHERE endpoint=?').run(endpoint);}
  due(){this.db.prepare('DELETE FROM outbox WHERE created<? OR attempts>=3').run(Date.now()-60000);return this.db.prepare('SELECT * FROM outbox WHERE next<=? LIMIT 20').all(Date.now());}
  done(id){this.db.prepare('DELETE FROM outbox WHERE id=?').run(id);}
  retry(id){this.db.prepare('UPDATE outbox SET attempts=attempts+1,next=? WHERE id=?').run(Date.now()+5000,id);}
  close(){this.db.close();}
}
