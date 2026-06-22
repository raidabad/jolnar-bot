from flask import Flask, request, jsonify
from ai_engine import get_ai_response

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    # هنا ستصل رسائل الواتساب
    data = request.json
    user_msg = data.get('message', '')
    
    # الرد الذكي
    bot_reply = get_ai_response(user_msg)
    
    # هنا يتم إرسال الرد عبر مكتبة واتساب (Baileys wrapper)
    return jsonify({"status": "success", "reply": bot_reply})

if __name__ == '__main__':
    app.run(debug=True)