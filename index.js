require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// إعداد الاتصال
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// جلب بيانات العميل
async function getCustomerInfo(phone) {
    const { data, error } = await supabase.from("customers").select("customer_name, customer_type").eq("phone_number", phone);
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

// الـ Webhook
app.post('/webhook', async (req, res) => {
    const { phone, message, type, isGroup } = req.body;

    // حماية المجموعات
    if (isGroup) {
        return res.status(200).json({ status: "ignored", reason: "group message" });
    }

    // التعامل مع الصوت
    if (type === 'audio') {
        return res.json({ reply: "يا غالية، نورتينا. يفضل أن ترسلي استفسارك نصياً عشان أقدر أخدمكِ بدقة وبأسرع وقت بخصوص منتجاتنا وأسعارنا. بانتظار رسالتك!" });
    }

    // المعالجة
    const customer = await getCustomerInfo(phone);
    const reply = await getAIResponse(message || "", customer);

    res.json({ reply: reply });
});

app.get('/', (req, res) => res.send("بوت جلنار يعمل بنجاح!"));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on port ${port}`));
