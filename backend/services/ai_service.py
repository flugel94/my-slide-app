import os
import json
import re
import base64
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# --- 🤖 Model Definitions ---
TEXT_MODEL_NAME = "models/gemini-3-pro-preview"
IMAGE_MODEL_NAME = "models/gemini-3-pro-image-preview" 
VISION_MODEL_NAME = "models/gemini-3-pro-preview"

# --- 🧠 Brain Functions ---

def generate_draft_concept(topic: str, slide_count: int = 5, is_locked: bool = False):
    """ Page 1 -> 2: 構成案生成 """
    print(f"📝 Draft Generation ({'LOCKED' if is_locked else 'CREATIVE'}) with {TEXT_MODEL_NAME}...")
    model = genai.GenerativeModel(TEXT_MODEL_NAME)
    
    if is_locked:
        prompt = f"""
        あなたは「文章フォーマッター」です。
        ユーザーが入力したテキスト「{topic}」を、プレゼンテーション用スライドデータ（JSON）に変換してください。

        【絶対遵守ルール】
        1. **内容を改変・創作しないでください**。入力されたテキストに含まれる情報のみを使用してください。
        2. 箇条書きや長い文章は、意味のまとまりごとに分割して、指定された{slide_count}枚のスライドに配分してください。
        3. 全項目を「日本語」で記述してください。

        【出力形式】
        JSON形式のみ返してください。
        {{
          "slides": [
             {{ 
               "title": "...", 
               "content": "...", 
               "visual_prompt": "..." 
             }}, ...
          ]
        }}
        """
    else:
        # ★★★ 構造化プロンプト (Ameba Design System Style) ★★★
        prompt = f"""
        あなたはプロのプレゼンテーション・ディレクターです。
        テーマ「{topic}」に基づいて、合計{slide_count}枚のスライド構成案を作成してください。
        
        【言語設定】
        **すべての項目（タイトル、本文、画像生成プロンプト）を「日本語」で記述してください。**

        【content（本文）の記述ルール】
        スライドの本文は、長文を避け、構造的に分解して記述してください。
        必ず【見出し】を使って要素を明確にしてください。
        
        悪い例: "現状の課題はユーザーの離脱率が高く、その原因はUIが複雑だからです。"
        良い例: 
        "【現状の課題】: ユーザーの離脱率が高い
         【原因】: UIが複雑で導線が不明確
         【影響】: 売上の低下"
        
        【visual_prompt（画像生成指示）の記述ルール】
        画像生成AIへの指示です。以下の項目を必ず含めて、構造的に記述してください。
        
        【役割】 プロのグラフィックデザイナー
        【作成物】 インフォグラフィック風のスライドデザイン。必要な情報をわかりやすく伝えるため、読みやすい文字要素を含む。レイアウトは整理され、丸みのある図形やアイコンで構成する。（16:9）
        【カラールール】 （例：アクセント：明るいグリーン (82BE28_1)、・サブカラー：ビビッドなイエロー (F5E100_1)）
        【トーン＆マナー】 （例：Ameba のデザインシステム風…親しみやすさ（丸み）×信頼感（幾何学的）/ モダンで視認性が高い雰囲気 / フォントイメージ：丸みを帯びたサンセリフ、可読性重視）
        【文字スタイル】 （例：太めのサンセリフ体で見出しを強調）
        【生成したいイメージ例】 （例：・タイトル・短い説明文・3〜4個のポイントを箇条書き・アイコンを伴う整理されたブロック構造）
        【スタイル】 （例：フラットデザイン、アイソメトリック）

        【出力要件】
        JSON形式のみ返してください。Markdown不要。
        {{
          "slides": [
            {{
                "title": "スライドタイトル",
                "content": "【要素1】: 内容...\\n【要素2】: 内容...",
                "visual_prompt": "【役割】...【生成したいイメージ例】..."
            }}, ...
          ]
        }}
        """

    try:
        response = model.generate_content(prompt)
        return _clean_and_parse_json(response.text)
    except Exception as e:
        print(f"Draft Error: {e}")
        return {"slides": []}

