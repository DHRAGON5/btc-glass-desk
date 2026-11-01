import {existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import webpush from 'web-push';
if(existsSync('.env')){console.log('.env existiert bereits. Vorhandene Schlüssel bleiben erhalten.');process.exit(0);}
const vapid=webpush.generateVAPIDKeys();
const content=`PORT=3000\nPUBLIC_ORIGIN=http://localhost:3000\nAPP_PASSWORD=${randomBytes(18).toString('base64url')}\nSESSION_SECRET=${randomBytes(48).toString('base64url')}\nVAPID_PUBLIC_KEY=${vapid.publicKey}\nVAPID_PRIVATE_KEY=${vapid.privateKey}\nVAPID_SUBJECT=mailto:you@example.com\nDATA_DIR=./data\n`;
writeFileSync('.env',content,{mode:0o600});console.log('.env wurde mit eigenen Schlüsseln erstellt. APP_PASSWORD in .env ist dein App Passwort. VAPID_SUBJECT auf deine E Mail Adresse setzen.');
