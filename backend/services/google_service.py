import base64
import io
import time
import json
import logging
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials

# ★画像生成関数をインポート
from services.ai_service import generate_image

# --- 📝 ログ設定 ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Helper Functions ---

def _get_creds(token: str):
    return Credentials(token=token)

def _get_drive_service(creds):
    return build('drive', 'v3', credentials=creds)

def _get_slides_service(creds):
    return build('slides', 'v1', credentials=creds)

def _safe_hex_to_rgb(hex_color):
    """ 安全な色変換 """
    default_color = {'red': 0, 'green': 0, 'blue': 0}
    
    if not hex_color or not isinstance(hex_color, str):
        return default_color
    
    try:
        clean_hex = hex_color.lstrip('#').strip()
        if len(clean_hex) == 3:
            clean_hex = ''.join([c*2 for c in clean_hex])
        if len(clean_hex) != 6:
            return default_color
        return {
            'red': int(clean_hex[0:2], 16) / 255.0,
            'green': int(clean_hex[2:4], 16) / 255.0,
            'blue': int(clean_hex[4:6], 16) / 255.0
        }
    except Exception:
        return default_color

# --- Drive Operations ---

def upload_image_to_drive(token: str, folder_id: str, image_base64: str, filename: str):
    creds = _get_creds(token)
    service = _get_drive_service(creds)
    try:
        image_data = base64.b64decode(image_base64)
        file_metadata = {'name': filename, 'parents': [folder_id]}
        media = MediaIoBaseUpload(io.BytesIO(image_data), mimetype='image/png', resumable=True)
        
        file = service.files().create(
            body=file_metadata, 
            media_body=media, 
            fields='id, thumbnailLink, webContentLink'
        ).execute()
        
        file_id = file.get('id')
        service.permissions().create(fileId=file_id, body={'type': 'anyone', 'role': 'reader'}).execute()
        
        thumbnail_link = file.get('thumbnailLink')
        image_url = thumbnail_link.replace('=s220', '=s3000') if thumbnail_link else file.get('webContentLink')
            
        return {"file_id": file_id, "url": image_url}
    except Exception as e:
        logger.error(f"❌ Upload Error: {e}")
        return None

def get_or_create_project_folder(token: str, folder_name="CyberSlide_Assets"):
    creds = _get_creds(token)
    service = _get_drive_service(creds)
    query = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
    results = service.files().list(q=query, spaces='drive', fields='files(id)').execute()
    files = results.get('files', [])
    if files: return files[0]['id']
    
    file_metadata = {'name': folder_name, 'mimeType': 'application/vnd.google-apps.folder'}
    file = service.files().create(body=file_metadata, fields='id').execute()
    return file.get('id')


# --- Slides Operations ---

def create_presentation_from_drive_images(token: str, title: str, slides_data: list):
    creds = _get_creds(token)
    slides_service = _get_slides_service(creds)
    
    # 画像保存用フォルダを確保
    folder_id = get_or_create_project_folder(token)

    logger.info(f"🚀 Creating presentation: {title}")
    presentation = slides_service.presentations().create(body={'title': title}).execute()
    presentation_id = presentation.get('presentationId')
    initial_slide_id = presentation.get('slides')[0]['objectId']
    
    # 白紙スライド作成
    requests = []
    for i in range(len(slides_data)):
        requests.append({
            'createSlide': {
                'objectId': f"gen_slide_{i}_{int(time.time())}",
                'insertionIndex': i + 1,
                'slideLayoutReference': {'predefinedLayout': 'BLANK'}
            }
        })
    requests.append({ 'deleteObject': { 'objectId': initial_slide_id } })
    
    if requests:
        slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': requests}).execute()
        requests = []

    pres = slides_service.presentations().get(presentationId=presentation_id).execute()
    pages = pres.get('slides', [])

    # 各スライドの描画処理
    for i, slide_item in enumerate(slides_data):
        if i >= len(pages): break
        page_id = pages[i]['objectId']
        slide_requests = []
        
        remake_data = slide_item.get('remake_data')
        is_vector_mode = False
        
        if remake_data and isinstance(remake_data, dict):
            if remake_data.get('elements') and len(remake_data.get('elements', [])) > 0:
                is_vector_mode = True

        if is_vector_mode:
            logger.info(f"🎨 Slide {i+1}: Hybrid Vector Rendering...")
            try:
                # ★ tokenとfolder_idを渡す (画像再生成用)
                _add_remake_requests(slide_requests, page_id, remake_data, token, folder_id)
                
                if slide_requests:
                    slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': slide_requests}).execute()
                    logger.info(f"✅ Slide {i+1}: Render Success!")
                    continue 

            except HttpError as e:
                logger.error(f"❌ Slide {i+1}: Vector Render Rejected! Reason: {e}")
                logger.info(f"🔄 Slide {i+1}: Falling back to Image Mode...")
                slide_requests = [] 
            except Exception as e:
                logger.error(f"❌ Slide {i+1}: Logic Error: {e}")
                slide_requests = []

        # フォールバック (画像モード)
        logger.info(f"🖼️ Slide {i+1}: Fallback/Default Image Mode")
        _add_only_image_background(slide_requests, page_id, slide_item)
        
        if slide_requests:
            try:
                slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': slide_requests}).execute()
            except Exception as e:
                logger.error(f"💀 Slide {i+1}: Critical Error: {e}")

    return presentation_id


