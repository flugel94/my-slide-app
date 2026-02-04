import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  ArrowRight, 
  Lock, 
  Unlock, 
  FileText, 
  Palette, 
  LayoutTemplate
} from "lucide-react";

export default function Step1Concept({ initialSlides, onNext, loading, initialLocked }: any) {
  // スライドデータとロック状態の管理
  const [slides, setSlides] = useState<any[]>(initialSlides || []);
  const [isLocked, setIsLocked] = useState(initialLocked || false);
  const [globalDesign, setGlobalDesign] = useState(""); // 必要に応じて使う

  // 親からのデータ変更を監視
  useEffect(() => {
    if (initialSlides) {
        setSlides(initialSlides);
    }
    if (initialLocked !== undefined) {
        setIsLocked(initialLocked);
    }
  }, [initialSlides, initialLocked]);

  // 入力変更ハンドラ
  const handleSlideChange = (index: number, field: string, value: string) => {
    if (isLocked) return; // ロック中は変更不可
    const newSlides = [...slides];
    newSlides[index] = { ...newSlides[index], [field]: value };
    setSlides(newSlides);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-20">
      
      {/* ヘッダーエリア */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutTemplate className="text-blue-600" />
            Step 1: Concept Draft
          </h2>
          <p className="text-slate-500">構成（テキスト）とデザイン（視覚）の方向性を定義します。</p>
        </div>

        {/* ロック切り替えスイッチ */}
        <div 
          onClick={() => setIsLocked(!isLocked)}
          className={`
            flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer border-2 transition-all select-none
            ${isLocked 
              ? "border-purple-500 bg-purple-50 text-purple-900" 
              : "border-slate-200 hover:bg-slate-50 text-slate-600"}
          `}
        >
          {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
          <span className="font-bold text-sm">
            {isLocked ? "内容をロック中 (編集不可)" : "編集モード (Editing)"}
          </span>
        </div>
      </div>

      {/* コンテンツエリア */}
      <div className="space-y-8">
        
        {/* スライドリスト */}
        {slides.map((slide, i) => (
          <Card key={i} className={`p-6 transition-all ${isLocked ? "bg-slate-50/50" : "bg-white"} border-l-4 border-l-blue-500 shadow-md`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-slate-800 text-white rounded-full flex items-center justify-center font-bold text-sm">
                {i + 1}
              </div>
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Slide {i + 1}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 左: テキスト構成 (日本語) */}
              <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 flex items-center gap-1 mb-1">
                        <FileText size={12}/> SLIDE TITLE
                    </label>
                    <input 
                        className={`w-full font-bold text-lg p-2 rounded border ${isLocked ? "bg-slate-100 text-slate-600 border-transparent cursor-not-allowed" : "bg-white border-slate-200 focus:border-blue-500 outline-none"}`}
                        value={slide.title}
                        onChange={(e) => handleSlideChange(i, 'title', e.target.value)}
                        readOnly={isLocked}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 flex items-center gap-1 mb-1">
                        <FileText size={12}/> CONTENT SCRIPT
                    </label>
                    <textarea 
                        className={`w-full p-3 rounded border text-sm leading-relaxed min-h-[120px] resize-none ${isLocked ? "bg-slate-100 text-slate-600 border-transparent cursor-not-allowed" : "bg-white border-slate-200 focus:border-blue-500 outline-none"}`}
                        value={slide.content}
                        onChange={(e) => handleSlideChange(i, 'content', e.target.value)}
                        readOnly={isLocked}
                    />
                </div>
              </div>

              {/* 右: デザイン指示 (画像生成用) */}
              <div className={`p-4 rounded-xl border-2 border-dashed ${isLocked ? "border-slate-200 bg-slate-50" : "border-yellow-200 bg-yellow-50/50"}`}>
                <label className="text-xs font-bold text-yellow-700 flex items-center gap-1 mb-2">
                    <Palette size={12}/> Visual Prompt Idea (個別画像の指示)
                </label>
                <textarea 
                    className={`w-full p-2 rounded border-0 bg-transparent text-sm min-h-[100px] resize-none focus:ring-0 outline-none ${isLocked ? "text-slate-500 cursor-not-allowed" : "text-slate-800 placeholder:text-yellow-700/30"}`}
                    placeholder="例: 未来都市の風景、握手するビジネスマン"
                    value={slide.visual_prompt || ""}
                    onChange={(e) => handleSlideChange(i, 'visual_prompt', e.target.value)}
                    readOnly={isLocked}
                />
              </div>
            </div>
          </Card>
        ))}

      </div>

      {/* フッターアクション */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 p-4 z-40">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
            <div className="text-xs text-slate-400 font-bold hidden sm:block">
                {isLocked 
                    ? "🔒 LOCK MODE: 内容を維持して進みます" 
                    : "📝 EDIT MODE: テキストを自由に編集できます"}
            </div>
            <Button 
                onClick={() => onNext(globalDesign, slides)} 
                disabled={loading}
                className={`px-8 h-12 text-lg shadow-xl transition-all font-bold rounded-xl ${isLocked ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
                Next: プロンプト生成 (Step 2) <ArrowRight className="ml-2" />
            </Button>
        </div>
      </div>
      
    </div>
  );
}