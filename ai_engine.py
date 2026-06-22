import google.generativeai as genai
import json

# قم بوضع مفتاح الـ API الخاص بك هنا
genai.configure(api_key="YOUR_GEMINI_API_KEY")

def get_ai_response(user_message):
    # تحميل بيانات المنتجات
    with open('products.json', 'r', encoding='utf-8') as f:
        products = json.load(f)
    
    # تعريف النموذج
    model = genai.GenerativeModel('gemini-pro')
    
    # تعريف التعليمات (تم وضعها داخل الدالة وبمسافة بادئة صحيحة)
    system_instruction = f"""
    أنت مستشار مبيعات خبير في متجر 'جلنار' للعناية بالشعر. 
    قبل أن تعطي سعر أي منتج، اسأل العميل بلطف: "يا غالية، هل تطلبين للاستخدام الشخصي أم أنتِ صاحبة صالون/كوافير؟" 
    
    بناءً على إجابة العميل، استخدم الأسعار المحددة في بيانات المنتجات: {json.dumps(products, ensure_ascii=False)}.
    
    الأسلوب الصنعاني مطلوب: "يا غالية"، "نورتينا"، "من عيوني"، "حاضرين للطيبين".
    - إذا كان العميل كوافير، قدم له سعر الصالون المذكور في البيانات.
    - إذا كان العميل فرداً، قدم له سعر العميل العادي.
    """
    
    # توليد الرد بناءً على التعليمات ورسالة العميل
    response = model.generate_content(system_instruction + "\n" + user_message)
    
    return response.text