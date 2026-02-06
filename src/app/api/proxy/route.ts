import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export const runtime = 'nodejs'; // Required for stream handling
export const maxDuration = 60; // Extend timeout for Vercel (Pro plan)

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing URL', { status: 400 });

  try {
    // 1. Handle YouTube Links
    if (ytdl.validateURL(url)) {
      
      // Get Info first to sanitize filename
      const info = await ytdl.getBasicInfo(url, {
        requestOptions: {
          headers: {
            // Spoof User Agent to look like a standard Mac Chrome browser
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        }
      });
      
      const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_');

      // Create the stream with a specific buffer to prevent timeouts
      const videoStream = ytdl(url, { 
        quality: '18', // 360p MP4 (Lowest reliable mp4 for AI analysis to save bandwidth)
        requestOptions: {
          headers: {
             'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        },
        highWaterMark: 1 << 25, // Increase buffer size
      });

      // Stream handling for Next.js App Router
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

    // 2. Handle Direct MP4/File Links
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    
    // Check if it's actually a video
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('video') && !contentType?.includes('octet-stream')) {
        throw new Error('URL does not appear to be a video file.');
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: { 
        'Content-Type': contentType || 'video/mp4',
        'Content-Disposition': 'attachment; filename="network_stream.mp4"'
      },
    });

  } catch (error: any) {
    console.error("Proxy Error:", error);
    return new NextResponse(`Proxy Error: ${error.message}`, { status: 500 });
  }
}