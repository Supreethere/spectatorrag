'use client';

import React, { useState, useRef, useEffect, ChangeEvent } from 'react';

// --- TYPES ---
interface ChatMsg {
  role: 'sys' | 'usr';
  text: string;
  attachments?: string[]; 
}

interface HistoryItem {
  role: 'user' | 'model';
  parts: { text?: string; file_data?: { file_uri: string; mime_type: string } }[];
}

export default function SpectatorConsole() {
  // --- STATE ---
  const [apiKey, setApiKey] = useState<string>('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoMime, setVideoMime] = useState<string>('');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false); 
  const [isInferenceRunning, setIsInferenceRunning] = useState(false); 
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [uploadBtnText, setUploadBtnText] = useState('INITIALIZE 3 FLASH');

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const userInRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<HTMLSelectElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const MODEL = 'gemini-3-flash-preview';

  useEffect(() => {
    let k = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!k) k = localStorage.getItem('spectator_key_v7_pro') || '';
    setApiKey(k);
    addLog('sys', 'Welcome to SPECTATOR PRO. Please upload a video file or provide a network stream URL to begin analysis.');
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleChatClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.classList.contains('ts-link') ? target : target.closest('.ts-link');
    if (link) {
      const seconds = link.getAttribute('data-sec');
      if (seconds && videoRef.current) {
        videoRef.current.currentTime = parseFloat(seconds);
        videoRef.current.play();
      }
    }
  };

  // --- EVIDENCE CAPTURE ENGINE (RESTORED FULL LOGIC) ---
  const captureEvidence = async (timestampStr: string, isZoom: boolean): Promise<string | null> => {
    if (!videoBlob) return null;
    const [m, s] = timestampStr.split(':').map(Number);
    const timeInSeconds = m * 60 + s;

    return new Promise((resolve) => {
      const tempVideo = document.createElement('video');
      tempVideo.src = URL.createObjectURL(videoBlob);
      tempVideo.currentTime = timeInSeconds;
      tempVideo.muted = true;
      
      tempVideo.onseeked = () => {
        const canvas = canvasRef.current;
        if (!canvas) { resolve(null); return; }
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }

        canvas.width = tempVideo.videoWidth;
        canvas.height = tempVideo.videoHeight;
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);

        if (isZoom) {
          const zoomFactor = 0.4; // Original 40% crop
          const sw = canvas.width * zoomFactor;
          const sh = canvas.height * zoomFactor;
          const sx = (canvas.width - sw) / 2;
          const sy = (canvas.height - sh) / 2;

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width; 
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx?.drawImage(canvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          
          if (tempCtx) {
            tempCtx.strokeStyle = 'red';
            tempCtx.lineWidth = 5;
            tempCtx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
            tempCtx.fillStyle = 'red';
            tempCtx.font = '30px monospace';
            tempCtx.fillText(`ZOOM TARGET // ${timestampStr}`, 30, 60);
          }
          resolve(tempCanvas.toDataURL('image/jpeg'));
        } else {
           ctx.strokeStyle = '#00f0ff';
           ctx.lineWidth = 4;
           ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
           resolve(canvas.toDataURL('image/jpeg'));
        }
      };
      tempVideo.load();
    });
  };

  const formatText = (text: string) => {
    let processed = text.replace(/(\d{1,2}):(\d{2})/g, (match, m, s) => {
      const sec = parseInt(m) * 60 + parseInt(s);
      return `<span class="ts-link" data-sec="${sec}"><i class="ph-bold ph-play-circle"></i> ${match}</span>`;
    });
    processed = processed.replace(/\[THREAT: (.*?)\]/g, '<span class="threat-alert"><i class="ph-bold ph-warning"></i> $1</span>');
    processed = processed.replace(/\[PROOF: .*?\]/g, '').replace(/\[ZOOM: .*?\]/g, '');
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    return processed;
  };

  const addLog = (role: 'sys' | 'usr', text: string, attachments?: string[]) => {
    setMessages(prev => [...prev, { role, text, attachments }]);
  };

  const saveAuth = () => {
    const k = document.getElementById('key-field') as HTMLInputElement;
    if (k && k.value) {
      setApiKey(k.value);
      localStorage.setItem('spectator_key_v7_pro', k.value);
      setIsAuthOpen(false);
    }
  };

  const resetSession = () => {
    setFileUri(null);
    setHistory([]);
    setMessages(prev => [...prev, { role: 'sys', text: '--- SESSION CLEARED ---' }]);
    setUploadBtnText('INITIALIZE 3 FLASH');
  };

  const manualReset = () => {
    setVideoBlob(null);
    setFileName('');
    if(videoRef.current) {
        videoRef.current.src = "";
        videoRef.current.style.display = 'none';
    }
    resetSession();
  };

  const stageFile = (file: File) => {
    if (!file) return;
    resetSession();
    const safeType = file.type || 'video/mp4';
    setVideoBlob(file);
    setVideoMime(safeType);
    setFileName(file.name);
    if (videoRef.current) {
      videoRef.current.src = URL.createObjectURL(file);
      videoRef.current.style.display = 'block';
    }
    setUploadBtnText(`INGEST: ${file.name.substring(0, 10)}...`);
    addLog('sys', `Data buffered [${(file.size / 1024 / 1024).toFixed(1)}MB]. Ready to Ingest.`);
  };

  // --- FIXED: FETCH NETWORK (NO LONGER ASSUMES JSON) ---
  const fetchNet = async () => {
    const url = urlInputRef.current?.value;
    if (!url) return;
    setIsUploading(true);
    setUploadBtnText("FETCHING...");
    addLog('sys', 'Connecting to Stream Proxy...');

    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      
      // If the proxy returns an error code, it will be text, not a blob
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Proxy failed.');
      }

      const blob = await res.blob();
      let type = blob.type;
      if (!type || type.includes('text/plain')) type = 'video/mp4';
      
      const file = new File([blob], 'network_stream.mp4', { type });
      stageFile(file);
      addLog('sys', 'Stream captured successfully.');
    } catch (e: any) {
      addLog('sys', `Network Error: ${e.message}`);
      setUploadBtnText("FETCH ERROR");
    } finally {
      setIsUploading(false);
    }
  };

  const uploadToGemini = async () => {
    if (!videoBlob || !apiKey) {
      if(!apiKey) setIsAuthOpen(true);
      return;
    }
    setIsUploading(true);
    setUploadProgress(5);

    try {
      addLog('sys', 'Initializing Resumable Upload...');
      const init = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Type': videoMime,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: 'spectator_v7_clip' } }),
      });

      if (!init.ok) throw new Error("Upload Handshake Failed. Check API Key.");
      const upUrl = init.headers.get('X-Goog-Upload-URL');
      if (!upUrl) throw new Error("No upload URL received.");

      setUploadProgress(30);
      const sent = await fetch(upUrl, {
        method: 'POST',
        headers: {
          'Content-Length': videoBlob.size.toString(),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: videoBlob,
      });

      if(!sent.ok) throw new Error("Byte transmission failed.");
      const fMeta = await sent.json();
      const uri = fMeta.file.uri;
      setFileUri(uri);
      setUploadProgress(60);

      let ready = false;
      while (!ready) {
        addLog('sys', 'Google Cloud Processing (Indexing)...');
        await new Promise((r) => setTimeout(r, 4000));
        const check = await fetch(`${uri}?key=${apiKey}`);
        const status = await check.json();
        if (status.state === 'ACTIVE') ready = true;
        if (status.state === 'FAILED') throw new Error('Gemini Video Indexing Failed');
      }

      setUploadProgress(100);
      addLog('sys', 'Neural Indexing Complete.');
      setUploadBtnText('SYSTEM ACTIVE');
      setIsUploading(false);
      
      const initialPrompt = modeRef.current?.value;
      if(initialPrompt) await generate(initialPrompt, uri);

    } catch (e: any) {
      addLog('sys', `CRITICAL FAILURE: ${e.message}`);
      setIsUploading(false);
      setUploadBtnText("RETRY UPLOAD");
    }
  };

  const generate = async (text: string, overrideUri?: string) => {
    const activeUri = overrideUri || fileUri;
    if (!text || !activeUri) return;
    const isAuto = text === modeRef.current?.value && history.length === 0;
    if (!isAuto) addLog('usr', text);
    setIsInferenceRunning(true);

    try {
      // RESTORED ORIGINAL PROMPT LOGIC
      const formattedPrompt = `
        ROLE: Forensic Security Analyst.
        TASK: ${text}
        
        CRITICAL OBSERVATION RULES:
        1. THEFT & CONCEALMENT: Look closely for "snatch-and-grab", pickpocketing, shoplifting, or putting items in pockets/bags. 
        2. ANTI-HALLUCINATION: Do NOT interpret rapid snatching, grabbing, or reaching motions as "high-fives", "handshakes", or friendly gestures. Scrutinize hand interactions. If ownership of an object changes rapidly, it is likely theft.
        3. THREATS: If you detect weapons, fire, fighting, theft, robbery, blood, or aggression, wrap the description in brackets: [THREAT: Theft Detected] or [THREAT: Physical Assault].
        4. TIMESTAMPS: Always provide timestamps for every event in format MM:SS.
        
        EVIDENCE PROTOCOL (IMPORTANT):
        - If you identify a THREAT, THEFT, or SUSPICIOUS ACTIVITY, you MUST generate a snapshot command.
        - To take a standard photo, output: [PROOF: MM:SS] 
        - To ZOOM IN on a suspect's face or the stolen item, output: [ZOOM: MM:SS]
        - Example: "Theft detected at 00:15 [THREAT: Phone Snatching]. [ZOOM: 00:15]"
      `;

      const parts: any[] = [{ text: formattedPrompt }];
      if (history.length === 0) {
        parts.unshift({ file_data: { file_uri: activeUri, mime_type: videoMime } });
      }

      const turn = { role: 'user', parts } as HistoryItem;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [...history, turn] }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No Response";
      const evidenceRegex = /\[(PROOF|ZOOM): (\d{1,2}:\d{2})\]/g;
      const matches = [...reply.matchAll(evidenceRegex)];
      const newAttachments: string[] = [];

      for (const match of matches) {
        const img = await captureEvidence(match[2], match[1] === 'ZOOM');
        if (img) newAttachments.push(img);
      }

      addLog('sys', reply, newAttachments.length > 0 ? newAttachments : undefined);
      setHistory((prev) => [
        ...prev,
        { role: 'user', parts: [{ text }] } as HistoryItem,
        { role: 'model', parts: [{ text: reply }] } as HistoryItem,
      ]);
    } catch (e: any) {
      addLog('sys', `Inference Error: ${e.message}`);
    } finally {
      setIsInferenceRunning(false);
    }
  };

  const handleManualQuery = () => {
    const txt = userInRef.current?.value.trim();
    if (txt) {
      generate(txt);
      if(userInRef.current) userInRef.current.value = '';
    }
  };

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="ambient-field">
        <div className="orb o1"></div><div className="orb o2"></div><div className="orb o3"></div>
      </div>

      {isAuthOpen && (
        <div id="auth-gate">
          <div className="auth-box">
             <h3 style={{ color: 'var(--rose)', marginTop: 0, fontFamily: 'JetBrains Mono' }}>API KEY CONFIG</h3>
             <input type="password" id="key-field" className="auth-inp" placeholder="AIzaSy..." defaultValue={apiKey} />
             <button className="btn-act" onClick={saveAuth} style={{ background: 'var(--rose)', color: 'white' }}>SAVE & CONNECT</button>
          </div>
        </div>
      )}

      <div id="console-body">
        <header>
          <div className="branding">SPECTATOR PRO</div>
          <div className="status-group">
            <div className="sys-ind reset" onClick={manualReset}><i className="ph-bold ph-arrow-counter-clockwise"></i> RESET</div>
            <div className="sys-ind" onClick={() => setIsAuthOpen(true)}><i className="ph-bold ph-wifi-high"></i> {apiKey ? "ONLINE" : "NO KEY"}</div>
          </div>
        </header>

        <div id="core-layout">
          <div id="control-panel">
            <div className="lbl">SOURCE STREAM</div>
            <div className="tab-box">
              <div className={`tab ${activeTab === 0 ? 'active' : ''}`} onClick={() => !isUploading && setActiveTab(0)}>FILE UPLOAD</div>
              <div className={`tab ${activeTab === 1 ? 'active' : ''}`} onClick={() => !isUploading && setActiveTab(1)}>NETWORK URL</div>
            </div>

            {activeTab === 0 ? (
              <div className="drop-target" onClick={() => !isUploading && fileInputRef.current?.click()}>
                <i className="ph ph-file-video" style={{ fontSize: '2rem', color: '#555' }}></i>
                <div style={{ fontSize: '0.7rem', marginTop: '8px', color: '#888' }}>CLICK TO STAGE FOOTAGE</div>
                <input type="file" accept="video/*" hidden ref={fileInputRef} onChange={(e) => e.target.files && stageFile(e.target.files[0])} />
              </div>
            ) : (
              <div id="p-net">
                <input type="text" ref={urlInputRef} id="url-field" placeholder="YouTube or MP4 Link..." />
                <button className="btn-act" onClick={fetchNet} disabled={isUploading}><i className="ph ph-download"></i> {isUploading ? "BUSY..." : "PULL BYTES"}</button>
              </div>
            )}

            <video id="video-stage" controls playsInline ref={videoRef} style={{ display: 'none', width: '100%', marginTop: '10px', borderRadius: '8px', border: '1px solid #333' }}></video>

            <div className="lbl" style={{marginTop: '20px'}}>INFERENCE MODE</div>
            <select id="mode" ref={modeRef} disabled={isUploading || fileUri !== null}>
              <option value="Timeline Log: Provide detailed timestamped chronological events. Focus on interactions.">Chronological Event Log</option>
              <option value="Security Scan: Flag theft, pickpocketing, weapons, aggression, or fire immediately. Verify if 'friendly' gestures are actually theft.">Threat Detection Priority</option>
              <option value="OCR Scan: Extract all text, license plates, and signage numbers.">OCR Data Extraction</option>
              <option value="Crowd Ops: Count subjects and analyze crowd movement patterns.">Crowd Dynamics & Counting</option>
            </select>

            {isUploading && <div className="progress-ui" style={{ display: 'block' }}><div className="prog-fill" style={{width: `${uploadProgress}%`}}></div></div>}

            <div style={{ marginTop: 'auto' }}>
              <button id="ignite-btn" className="btn-act" onClick={uploadToGemini} disabled={!videoBlob || isUploading || fileUri !== null}>
                <i className={`ph-bold ${fileUri ? 'ph-check' : 'ph-lightning'}`}></i> {uploadBtnText}
              </button>
            </div>
          </div>

          <div id="feed-zone">
            <div id="chat-stream" onClick={handleChatClick}>
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="tag">{m.role === 'sys' ? 'SPECTATOR (3)' : 'OPERATOR'}</div>
                  <div className="bubble" dangerouslySetInnerHTML={{ __html: formatText(m.text) }} />
                  {m.attachments && (
                    <div className="evidence-grid">
                      {m.attachments.map((img, idx) => (
                        <div key={idx} className="evidence-card">
                           <div className="ev-tag">EVIDENCE-{idx + 1}</div>
                           <img src={img} alt="Evidence" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isInferenceRunning && <div className="msg sys"><div className="bubble" style={{opacity:0.7}}>Running 3 Flash Inference...</div></div>}
              <div ref={chatEndRef} />
            </div>

            <div id="input-deck">
              <input ref={userInRef} type="text" placeholder={fileUri ? "Inference query..." : "Waiting..."} disabled={!fileUri || isInferenceRunning || isUploading} onKeyDown={(e) => e.key === 'Enter' && handleManualQuery()} />
              <div id="send-fab" className={fileUri && !isInferenceRunning ? 'active' : ''} onClick={handleManualQuery}><i className="ph-bold ph-paper-plane-right"></i></div>
            </div>
          </div>
        </div>
      </div>

 
    </>
  );
}