def _add_remake_requests(requests, page_id, remake_data, token, folder_id):
    """ Hybrid Vector Mode Request Builder """
    
    SCALE_X = 720.0 / 960.0
    SCALE_Y = 405.0 / 540.0

    bg_color = remake_data.get('background_color', '#FFFFFF')
    
    # 背景色
    requests.append({
        'updatePageProperties': {
            'objectId': page_id,
            'pageProperties': {
                'pageBackgroundFill': {
                    'solidFill': { 'color': {'rgbColor': _safe_hex_to_rgb(bg_color)} }
                }
            },
            'fields': 'pageBackgroundFill'
        }
    })

    elements = remake_data.get('elements', [])
    for idx, el in enumerate(elements):
        el_type = el.get('type')
        bbox = el.get('bbox', [0,0,100,100])
        
        x = max(0, bbox[0] * SCALE_X)
        y = max(0, bbox[1] * SCALE_Y)
        w = max(1, bbox[2] * SCALE_X) 
        h = max(1, bbox[3] * SCALE_Y) 
        
        obj_id = f"{page_id}_el_{idx}"
        rgb = _safe_hex_to_rgb(el.get('color', '#000000'))
        
        opacity = el.get('opacity', 1.0)
        try:
            opacity = float(opacity)
            opacity = max(0.0, min(1.0, opacity))
        except:
            opacity = 1.0

        # --- ★ Type D: Diagram Image (再生成＆配置) ---
        if el_type == 'diagram_image':
            prompt = el.get('prompt')
            if prompt:
                logger.info(f"🖼️ Regenerating Diagram: {prompt[:40]}...")
                # 1. 画像生成
                gen_base64 = generate_image(prompt)
                if gen_base64:
                    # 2. Driveへアップロード
                    timestamp = int(time.time())
                    upload_res = upload_image_to_drive(token, folder_id, gen_base64, f"diagram_{idx}_{timestamp}.png")
                    
                    if upload_res and upload_res.get('url'):
                        # 3. スライドに配置
                        requests.append({
                            'createImage': {
                                'objectId': obj_id,
                                'url': upload_res['url'],
                                'elementProperties': {
                                    'pageObjectId': page_id,
                                    'size': {'width': {'magnitude': w, 'unit': 'PT'}, 'height': {'magnitude': h, 'unit': 'PT'}},
                                    'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': x, 'translateY': y, 'unit': 'PT'}
                                }
                            }
                        })
                        continue # 画像が成功したら、この要素の処理は完了

        # --- Type A: Text ---
        if el_type == 'text':
            requests.append({
                'createShape': {
                    'objectId': obj_id,
                    'shapeType': 'TEXT_BOX',
                    'elementProperties': {
                        'pageObjectId': page_id,
                        'size': {'width': {'magnitude': w, 'unit': 'PT'}, 'height': {'magnitude': h, 'unit': 'PT'}},
                        'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': x, 'translateY': y, 'unit': 'PT'}
                    }
                }
            })
            
            text_content = el.get('text', '')
            if not text_content or str(text_content).strip() == "":
                text_content = " "
            
            requests.append({ 'insertText': {'objectId': obj_id, 'text': str(text_content)} })
            
            font_size = el.get('fontSize', 14)
            try:
                font_size = float(font_size) * SCALE_Y
                font_size = max(1.0, font_size)
            except:
                font_size = 14

            style = {
                'fontSize': {'magnitude': font_size, 'unit': 'PT'},
                'foregroundColor': {'opaqueColor': {'rgbColor': rgb}},
                'bold': True if el.get('fontWeight') == 'bold' else False
            }
            requests.append({
                'updateTextStyle': {
                    'objectId': obj_id,
                    'style': style,
                    'fields': 'fontSize,foregroundColor,bold'
                }
            })
            
            align_raw = el.get('align', 'left').lower()
            align_map = {'left': 'START', 'center': 'CENTER', 'right': 'END', 'justify': 'JUSTIFIED'}
            requests.append({
                 'updateParagraphStyle': {
                     'objectId': obj_id,
                     'style': {'alignment': align_map.get(align_raw, 'START')},
                     'fields': 'alignment'
                 }
            })

        # --- Type B: Shape ---
        elif el_type == 'shape':
            raw_shape = el.get('shape_type', 'RECTANGLE')
            valid_shapes = ['RECTANGLE', 'ROUND_RECTANGLE', 'ELLIPSE']
            google_shape = raw_shape if raw_shape in valid_shapes else 'RECTANGLE'

            requests.append({
                'createShape': {
                    'objectId': obj_id,
                    'shapeType': google_shape,
                    'elementProperties': {
                        'pageObjectId': page_id,
                        'size': {'width': {'magnitude': w, 'unit': 'PT'}, 'height': {'magnitude': h, 'unit': 'PT'}},
                        'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': x, 'translateY': y, 'unit': 'PT'}
                    }
                }
            })
            requests.append({
                'updateShapeProperties': {
                    'objectId': obj_id,
                    'shapeProperties': {
                        'shapeBackgroundFill': {
                            'solidFill': { 'color': {'rgbColor': rgb}, 'alpha': opacity }
                        },
                        'outline': {'propertyState': 'NOT_RENDERED'}
                    },
                    'fields': 'shapeBackgroundFill,outline'
                }
            })

        # --- Type C: Icon ---
        elif el_type == 'icon':
            requests.append({
                'createShape': {
                    'objectId': obj_id,
                    'shapeType': 'ELLIPSE', 
                    'elementProperties': {
                        'pageObjectId': page_id,
                        'size': {'width': {'magnitude': w, 'unit': 'PT'}, 'height': {'magnitude': h, 'unit': 'PT'}},
                        'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': x, 'translateY': y, 'unit': 'PT'}
                    }
                }
            })
            requests.append({
                'updateShapeProperties': {
                    'objectId': obj_id,
                    'shapeProperties': {
                        'shapeBackgroundFill': {'solidFill': { 'color': {'rgbColor': rgb}, 'alpha': 0.1 }},
                        'outline': {
                            'outlineFill': {'solidFill': {'color': {'rgbColor': rgb}}}, 
                            'weight': {'magnitude': 2, 'unit': 'PT'}
                        }
                    },
                    'fields': 'shapeBackgroundFill,outline'
                }
            })
            
            icon_name = el.get('icon_name', 'icon')
            if not icon_name: icon_name = "icon"
            
            requests.append({ 'insertText': {'objectId': obj_id, 'text': str(icon_name)} })
            requests.append({
                 'updateParagraphStyle': {
                     'objectId': obj_id,
                     'style': {'alignment': 'CENTER'},
                     'fields': 'alignment'
                 }
            })


def _add_only_image_background(requests, page_id, slide_item):
    """ Fallback: Image Mode """
    if slide_item.get('drive_url'):
        requests.append({
            'updatePageProperties': {
                'objectId': page_id,
                'pageProperties': {
                    'pageBackgroundFill': {
                        'stretchedPictureFill': {'contentUrl': slide_item['drive_url']}
                    }
                },
                'fields': 'pageBackgroundFill'
            }
        })