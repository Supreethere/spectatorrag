import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core'; 

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing URL', { status: 400 });

  try {
    if (ytdl.validateURL(url)) {
      const info = await ytdl.getBasicInfo(url);
      const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_');
      const videoStream = ytdl(url, { quality: '18' }); // 360p MP4

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

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    const blob = await response.blob();
    return new NextResponse(await blob.arrayBuffer(), {
      headers: { 'Content-Type': response.headers.get('content-type') || 'video/mp4' },
    });

  } catch (error: any) {
    return new NextResponse(`Proxy Error: ${error.message}`, { status: 500 });
  }
}