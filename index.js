require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const pino = require('pino');

// إعداد الاتصال
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// جلب بيانات العميل
async function getCustomerInfo(phone) {
    const { data } = await supabase.from("customers").select("customer_name, customer_type").eq("phone_number", phone);
    return data && data.length > 0 ? data[0] : null;
}

// جلب المنتجات
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

    const systemInstruction = `
    أنتِ مستشارة مبيعات خبيرة في متجر 'جلنار' للعناية بالشعر.
    بيانات العميل الحالية: الاسم ${name}، النوع ${cType}.
    الأسلوب الصنعاني مطلوب: "يا غالية"، "نورتينا"، "من عيوني"، "حاضرين للطيبين".
    - استخدمي دائماً صيغة الجمع للاحترام (أهلاً بكم، طلباتكم، يسعدنا خدمتكم).
    - لا تسألي العميل عن نوعه أبداً، خاطبيه باسمه فوراً.
    - إذا ذكر العميل كلمة 'صالون' في استفساره، استبدليها بكلمة 'كوافير'.
    - استخدمي قائمة الأسعار هذه للرد: ${JSON.stringify(products)}.
    - إذا كان العميل من نوع 'salon' (كوافير)، استخدمي حصراً سعر (price_salon).
    - إذا كان العميل من نوع 'personal' (فرد)، استخدمي حصراً سعر (price_personal).
    `;

    const result = await model.generateContent(systemInstruction + "\nرسالة العميل: " + userMessage);
    return result.response.text();
}

// اتصال واتساب
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('جلنار متصلة بالواتساب بنجاح!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) return; // حماية المجموعات

        const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const message = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        
        // التعامل مع الصوت
        if (msg.message?.audioMessage || msg.message?.voiceMessage) {
            await sock.sendMessage(msg.key.remoteJid, { text: "يا غالية، نورتينا. يفضل أن ترسلي استفسارك نصياً عشان أقدر أخدمكِ بدقة. بانتظار رسالتك!" });
            return;
        }

        const customer = await getCustomerInfo(phone);
        const reply = await getAIResponse(message, customer);
        await sock.sendMessage(msg.key.remoteJid, { text: reply });
    });
}

startBot();
