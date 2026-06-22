import os
import json
from flask import Flask, request, jsonify
import google.generativeai as genai
from supabase import create_client

app = Flask(__name__)

# إعداد الاتصال باستخدام متغيرات البيئة (لا تضع المفاتيح هنا!)
supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

def get_customer_info(phone):
    """جلب بيانات العميل من قاعدة البيانات"""
    response = supabase.table("customers").select("customer_name, customer_type").eq("phone_number", phone).execute()
    return response.data[0] if response.data else None

def get_products_from_db():
    """جلب المنتجات من قاعدة البيانات"""
    response = supabase.table("products").select("*").execute()
    return response.data

def get_ai_response(user_message, customer):
    """توليد الرد باستخدام Gemini"""
    products = get_products_from_db()
    model = genai.GenerativeModel('gemini-pro')
    
    # تحديد بيانات العميل
    name = customer['customer_name'] if customer else "الغالية"
    c_type = customer['customer_type'] if customer else "عزيزتنا"
    
    # توجيهات النظام
    system_instruction = f"""
    أنتِ مستشارة مبيعات خبيرة في متجر 'جلنار' للعناية بالشعر.
    بيانات العميل الحالية: الاسم {name}، النوع {c_type}.
    
    الأسلوب الصنعاني مطلوب: "يا غالية"، "نورتينا"، "من عيوني"، "حاضرين للطيبين".
    - استخدمي دائماً صيغة الجمع للاحترام (أهلاً بكم، طلباتكم، يسعدنا خدمتكم).
    - لا تسألي العميل عن نوعه أبداً، خاطبيه باسمه فوراً.
    - إذا ذكر العميل كلمة 'صالون' في استفساره، استبدليها بكلمة 'كوافير'.
    - استخدمي قائمة الأسعار هذه للرد: {json.dumps(products, ensure_ascii=False)}.
    - إذا كان العميل من نوع 'salon' (كوافير)، استخدمي حصراً سعر (price_salon).
    - إذا كان العميل من نوع 'personal' (فرد)، استخدمي حصراً سعر (price_personal).
    """
    
    response = model.generate_content(system_instruction + "\nرسالة العميل: " + user_message)
    return response.text

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    phone = data.get("phone") 
    user_message = data.get("message", "")
    msg_type = data.get("type", "text") 
    
    # التعامل مع الرسائل الصوتية
    if msg_type == 'audio':
        return jsonify({"reply": "يا غالية، نورتينا. يفضل أن ترسلي استفسارك نصياً عشان أقدر أخدمكِ بدقة وبأسرع وقت بخصوص منتجاتنا وأسعارنا. بانتظار رسالتك!"})

    # معالجة الرسائل النصية
    customer = get_customer_info(phone)
    reply = get_ai_response(user_message, customer)
    
    return jsonify({"reply": reply})

@app.route('/')
def home():
    return "بوت جلنار يعمل بنجاح!"

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)