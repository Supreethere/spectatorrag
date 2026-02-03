import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds (Vercel Pro) / 10 seconds (Hobby)

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing URL', { status: 400 });

  try {
    // 1. Handle YouTube (including Shorts)
    if (ytdl.validateURL(url)) {
      
      // Request info with a "real" User Agent
      const info = await ytdl.getInfo(url, {
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          },
        },
      });

      // Select itag 18: 360p MP4 (Video + Audio). 
      // It's the most compatible and smallest format to fit under Vercel's 4.5MB limit.
      const format = ytdl.chooseFormat(info.formats, { quality: '18' });
      
      if (!format) throw new Error("Format 18 (360p) not available for this video.");

      // Check content length - Vercel Hobby Limit is 4.5MB
      const contentLength = parseInt(format.contentLength);
      if (contentLength > 4500000) {
        console.warn(`Video is ${contentLength} bytes. Vercel Hobby might kill this connection.`);
      }

      const videoStream = ytdl.downloadFromInfo(info, { format: format });

      const stream = new ReadableStream({
        start(controller) {
          videoStream.on('data', (chunk) => controller.enqueue(chunk));
          videoStream.on('end', () => controller.close());
          videoStream.on('error', (err) => controller.error(err));
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="spectator_capture.mp4"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // 2. Standard direct file handler
    const response = await fetch(url);
    const blob = await response.blob();
    return new NextResponse(await blob.arrayBuffer(), {
      headers: { 'Content-Type': response.headers.get('content-type') || 'video/mp4' },
    });

  } catch (error: any) {
    console.error("PROXY_CRASH:", error.message);
    
    // Check if it's the "Sign in" error (The IP block)
    const isIpBlock = error.message.includes('403') || error.message.includes('confirm you are not a bot');
    
    return new NextResponse(JSON.stringify({ 
        error: "Proxy Failed", 
        details: isIpBlock ? "YouTube blocked Vercel's IP. Try a different video or shorter clip." : error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}