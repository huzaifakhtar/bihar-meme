import { NextResponse } from 'next/server'
import fs from 'fs'
import { Readable } from 'stream'
import { join } from 'path'

// Stream the video and support Range requests so the browser can seek and start playback quickly.
export async function GET(req: Request) {
  try {
  const filePath = join(process.cwd(), 'public', 'slap.mov')
    const stat = await fs.promises.stat(filePath)
    const fileSize = stat.size
    const range = req.headers.get('range')

    if (range) {
      const bytesPrefix = 'bytes='
      if (!range.startsWith(bytesPrefix)) {
        return new NextResponse('Invalid range', { status: 416 })
      }
      const ranges = range.replace(bytesPrefix, '').split('-')
      const start = parseInt(ranges[0], 10) || 0
      const end = ranges[1] ? parseInt(ranges[1], 10) : fileSize - 1
      const chunkSize = (end - start) + 1
  const nodeStream = fs.createReadStream(filePath, { start, end })
  const stream = Readable.toWeb(nodeStream)
      const headers = new Headers()
      headers.set('Content-Type', 'video/quicktime')
      headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      headers.set('Accept-Ranges', 'bytes')
      headers.set('Content-Length', String(chunkSize))
      headers.set('Cache-Control', 'no-cache')
  return new NextResponse(stream as unknown as BodyInit, { status: 206, headers })
    }

    // No range — stream the whole file
  const nodeStream = fs.createReadStream(filePath)
  const stream = Readable.toWeb(nodeStream)
    const headers = new Headers()
    headers.set('Content-Type', 'video/quicktime')
    headers.set('Content-Length', String(fileSize))
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Cache-Control', 'no-cache')
  return new NextResponse(stream as unknown as BodyInit, { status: 200, headers })
  } catch (err) {
    return new NextResponse('Not found', { status: 404 })
  }
}
