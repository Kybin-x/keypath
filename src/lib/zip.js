// 轻量 ZIP 条目读取（docx/xlsx 都是 zip），基于浏览器原生 DecompressionStream
async function readZipEntryBytes(buf, entryName) {
  const view = new DataView(buf.buffer)
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      let off = view.getUint32(i + 16, true)
      const count = view.getUint16(i + 10, true)
      for (let n = 0; n < count; n++) {
        if (view.getUint32(off, true) !== 0x02014b50) break
        const nameLen = view.getUint16(off + 28, true)
        const extraLen = view.getUint16(off + 30, true)
        const cmtLen = view.getUint16(off + 32, true)
        const localOff = view.getUint32(off + 42, true)
        const name = new TextDecoder().decode(buf.slice(off + 46, off + 46 + nameLen))
        if (name === entryName) {
          const lNameLen = view.getUint16(localOff + 26, true)
          const lExtraLen = view.getUint16(localOff + 28, true)
          const compSize = view.getUint32(off + 20, true)
          const method = view.getUint16(off + 10, true)
          const dataStart = localOff + 30 + lNameLen + lExtraLen
          const raw = buf.slice(dataStart, dataStart + compSize)
          if (method !== 8) return raw
          const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
          return new Uint8Array(await new Response(stream).arrayBuffer())
        }
        off += 46 + nameLen + extraLen + cmtLen
      }
    }
  }
  return null
}

export async function readZipEntryText(file, entryName) {
  const buf = new Uint8Array(await file.arrayBuffer())
  const bytes = await readZipEntryBytes(buf, entryName)
  return bytes ? new TextDecoder().decode(bytes) : null
}

function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

// 解析 .xlsx 第一个工作表，返回 [[A列, B列, ...], ...]
export async function parseXlsxRows(file) {
  const sheetXml = await readZipEntryText(file, 'xl/worksheets/sheet1.xml')
  if (!sheetXml) throw new Error('无法读取 Excel 工作表')
  const sharedXml = await readZipEntryText(file, 'xl/sharedStrings.xml')
  const shared = []
  if (sharedXml) {
    for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1]))
      shared.push(texts.join(''))
    }
  }
  const rows = []
  for (const rm of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {}
    for (const cm of rm[1].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]
      const inner = cm[2] || ''
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] || 'A'
      const type = /t="(\w+)"/.exec(attrs)?.[1] || ''
      let val = ''
      if (type === 'inlineStr') {
        val = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1])).join('')
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] || ''
        val = type === 's' ? (shared[Number(v)] ?? '') : decodeXml(v)
      }
      cells[ref] = val.trim()
    }
    const cols = Object.keys(cells).sort()
    if (cols.length) rows.push(['A', 'B', 'C'].map(c => cells[c] || ''))
  }
  return rows
}
