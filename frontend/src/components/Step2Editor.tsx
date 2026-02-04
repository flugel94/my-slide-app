import { useEffect, useRef, useState } from "react";
import { fabric } from "fabric"; 
import { Button } from "@/components/ui/button";
import { 
  Download, 
  Type, 
  Layout, 
  MousePointer2, 
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Layers,
  Undo2
} from "lucide-react";

export default function Step3Editor({ slides, onExport, loading: exporting }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  
  // 状態管理
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideStates, setSlideStates] = useState<any[]>(slides);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // 表示モード: "image" (元画像) or "vector" (AIリメイク)
  const [viewMode, setViewMode] = useState<"image" | "vector">("image");

  const CANVAS_WIDTH = 960;
  const CANVAS_HEIGHT = 540;

  // 1. Canvas初期化
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: CANVAS_WIDTH, 
      height: CANVAS_HEIGHT,
      backgroundColor: "#f3f4f6",
      preserveObjectStacking: true,
      selection: true
    });
    
    setFabricCanvas(canvas);
    return () => { canvas.dispose(); };
  }, []);

  // 2. 描画更新
  useEffect(() => {
    if (!fabricCanvas) return;
    loadSlideToCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlideIndex, fabricCanvas, slideStates, viewMode]);

  const loadSlideToCanvas = () => {
    if (!fabricCanvas) return;
    fabricCanvas.clear();

    const slide = slideStates[currentSlideIndex];
    
    // --- モード A: 元画像表示 (Image Mode) ---
    if (viewMode === "image" || !slide.remake_data) {
        if (slide.backgroundImage) {
            fabric.Image.fromURL(`data:image/png;base64,${slide.backgroundImage}`, (img) => {
                img.scaleToWidth(CANVAS_WIDTH);
                img.scaleToHeight(CANVAS_HEIGHT);
                img.selectable = false;
                fabricCanvas.setBackgroundImage(img, fabricCanvas.renderAll.bind(fabricCanvas));
            }, { crossOrigin: 'anonymous' });
        }
        // 簡易テキストレイアウト
        if (slide.layout?.title) addTextBox('title', slide.layout.title, slide.title);
        if (slide.layout?.content) addTextBox('content', slide.layout.content, slide.content);
    }
    
    // --- モード B: AIリメイク表示 (Vector Mode) ---
    else if (viewMode === "vector" && slide.remake_data) {
        const data = slide.remake_data;
        
        // 1. 背景色
        fabricCanvas.setBackgroundColor(data.background_color || "#ffffff", fabricCanvas.renderAll.bind(fabricCanvas));

        // 2. 要素の描画
        data.elements.forEach((el: any) => {
            if (el.type === "shape") addShape(el);
            if (el.type === "icon") addIcon(el); // ★ここが変わりました
            if (el.type === "text") addFreeText(el);
        });
    }
  };

  // --- 図形描画 ---
  const addShape = (el: any) => {
      if (!fabricCanvas) return;
      const [x, y, w, h] = el.bbox;
      
      let shape;
      if (el.shape_type === "ELLIPSE") {
          shape = new fabric.Ellipse({
              left: x, top: y, rx: w/2, ry: h/2,
              fill: el.color, opacity: el.opacity || 1.0,
              selectable: true
          });
      } else {
          shape = new fabric.Rect({
              left: x, top: y, width: w, height: h,
              fill: el.color, opacity: el.opacity || 1.0,
              rx: el.shape_type === "ROUND_RECTANGLE" ? 10 : 0, 
              ry: el.shape_type === "ROUND_RECTANGLE" ? 10 : 0,
              selectable: true
          });
      }
      fabricCanvas.add(shape);
  };

  // --- ★新実装: アイコン描画 (Lucide SVG) ---
  const addIcon = (el: any) => {
      if (!fabricCanvas) return;
      const [x, y, w, h] = el.bbox;
      const iconName = el.icon_name || "circle"; // デフォルト
      const color = el.color || "#333333";

      // Lucideの公式CDNからSVGを取得
      const svgUrl = `https://unpkg.com/lucide-static@latest/icons/${iconName}.svg`;

      fabric.loadSVGFromURL(svgUrl, (objects, options) => {
          if (!objects || objects.length === 0) return;

          const iconGroup = fabric.util.groupSVGElements(objects, options);
          
          // サイズと位置の調整
          iconGroup.set({
              left: x,
              top: y,
              scaleX: w / (iconGroup.width || w),
              scaleY: h / (iconGroup.height || h),
              stroke: color, // LucideはStrokeベース
              fill: "transparent" // 塗りつぶしなし
          });

          // SVG内の全パスの色を強制変更
          if (iconGroup.type === "group") {
             // @ts-ignore
             iconGroup.getObjects().forEach((obj: any) => {
                 obj.set({ stroke: color });
             });
          }

          fabricCanvas.add(iconGroup);
      });
  };

  // --- テキスト描画 (Remake用) ---
  const addFreeText = (el: any) => {
      if (!fabricCanvas) return;
      const [x, y, w, h] = el.bbox;
      
      const textbox = new fabric.Textbox(el.text || "", {
          left: x, top: y, width: w,
          fontSize: el.fontSize || 18,
          fill: el.color || "#000000",
          fontWeight: el.fontWeight || 'normal',
          textAlign: el.align || 'left',
          backgroundColor: 'transparent',
          splitByGrapheme: true
      });
      fabricCanvas.add(textbox);
  };

  // --- テキスト描画 (Image Mode用) ---
  const addTextBox = (key: string, layoutConfig: any, textValue: string) => {
      if (!fabricCanvas) return;
      const textBox = new fabric.Textbox(textValue || "", {
          left: layoutConfig.left, top: layoutConfig.top, width: layoutConfig.width,
          fontSize: key === 'title' ? 42 : 24,
          fill: layoutConfig.color || '#000000',
          borderColor: '#2563eb', cornerStyle: 'circle', padding: 10,
          backgroundColor: 'rgba(255,255,255,0.3)'
      });
      fabricCanvas.add(textBox);
  }

  // --- Action: AIフルリメイク解析 ---
  const handleFullRemake = async () => {
      const slide = slideStates[currentSlideIndex];
      if (!slide.backgroundImage) return;

      setIsAnalyzing(true);
      try {
          const res = await fetch("http://localhost:8000/api/step3-analyze-layout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image_base64: slide.backgroundImage })
          });
          const data = await res.json();
          
          if (data.status === "success") {
              const newStates = [...slideStates];
              newStates[currentSlideIndex].remake_data = data.layout;
              setSlideStates(newStates);
              setViewMode("vector"); // 解析完了したらVectorモードへ
          }
      } catch (e) {
          console.error(e);
          alert("解析に失敗しました");
      }
      setIsAnalyzing(false);
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-4 animate-in zoom-in-95 duration-500 pb-20">
      
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Layout size={24}/></div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Editor</h2>
            <p className="text-xs text-slate-500">
                {viewMode === "image" ? "背景画像モード: テキストのみ編集可能" : "フルリメイクモード: すべての要素が編集可能"}
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
            {/* モード切替スイッチ */}
            {slideStates[currentSlideIndex].remake_data && (
                <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
                    <button onClick={() => setViewMode("image")} className={`px-3 py-1 rounded text-xs font-bold transition-all ${viewMode==="image" ? "bg-white shadow text-slate-800" : "text-slate-400"}`}>Image</button>
                    <button onClick={() => setViewMode("vector")} className={`px-3 py-1 rounded text-xs font-bold transition-all ${viewMode==="vector" ? "bg-white shadow text-blue-600" : "text-slate-400"}`}>Vector</button>
                </div>
            )}

            <Button 
                onClick={handleFullRemake} 
                disabled={isAnalyzing}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md border-0"
            >
                {isAnalyzing ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                {isAnalyzing ? "解析中..." : "AIフルリメイク (Full Remake)"}
            </Button>

            <Button 
                onClick={() => onExport(slideStates)} 
                disabled={exporting} 
                className="bg-slate-900 text-white hover:bg-slate-800"
            >
                {exporting ? "..." : <><Download className="mr-2 h-4 w-4"/> Export</>}
            </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
        {/* サムネイルリスト */}
        <div className="w-full lg:w-[200px] flex-shrink-0 bg-white rounded-xl border border-slate-200 overflow-y-auto p-2 custom-scrollbar">
            {slideStates.map((s, i) => (
                <div 
                    key={i}
                    onClick={() => setCurrentSlideIndex(i)}
                    className={`
                        mb-3 p-2 rounded-lg cursor-pointer border-2 transition-all relative
                        ${i === currentSlideIndex ? "border-blue-600 bg-blue-50 shadow-md" : "border-transparent hover:bg-slate-50"}
                    `}
                >
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-500">#{i + 1}</span>
                        {s.remake_data && <div className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded font-bold">Vector</div>}
                    </div>
                    <div className="aspect-video bg-slate-200 rounded overflow-hidden">
                        {s.backgroundImage ? (
                             // eslint-disable-next-line @next/next/no-img-element
                             <img src={`data:image/png;base64,${s.backgroundImage}`} alt="" className="w-full h-full object-cover" />
                        ) : <ImageIcon size={16}/>}
                    </div>
                </div>
            ))}
        </div>

        {/* キャンバス */}
        <div className="flex-1 bg-slate-100 rounded-xl border-2 border-slate-300 border-dashed flex items-center justify-center relative overflow-hidden">
            <div className="shadow-2xl rounded-sm overflow-hidden bg-white relative">
               <canvas ref={canvasRef} />
            </div>
            {viewMode === "vector" && (
                <div className="absolute top-4 right-4 bg-purple-600 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg animate-pulse pointer-events-none">
                    ✨ AI Reconstructed Mode
                </div>
            )}
        </div>
      </div>
    </div>
  );
}