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

// جلب بيانات العميل والمنتجات
async function getCustomerInfo(phone) {
    const { data } = await supabase.from("customers").select("customer_name, customer_type").eq("phone_number", phone);
    return data && data.length > 0 ? data[0] : null;
}

async function getProductsFromDB() {
    const { data } = await supabase.from("products").select("*");
    return data || [];
}

// الرد الذكي
async function getAIResponse(userMessage, customer) {
    const products = await getProductsFromDB();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const name = customer ? customer.customer_name : "الغالية";
    const cType = customer ? customer.customer_type : "عزيزتنا";

    const systemInstruction = `أنتِ مستشارة مبيعات خبيرة في متجر 'جلنار'. الاسم ${name}، النوع ${cType}. الأسلوب الصنعاني مطلوب. استخدمي قائمة الأسعار هذه: ${JSON.stringify(products)}.`;
    const result = await model.generateContent(systemInstruction + "\nرسالة العميل: " + userMessage);
    return result.response.text();
}

// تشغيل البوت
async function startBot() {
    console.log("جاري محاولة الاتصال بالواتساب..."); // سطر تصحيحي
    const { state, saveCreds } = await useMultiFileAuthState('jolnar_session_v1');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Jolnar Bot', 'Chrome', '1.0.0'], // إضافة متصفح لضمان الاستقرار
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // إذا كان هناك رمز QR، سيطبعه فوراً
        if (qr) {
            console.log("يجب أن يظهر الـ QR Code الآن:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("الاتصال مغلق، إعادة المحاولة...", shouldReconnect);
            if (shouldReconnect) startBot();
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

// فتح منفذ للخادم (لإرضاء Render)
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('جلنار تعمل بنجاح!'));
app.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
    startBot();
});
