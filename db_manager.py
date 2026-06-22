def get_products():
    try:
        # قمنا بإضافة .schema("public") لنضمن أننا نقرأ من الجدول الصحيح
        response = supabase.table("products").select("*").execute()
        return response.data
    except Exception as e:
        print(f"حدث خطأ: {e}")
        return []