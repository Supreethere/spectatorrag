import { NextRequest, NextResponse } from 'next/server';

// Vercel Configuration
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow 60 seconds for resolution

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse(JSON.stringify({ error: 'Missing URL parameter' }), { status: 400 });
  }

  try {
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    if (isYouTube) {
      console.log("Resolving YouTube link via Cobalt Engine:", url);

      // Use Cobalt API to bypass YouTube restrictions
      const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          url: url,
          videoQuality: "360", // 360p is efficient for AI analysis
          downloadMode: "video",
        })
      });

      const data = await cobaltRes.json();

      if (!cobaltRes.ok || !data.url) {
        throw new Error(data.text || "Tactical Engine failed to resolve video stream.");
      }

      // Return the DIRECT LINK. We do NOT download bytes here.
      // This bypasses the Vercel 4.5MB limit.
      return new NextResponse(JSON.stringify({ downloadUrl: data.url }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If it's not YouTube (direct file link), just echo it back as valid
    return new NextResponse(JSON.stringify({ downloadUrl: url }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("PROXY_ERROR:", error.message);
    return new NextResponse(JSON.stringify({ 
        error: "Proxy Resolution Failed", 
        details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}