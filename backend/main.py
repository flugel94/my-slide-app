from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from services import ai_service, google_service
import uvicorn
import os

app = FastAPI()

# CORS設定 (フロントエンドからのアクセス許可)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request Models ---

class Step1Request(BaseModel):
    title: str
    count: int = 5
    is_locked: bool = False # ★追加: ロックモードフラグ

class Step3Request(BaseModel):
    image_base64: str

class ExportRequest(BaseModel):
    title: str
    slides: list

# --- API Endpoints ---

@app.post("/api/step1-draft")
async def step1_draft(req: Step1Request):
    # ロックフラグを ai_service に渡す
    data = ai_service.generate_draft_concept(req.title, req.count, req.is_locked)
    return {"status": "success", "data": data}

@app.post("/api/step3-gen-image")
async def step3_gen_image(req: dict): 
    # { prompt: str }
    prompt = req.get("prompt", "")
    img_b64 = ai_service.generate_image(prompt)
    if not img_b64:
        raise HTTPException(status_code=500, detail="画像の生成に失敗しました")
    return {"image_base64": img_b64}

@app.post("/api/step3-analyze-layout")
async def step3_analyze(req: Step3Request):
    data = ai_service.analyze_slide_for_remake(req.image_base64)
    return {"status": "success", "layout": data}

@app.post("/api/export")
async def export_slides_endpoint(req: ExportRequest, authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided")
    
    token = authorization.replace("Bearer ", "")
    
    # Driveフォルダ準備
    folder_id = google_service.get_or_create_project_folder(token)
    
    # 画像アップロード & URL置換
    processed_slides = []
    for i, slide in enumerate(req.slides):
        new_slide = slide.copy()
        
        # 背景画像がある場合、Driveにアップロード
        if slide.get("backgroundImage"):
            # ファイル名を一意にするためタイムスタンプなどを入れるのが理想だが、簡易的にindexで
            res = google_service.upload_image_to_drive(
                token, 
                folder_id, 
                slide["backgroundImage"], 
                f"slide_bg_{i}.png"
            )
            if res:
                new_slide["drive_url"] = res["url"]
        
        processed_slides.append(new_slide)

    # スライド作成
    pres_id = google_service.create_presentation_from_drive_images(token, req.title, processed_slides)
    
    return {"status": "success", "url": f"https://docs.google.com/presentation/d/{pres_id}/edit"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)