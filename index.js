const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') console.log('تم الاتصال بالواتساب بنجاح!');
        if (connection === 'close') connectToWhatsApp();
    });

    sock.ev.on('messages.upsert', async m => {
        console.log('رسالة جديدة:', JSON.stringify(m, undefined, 2));
    });
}

connectToWhatsApp();