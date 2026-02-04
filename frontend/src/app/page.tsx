"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, Layers, MonitorPlay, FileText, Lock, Unlock } from "lucide-react";

// コンポーネントのインポート
import Step1Concept from "@/components/Step1Concept";
import Step2Editor from "@/components/Step2Editor";

export default function Home() {
  const { data: session } = useSession();
  
  // --- State Management ---
  const [step, setStep] = useState(0); 
  const [loading, setLoading] = useState(false);
  
  // Project Settings
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(3);
  const [isLocked, setIsLocked] = useState(false); 

  // Data Passing
  const [draftData, setDraftData] = useState([]);       
  const [generatedSlides, setGeneratedSlides] = useState([]);

  // --- Actions ---

  // Step 0 -> Step 1: ドラフト作成
  const startDraft = async () => {
    if(!topic) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/step1-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            title: topic, 
            count: slideCount,
            is_locked: isLocked 
        })
      });
      const data = await res.json();
      
      setDraftData(data.data.slides);
      setStep(1);
    } catch(e) { console.error(e); alert("構成案の作成に失敗しました"); }
    setLoading(false);
  };

  // Step 1 -> Step 2: 画像を一括生成してエディタへ
  const handleStep1Next = async (_unusedDesign: string, slides: any[]) => {
    setLoading(true);
    try {
        const promises = slides.map(async (slide) => {
            
            // ★★★ ここがプロンプト生成の心臓部です！ ★★★
            // AI (Imagen 3) に送る指示書をここで組み立てています。
            const prompt = `
            "${slide.visual_prompt}"
            ======以下、スライドに盛り込んで欲しい内容======
            - **タイトル (Large, Top/Center): "${slide.title}"
            - **本文 (Medium, Readable)**: "${slide.content}"`;
            
            try {
                const res = await fetch("http://localhost:8000/api/step3-gen-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt })
                });
                const data = await res.json();
                return { ...slide, backgroundImage: data.image_base64 };
            } catch (error) {
                console.error("Image Gen Error", error);
                return { ...slide, backgroundImage: null };
            }
        });

        const slidesWithImages = await Promise.all(promises);
        setGeneratedSlides(slidesWithImages);
        setStep(2);

    } catch(e) { 
        console.error(e); 
        alert("画像の生成に失敗しました"); 
    }
    setLoading(false);
  };

  // Export (書き出し)
  const handleExport = async (finalSlides: any) => {
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/export", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({ title: topic, slides: finalSlides })
      });
      const data = await res.json();
      if(data.url) window.open(data.url, '_blank');
    } catch(e) { console.error(e); alert("書き出しに失敗しました"); }
    setLoading(false);
  };

  // --- Render: Login Screen ---
  if (!session) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-black z-0"></div>
      
      <Card className="p-10 shadow-2xl w-[420px] text-center bg-slate-900/80 border-slate-800 backdrop-blur-md relative z-10">
        <div className="mb-8 flex justify-center">
          <div className="p-4 bg-slate-800 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-blue-500/30">
            <Sparkles className="h-10 w-10 text-blue-400 animate-pulse" />
          </div>
        </div>
        <h1 className="font-bold text-3xl mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400">
          Cyber Slide Tools
        </h1>
        <p className="text-slate-400 text-sm mb-8 font-medium">Professional AI Presentation Generator</p>
        <Button onClick={() => signIn("google")} className="w-full h-12 bg-white text-slate-900 hover:bg-slate-200 font-bold">
          Google アカウントで開始
        </Button>
      </Card>
      
      <div className="absolute bottom-6 text-xs text-slate-600 z-10 font-mono">
        POWERED BY GEMINI 3.0 PRO
      </div>
    </div>
  );

  // --- Render: Main App ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      
      {/* Header */}
      <div className="w-full bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => step > 0 && confirm("トップに戻りますか？(データは失われます)") && setStep(0)}>
            <div className="h-9 w-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md">
              <MonitorPlay size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight font-sans">Cyber Slide Tools</h1>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
               <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Logged in as</p>
               <p className="text-sm font-bold text-slate-800">{session.user?.name}</p>
             </div>
             {session.user?.image && (
               // eslint-disable-next-line @next/next/no-img-element
               <img src={session.user.image} alt="User" className="w-9 h-9 rounded-full border-2 border-slate-200" />
             )}
             <Button variant="outline" size="sm" onClick={() => signOut()} className="text-xs font-bold border-slate-300 text-slate-500 hover:text-red-500 hover:bg-red-50">LOGOUT</Button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[1400px] px-6 py-8 flex-1 flex flex-col">
        
        {/* Step 0: New Project (入力画面) */}
        {step === 0 && (
          <div className="flex-1 flex items-center justify-center pb-20">
            <Card className="w-full max-w-2xl p-10 space-y-8 shadow-2xl border-t-4 border-blue-500 animate-in zoom-in-95">
              <div className="text-center sm:text-left">
                <h2 className="text-3xl font-bold text-slate-800">New Project</h2>
                <p className="text-slate-500 text-lg">AIと共に、最高のスライドを作りましょう。</p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <FileText size={16} /> テーマ・入力内容
                  </label>
                  <textarea 
                    className="border-2 border-slate-200 p-4 w-full rounded-xl text-lg focus:border-blue-500 outline-none transition-all placeholder:text-slate-300 font-medium min-h-[150px] resize-none" 
                    placeholder="例: 次世代SNSアプリの事業計画書..." 
                    value={topic} 
                    onChange={e => setTopic(e.target.value)} 
                    autoFocus
                  />
                </div>

                {/* ロックモード切替スイッチ */}
                <div 
                    onClick={() => setIsLocked(!isLocked)}
                    className={`
                        flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all select-none group
                        ${isLocked ? "border-purple-500 bg-purple-50 ring-2 ring-purple-200" : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"}
                    `}
                >
                    <div className={`
                        p-3 rounded-full transition-all duration-300
                        ${isLocked ? "bg-purple-600 text-white shadow-lg scale-110" : "bg-slate-200 text-slate-400 group-hover:bg-slate-300"}
                    `}>
                        {isLocked ? <Lock size={24}/> : <Unlock size={24}/>}
                    </div>
                    <div>
                        <h4 className={`font-bold text-lg transition-colors ${isLocked ? "text-purple-800" : "text-slate-700"}`}>
                            {isLocked ? "構成ロック (原文維持)" : "AI構成生成 (Creative)"}
                        </h4>
                        <p className="text-sm text-slate-500 mt-1">
                            {isLocked 
                                ? "入力されたテキストを改変せず、そのまま分割してスライド化します。" 
                                : "入力テーマを元に、AIが最適な構成・文章・キャッチコピーを提案します。"}
                        </p>
                    </div>
                </div>

                <div className="space-y-4 bg-slate-50 p-6 rounded-xl border border-slate-100">
                   <div className="flex justify-between items-end">
                      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Layers size={16} /> スライド枚数
                      </label>
                      <span className="text-2xl font-bold text-blue-600 font-mono">
                        {slideCount} <span className="text-sm text-slate-400 font-sans">枚</span>
                      </span>
                   </div>
                   
                   <div className="relative pt-2">
                     <input 
                       type="range" min="1" max="10" step="1"
                       value={slideCount} 
                       onChange={(e) => setSlideCount(parseInt(e.target.value))}
                       className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700 transition-all"
                     />
                     <div className="flex justify-between text-xs font-bold text-slate-400 mt-2 px-1">
                       <span>Min (1枚)</span>
                       <span>Standard (5枚)</span>
                       <span>Max (10枚)</span>
                     </div>
                   </div>
                </div>
              </div>

              <Button 
                onClick={startDraft} 
                disabled={loading || !topic} 
                className={`
                    w-full h-16 text-lg text-white shadow-xl transition-all font-bold rounded-xl 
                    ${isLocked 
                        ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200" 
                        : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"}
                `}
              >
                {loading 
                    ? <div className="flex items-center gap-3"><Loader2 className="animate-spin h-6 w-6"/> 作成中...</div> 
                    : (isLocked ? <><Lock className="mr-2 h-5 w-5"/> ロックしてスライド化 (Start)</> : <><Sparkles className="mr-2 h-5 w-5"/> AI構成案を作成 (Generate)</>)
                }
              </Button>
            </Card>
          </div>
        )}

        {/* Step 1: Draft Review */}
        {step === 1 && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <Step1Concept 
              initialSlides={draftData} 
              onNext={handleStep1Next} 
              loading={loading} 
              initialLocked={isLocked}
            />
          </div>
        )}
        
        {/* Step 2: Editor */}
        {step === 2 && (
          <div className="animate-in zoom-in-95 duration-500">
            <Step2Editor 
              slides={generatedSlides} 
              onExport={handleExport} 
              loading={loading} 
            />
          </div>
        )}

      </div>
    </div>
  );
}