def generate_image(prompt: str):
    """ Page 2 -> 3: 画像生成 """
    try:
        print(f"🎨 Generating image with {IMAGE_MODEL_NAME}...")
        model = genai.GenerativeModel(IMAGE_MODEL_NAME)
        response = model.generate_content(prompt)
        
        if response.parts:
            for part in response.parts:
                if part.inline_data:
                    return base64.b64encode(part.inline_data.data).decode('utf-8')
        return None
    except Exception as e:
        print(f"Image Gen Error: {e}")
        return None

def analyze_layout_from_image(image_base64: str):
    return analyze_slide_for_remake(image_base64)

def analyze_slide_for_remake(image_base64: str):
    """
    Export (Remake): 画像解析 & 要素分解 (Reverse Engineering)
    ★修正: 「丸と四角で表現できないもの」を Type D (diagram_image) として検出するロジックを追加
    """
    try:
        print(f"🔬 Full Remake Analysis (Decomposition) with {VISION_MODEL_NAME}...")
        model = genai.GenerativeModel(VISION_MODEL_NAME)
        image_part = {"mime_type": "image/png", "data": image_base64}
        
        prompt = """
        あなたは「リバースエンジニアリング・デザイナー」です。
        提供されたスライド画像を解析し、それを**「Googleスライドで編集可能なデータ」**に変換するJSONを作成してください。

        【重要方針: ハイブリッド再構築】
        1. **文字・単純図形**: 基本的には文字や四角形・円に分解して表現してください。
        2. **複雑なビジュアル (例外)**: 
           **単純な図形（丸や四角）の組み合わせでは表現しきれないもの**（例: 具体的なイラスト、写真、複雑な3Dグラフィック、詳細なインフォグラフィック）は、
           無理に分解せず、**「画像として再生成して貼り付ける」**という判断を下してください。
           これらは `diagram_image` タイプとして定義します。

        【抽出エレメント (elements)】
        以下の4タイプに分類して抽出してください。

        Type A: "text" (文字)
          - text: 内容
          - color: Hex
          - fontSize: pt (高さ540pt基準)
          - bbox: [x, y, w, h]
          - fontWeight: "bold" or "normal"
          - align: "left", "center", "right"

        Type B: "shape" (図形・装飾)
          ボタン、枠線、背景座布団など。
          - shape_type: "RECTANGLE", "ROUND_RECTANGLE", "ELLIPSE"
          - color: Hex
          - opacity: 0.0-1.0
          - bbox: [x, y, w, h]

        Type C: "icon" (単純なアイコン)
          Lucideアイコンで表現できるもの。
          - icon_name: (monitor, smartphone, cloud, user, etc...)
          - color: Hex
          - bbox: [x, y, w, h]

        Type D: "diagram_image" (★再生成が必要な画像)
          丸や四角で表現できない、イラストや複雑な図解。
          - prompt: その領域をImagenで再生成するための、具体的で詳細な英語プロンプト。
            (例: "A 3D isometric illustration of a futuristic city with green energy nodes, white background")
          - bbox: [x, y, w, h]

        【JSON出力形式】
        {
          "background_color": "#FFFFFF", 
          "elements": [
             { "type": "text", "text": "...", ... },
             { "type": "shape", "shape_type": "RECTANGLE", ... },
             { "type": "diagram_image", "prompt": "...", "bbox": [...] }
          ]
        }
        """
        
        response = model.generate_content([prompt, image_part])
        data = _clean_and_parse_json(response.text)
        
        if "elements" not in data:
            data["elements"] = []
            
        return data

    except Exception as e:
        print(f"Full Remake Analysis Error: {e}")
        return {"background_color": "#FFFFFF", "elements": []}

# --- 🛠️ Helpers ---

def _clean_and_parse_json(text):
    try:
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*$', '', text)
        text = text.strip()
        start = text.find('{')
        end = text.rfind('}') + 1
        return json.loads(text[start:end]) if start != -1 else json.loads(text)
    except:
        return {}