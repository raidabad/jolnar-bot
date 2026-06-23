require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');

// إعداد الاتصال
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getCustomerInfo(phone) {
    const { data } = await supabase.from("customers").select("customer_name, customer_type").eq("phone_number", phone);
    return data && data.length > 0 ? data[0] : null;
}

async function getProductsFromDB() {
    const { data } = await supabase.from("products").select("*");
    return data || [];
}

async function getAIResponse(userMessage, customer) {
    const products = await getProductsFromDB();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const name = customer ? customer.customer_name : "الغالية";
    const cType = customer ? customer.customer_type : "عزيزتنا";
    const systemInstruction = `أنتِ مستشارة مبيعات خبيرة في متجر 'جلنار'. الاسم ${name}، النوع ${cType}. الأسلوب الصنعاني مطلوب. استخدمي قائمة الأسعار هذه: ${JSON.stringify(products)}.`;
    const result = await model.generateContent(systemInstruction + "\nرسالة العميل: " + userMessage);
    return result.response.text();
}

async function startBot() {
    console.log("جاري محاولة الاتصال بالواتساب...");
    // استخدام مجلد مؤقت للجلسة
    const { state, saveCreds } = await useMultiFileAuthState('./jolnar_session');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Jolnar', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
            if (requiresPatch) {
                message = { ...message, ...{ viewOnceMessage: { message: { messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} }, ...message } } } };
            }
            return message;
        },
        options: {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("=== QR CODE START ===");
            qrcode.generate(qr, { small: true });
            console.log("=== QR CODE END ===");
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log("الاتصال مغلق، السبب:", statusCode);
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(startBot, 5000); 
            }
        } else if (connection === 'open') {
            console.log('جلنار متصلة بالواتساب بنجاح!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) return;

        const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const message = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        
        if (msg.message?.audioMessage || msg.message?.voiceMessage) {
            await sock.sendMessage(msg.key.remoteJid, { text: "يا غالية، نورتينا. يرجى إرسال استفسارك نصياً لخدمتك بشكل أفضل." });
            return;
        }

        const customer = await getCustomerInfo(phone);
        const reply = await getAIResponse(message, customer);
        await sock.sendMessage(msg.key.remoteJid, { text: reply });
    });
}

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('جلنار تعمل بنجاح!'));
app.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
    startBot();
});
