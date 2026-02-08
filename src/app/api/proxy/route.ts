import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export const runtime = 'nodejs'; 
export const maxDuration = 60; 

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing URL', { status: 400 });

  try {
    if (ytdl.validateURL(url)) {
      const info = await ytdl.getBasicInfo(url, {
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        }
      });
      
      const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_');
      const videoStream = ytdl(url, { 
        quality: '18', 
        highWaterMark: 1 << 25, 
      });

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
          'Content-Disposition': `attachment; filename="${title}.mp4"`,
        },
      });
    }

    // Direct File Logic
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    
    const contentType = response.headers.get('content-type');
    const blob = await response.blob();
    
    return new NextResponse(blob, {
      headers: { 
        'Content-Type': contentType || 'video/mp4',
        'Content-Disposition': 'attachment; filename="network_stream.mp4"'
      },
    });

  } catch (error: any) {
    console.error("Proxy Error:", error);
    // Crucial: Return error as text so frontend doesn't try to parse as video
    return new NextResponse(`Proxy Error: ${error.message}`, { status: 500 });
  }
}