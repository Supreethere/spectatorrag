'use client';

import React, { useState, useRef, useEffect, ChangeEvent } from 'react';

interface ChatMsg {
  role: 'sys' | 'usr';
  text: string;
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

  // File Data
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoMime, setVideoMime] = useState<string>('');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  
  // Logic States
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false); 
  const [isInferenceRunning, setIsInferenceRunning] = useState(false); 
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [uploadBtnText, setUploadBtnText] = useState('INITIALIZE 2.5 FLASH');

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const userInRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<HTMLSelectElement>(null);

  const MODEL = 'gemini-2.5-flash';

  // --- INIT ---
  useEffect(() => {
    let k = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!k) k = localStorage.getItem('spectator_key_v7_pro') || '';
    setApiKey(k);
    addLog('sys', 'Visual Cortex (2.5) online. Waiting for video ingestion...');
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- GLOBAL CLICK HANDLER FOR TIMESTAMPS ---
  const handleChatClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Check if clicked element or its parent is a timestamp link
    const link = target.classList.contains('ts-link') ? target : target.closest('.ts-link');
    
    if (link) {
      const seconds = link.getAttribute('data-sec');
      if (seconds && videoRef.current) {
        videoRef.current.currentTime = parseFloat(seconds);
        videoRef.current.play();
      }
    }
  };

  // --- TEXT PARSER (TIMESTAMPS & THREATS) ---
  const formatText = (text: string) => {
    // 1. Process Timestamps (MM:SS) -> Convert to clickable spans
    let processed = text.replace(/(\d{1,2}):(\d{2})/g, (match, m, s) => {
      const sec = parseInt(m) * 60 + parseInt(s);
      return `<span class="ts-link" data-sec="${sec}"><i class="ph-bold ph-play-circle"></i> ${match}</span>`;
    });

    // 2. Process Threats (Matches [THREAT: ...])
    processed = processed.replace(/\[THREAT: (.*?)\]/g, '<span class="threat-alert"><i class="ph-bold ph-warning"></i> $1</span>');

    // 3. Standard formatting
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    
    return processed;
  };

  // --- HELPERS ---
  const addLog = (role: 'sys' | 'usr', text: string) => {
    setMessages(prev => [...prev, { role, text }]);
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
    setUploadBtnText('INITIALIZE 2.5 FLASH');
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

  // --- STAGE FILE ---
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

  // --- FETCH NETWORK ---
  const fetchNet = async () => {
    const url = urlInputRef.current?.value;
    if (!url) return;
    setIsUploading(true);
    setUploadBtnText("FETCHING...");
    addLog('sys', 'Connecting to Stream Proxy...');

    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('Proxy failed. Check URL.');
      const blob = await res.blob();
      let type = blob.type;
      if (!type || type === 'application/octet-stream') type = 'video/mp4';
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

  // --- UPLOAD ---
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
      addLog('sys', 'Transmitting Bytes...');

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
      if(initialPrompt) {
        await generate(initialPrompt, uri);
      }

    } catch (e: any) {
      console.error(e);
      addLog('sys', `CRITICAL FAILURE: ${e.message}`);
      setIsUploading(false);
      setUploadBtnText("RETRY UPLOAD");
    }
  };

  // --- GENERATE ---
  const generate = async (text: string, overrideUri?: string) => {
    const activeUri = overrideUri || fileUri;
    if (!text || !activeUri) return;

    const isAuto = text === modeRef.current?.value && history.length === 0;
    if (!isAuto) addLog('usr', text);

    setIsInferenceRunning(true);

    try {
      const formattedPrompt = `${text} \n\nIMPORTANT OUTPUT RULES:\n1. Always provide timestamps for events in format MM:SS.\n2. CRITICAL: If you detect weapons, fire, fighting, theft, blood, or aggression, wrap the description in brackets like this: [THREAT: Gun Detected] or [THREAT: Physical Assault]. This enables the UI to highlight it in red.`;

      const parts: any[] = [{ text: formattedPrompt }];

      if (history.length === 0) {
        parts.unshift({
          file_data: { file_uri: activeUri, mime_type: videoMime },
        });
      }

      const turn = { role: 'user', parts } as HistoryItem;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [...history, turn],
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No Response";
      addLog('sys', reply);

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

  // --- RENDER ---
  return (
    <>
      {/* RESTORED ORB BACKGROUND ELEMENTS */}
      <div className="ambient-field">
        <div className="orb o1"></div>
        <div className="orb o2"></div>
        <div className="orb o3"></div>
      </div>

      {isAuthOpen && (
        <div id="auth-gate">
          <div className="auth-box">
            <h3 style={{ color: 'var(--rose)', marginTop: 0, fontFamily: 'JetBrains Mono' }}>API KEY CONFIG</h3>
            <p style={{ fontSize: '0.8rem', color: '#888' }}>
              {process.env.NEXT_PUBLIC_GEMINI_API_KEY ? "Env Key Detected. Override below if needed:" : "Enter Gemini API Key:"}
            </p>
            <input type="password" id="key-field" className="auth-inp" placeholder="AIzaSy..." defaultValue={apiKey} />
            <button className="btn-act" onClick={saveAuth} style={{ background: 'var(--rose)', color: 'white' }}>
              SAVE & CONNECT
            </button>
            <div style={{ fontSize: '0.7rem', color: '#444', marginTop: '15px' }}>Target: {MODEL}</div>
          </div>
        </div>
      )}

      <div id="console-body">
        <header>
          <div className="branding">
            {/* UPDATED LOGO */}
            <img src="/logospectator.svg" alt="Spectator" />
            SPECTATOR PRO
          </div>
          <div className="status-group">
            <div className="sys-ind reset" onClick={manualReset}>
              <i className="ph-bold ph-arrow-counter-clockwise"></i> RESET
            </div>
            <div className="sys-ind" onClick={() => setIsAuthOpen(true)}>
              <i className="ph-bold ph-wifi-high"></i> {apiKey ? "ONLINE" : "NO KEY"}
            </div>
          </div>
        </header>

        <div id="core-layout">
          {/* SIDEBAR */}
          <div id="control-panel">
            <div className="lbl">SOURCE STREAM</div>
            <div className="tab-box">
              <div className={`tab ${activeTab === 0 ? 'active' : ''}`} onClick={() => !isUploading && setActiveTab(0)}>FILE UPLOAD</div>
              <div className={`tab ${activeTab === 1 ? 'active' : ''}`} onClick={() => !isUploading && setActiveTab(1)}>NETWORK URL</div>
            </div>

            {activeTab === 0 && (
              <div id="p-local">
                <div className="drop-target" onClick={() => !isUploading && fileInputRef.current?.click()}>
                  <i className="ph ph-file-video" style={{ fontSize: '2rem', color: '#555' }}></i>
                  <div style={{ fontSize: '0.7rem', marginTop: '8px', color: 'var(--text-muted)' }}>
                    CLICK TO STAGE FOOTAGE
                  </div>
                  <input 
                    type="file" 
                    id="f-h" 
                    accept="video/*" 
                    hidden 
                    ref={fileInputRef} 
                    onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files && stageFile(e.target.files[0])}
                  />
                </div>
              </div>
            )}

            {activeTab === 1 && (
              <div id="p-net">
                <input type="text" ref={urlInputRef} id="url-field" placeholder="YouTube or MP4 Link..." disabled={isUploading} />
                <button 
                  className="btn-act" 
                  disabled={isUploading}
                  style={{ marginTop: '8px', padding: '10px', fontSize: '0.7rem', background: '#222', color: 'white' }} 
                  onClick={fetchNet}
                >
                  <i className="ph ph-download"></i> {isUploading ? "BUSY..." : "PULL BYTES"}
                </button>
              </div>
            )}

            <video id="video-stage" controls playsInline ref={videoRef}></video>

            <div className="lbl" style={{ marginTop: '20px' }}>INFERENCE MODE</div>
            <select id="mode" ref={modeRef} disabled={isUploading || fileUri !== null}>
              <option value="Timeline Log: Provide detailed timestamped chronological events.">Chronological Event Log</option>
              <option value="Security Scan: Flag weapons, aggression, fire, or theft immediately.">Threat Detection Priority</option>
              <option value="OCR Scan: Extract all text, license plates, and signage numbers.">OCR Data Extraction</option>
              <option value="Crowd Ops: Count subjects and analyze crowd movement patterns.">Crowd Dynamics & Counting</option>
            </select>

            <div className="progress-ui" id="p-bar" style={{ display: isUploading ? 'block' : 'none' }}>
              <div className="prog-fill" style={{ width: `${uploadProgress}%` }}></div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              <button 
                id="ignite-btn" 
                className="btn-act" 
                onClick={uploadToGemini} 
                disabled={!videoBlob || isUploading || fileUri !== null}
                style={{
                    opacity: (fileUri !== null && !isUploading) ? 1 : undefined,
                    background: (fileUri !== null && !isUploading) ? '#111' : undefined,
                    color: (fileUri !== null && !isUploading) ? '#00f0ff' : undefined,
                    border: (fileUri !== null && !isUploading) ? '1px solid #333' : undefined,
                    cursor: (fileUri !== null && !isUploading) ? 'default' : 'pointer'
                }}
              >
                <i className={`ph-bold ${fileUri ? 'ph-check' : 'ph-lightning'}`}></i> {uploadBtnText}
              </button>
            </div>
          </div>

          {/* CHAT AREA */}
          <div id="feed-zone">
            <div id="chat-stream" onClick={handleChatClick}>
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="tag">{m.role === 'sys' ? 'SPECTATOR (2.5)' : 'OPERATOR'}</div>
                  <div 
                    className="bubble" 
                    dangerouslySetInnerHTML={{ 
                      __html: formatText(m.text) 
                    }}
                  />
                </div>
              ))}
              
              {isInferenceRunning && (
                 <div className="msg sys">
                   <div className="bubble" style={{opacity:0.7}}>Running 2.5 Flash Inference...</div>
                 </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div id="input-deck">
              <input 
                type="text" 
                id="user-in" 
                placeholder={fileUri ? "Inference query..." : "Waiting for ingestion..."} 
                disabled={!fileUri || isInferenceRunning || isUploading} 
                autoComplete="off"
                ref={userInRef}
                onKeyDown={(e) => e.key === 'Enter' && handleManualQuery()}
              />
              <div 
                id="send-fab" 
                className={fileUri && !isInferenceRunning ? 'active' : ''} 
                onClick={handleManualQuery}
                style={{
                  pointerEvents: (!fileUri || isInferenceRunning) ? 'none' : 'auto', 
                  opacity: (!fileUri || isInferenceRunning) ? 0.5 : 1
                }}
              >
                <i className="ph-bold ph-paper-plane-right"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}