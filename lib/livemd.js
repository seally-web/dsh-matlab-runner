/**
 * Read-only parser for MATLAB live scripts (.mlx): WordprocessingML in
 * `matlab/document.xml`, evaluated outputs in `matlab/output.xml` (R2026a keeps
 * images as base64 `data:` URIs), plus legacy `matlab/media/*` parts.
 * Hand-written ZIP reader and tolerant XML walker, no external dependencies.
 * @module dsh-matlab-runner/livemd
 */
import { readFile } from 'node:fs/promises'
import { posix, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const DOCUMENT_PART = 'matlab/document.xml'
const OUTPUT_PART = 'matlab/output.xml'
const DOCUMENT_RELS_PART = 'matlab/_rels/document.xml.rels'
const MEDIA_PREFIX = 'matlab/media/'
const CODE_STYLE_RE = /code|monospace|matlab/i
const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

/** Parse an .mlx file from disk. */
export async function parseMlx(absPath) {
  const file = resolve(String(absPath))
  let buffer
  try {
    buffer = await readFile(file)
  } catch (err) {
    throw new Error(`mlx: cannot read file: ${err.code || err.message}`)
  }
  return parseBuffer(buffer, file)
}

/** Parse an .mlx image from an in-memory buffer. */
export async function parseMlxBuffer(buffer, displayPath = '<memory>') {
  return parseBuffer(buffer, displayPath)
}

async function parseBuffer(input, displayPath) {
  const members = readZip(input)
  const documentPart = members.get(DOCUMENT_PART)
  if (!documentPart) throw new Error('mlx: missing matlab/document.xml')
  const images = []
  const names = new Map()
  let sequence = 0
  const addImage = (key, name, bytes) => {
    if (!names.has(key)) {
      names.set(key, name)
      images.push({ name, bytes, mime: sniffMime(bytes) || 'application/octet-stream' })
    }
    return names.get(key)
  }
  const addDataUri = (uri) => {
    const parsed = parseDataUri(uri)
    if (!parsed) return null
    const mime = parsed.mime || sniffMime(parsed.bytes) || 'application/octet-stream'
    return addImage(uri, `output-${++sequence}.${MIME_EXTENSIONS[mime] || 'bin'}`, parsed.bytes)
  }
  const addMedia = (target) => {
    const member = lookupMember(members, resolvePart(DOCUMENT_PART, target))
    return member ? addImage(`member:${member.name}`, member.name, member.bytes) : null
  }
  const imageFromUri = (uri) => {
    const inline = addDataUri(uri)
    if (inline) return inline
    const target = uri.trim().replace(/^\.\//, '')
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null
    return addMedia(target)
  }
  const rels = readRelationships(members.get(DOCUMENT_RELS_PART))
  const document = readDocument(documentPart, rels, addMedia)
  const outputs = readOutputs(members.get(OUTPUT_PART), imageFromUri)
  const meta = { sectionCount: document.sectionCount, imageCount: images.length }
  if (document.title) meta.title = document.title
  return { path: displayPath, sections: placeOutputs(document.items, outputs), images, meta }
}

function readZip(input) {
  if (!(input instanceof Uint8Array)) throw new Error('mlx: not a zip archive')
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const eocd = findEocd(buffer)
  if (eocd < 0) throw new Error('mlx: not a zip archive')
  const count = buffer.readUInt16LE(eocd + 10)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (count === 0xffff || centralOffset === 0xffffffff) throw new Error('mlx: zip64 archives are not supported')
  const members = new Map()
  let at = centralOffset
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== CENTRAL_SIG) throw new Error('mlx: corrupt entry: central directory')
    const nameLength = buffer.readUInt16LE(at + 28)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength)
    members.set(name, readMember(buffer, name, buffer.readUInt16LE(at + 10),
      buffer.readUInt32LE(at + 20), buffer.readUInt32LE(at + 24), buffer.readUInt32LE(at + 42)))
    at += 46 + nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32)
  }
  return members
}

function findEocd(buffer) {
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 22 - 0xffff); at -= 1) if (buffer.readUInt32LE(at) === EOCD_SIG) return at
  return -1
}

function readMember(buffer, name, method, compressedSize, size, localOffset) {
  if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`mlx: corrupt entry: ${name}`)
  const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
  if (start + compressedSize > buffer.length) throw new Error(`mlx: corrupt entry: ${name}`)
  let bytes = null
  try {
    bytes = method === 0 ? buffer.subarray(start, start + compressedSize) : method === 8 ? inflateRawSync(buffer.subarray(start, start + compressedSize)) : null
  } catch {
    bytes = null
  }
  if (!bytes || bytes.length !== size) throw new Error(`mlx: corrupt entry: ${name}`)
  return Buffer.from(bytes)
}

const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(\/)?([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function parseXml(source) {
  const root = { name: '#root', attrs: {}, children: [] }
  const stack = [root]
  let cursor = 0
  let match
  TOKEN_RE.lastIndex = 0
  while ((match = TOKEN_RE.exec(source)) !== null) {
    const parent = stack[stack.length - 1]
    if (match.index > cursor) parent.children.push(decodeEntities(source.slice(cursor, match.index)) || '')
    cursor = TOKEN_RE.lastIndex
    if (match[0].startsWith('<![CDATA[') && match[1]) parent.children.push(match[1])
    else if (match[2]) {
      const index = stack.findLastIndex((node) => node.name === match[3])
      if (index > 0) stack.length = index
    } else if (match[3]) {
      const node = { name: match[3], attrs: parseAttributes(match[4]), children: [] }
      parent.children.push(node)
      if (!match[5]) stack.push(node)
    }
  }
  if (cursor < source.length) stack[stack.length - 1].children.push(decodeEntities(source.slice(cursor)))
  return root
}

function parseAttributes(source) {
  const attrs = {}
  ATTR_RE.lastIndex = 0
  let match
  while ((match = ATTR_RE.exec(source)) !== null) attrs[match[1]] = decodeEntities(match[2] ?? match[3])
  return attrs
}

function decodeEntities(source) {
  return source.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (whole, code) => {
    if (code[0] !== '#') return ENTITIES[code] ?? whole
    const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    try { return String.fromCodePoint(point) } catch { return whole }
  })
}

const firstChild = (node, name) => node.children.find((child) => typeof child === 'object' && child.name === name)
const childText = (node, name) => (firstChild(node, name) ? collectText(firstChild(node, name)) : null)

const collectText = (node) => node.children.reduce((text, child) => text + (typeof child === 'string' ? child : collectText(child)), '')

function collectNodes(node, name, found = []) {
  for (const child of node.children) {
    if (typeof child !== 'object') continue
    if (child.name === name) found.push(child)
    else collectNodes(child, name, found)
  }
  return found
}

function readDocument(buffer, rels, addMedia) {
  const collected = collectParagraphs(parseXml(buffer.toString('utf8')))
  const paragraphs = collected.filter((entry) => !entry.nested)
  // A section starts at the first paragraph, at every `title`/`heading` paragraph
  // and right after a <w:sectPr/> break; MATLAB writes <w:sectPr/> only for some
  // breaks, so all three markers are needed to match section counts.
  const starts = new Set([0])
  paragraphs.forEach((entry, index) => {
    const style = paragraphStyle(entry.node)
    if (index > 0 && (style === 'title' || style === 'heading')) starts.add(index)
    if (index + 1 < paragraphs.length && collectNodes(entry.node, 'w:sectPr').length) starts.add(index + 1)
  })
  const ordered = [...starts].sort((a, b) => a - b)
  const sections = paragraphs.map((entry, index) => Math.max(0, ordered.filter((start) => start <= index).length - 1))
  const items = []
  let cursor = 0
  let title
  for (const entry of collected) {
    // Paragraphs inside tables belong to the section of the next body paragraph.
    const section = sections[entry.nested ? Math.min(cursor, paragraphs.length - 1) : cursor] ?? 0
    if (!entry.nested) cursor += 1
    const style = paragraphStyle(entry.node)
    const text = paragraphText(entry.node)
    if (CODE_STYLE_RE.test(style)) {
      const code = text.replace(/\n+$/, '')
      if (code.trim()) items.push({ type: 'code', text: code, section })
    } else {
      const line = text.replace(/\s+$/, '')
      if (line.trim()) {
        if (style === 'title' && title === undefined) title = line.trim()
        items.push({ type: 'text', text: headingPrefix(style) + line, section })
      }
    }
    for (const id of paragraphImageIds(entry.node)) {
      const rel = rels.get(id)
      if (!rel || rel.external) continue
      const name = addMedia(rel.target)
      if (name) items.push({ type: 'output', image: name, section })
    }
  }
  const merged = []
  for (const item of items) {
    const previous = merged[merged.length - 1]
    const same = previous && previous.type === item.type && item.type !== 'output' && previous.section === item.section
    if (same) previous.text += (item.type === 'code' ? '\n' : '\n\n') + item.text
    else merged.push({ ...item })
  }
  let line = 0
  for (const item of merged) {
    delete item.section
    if (item.type !== 'code') continue
    item.lineStart = line + 1
    item.lineEnd = line + item.text.split('\n').length
    line = item.lineEnd
  }
  return { items: merged, sectionCount: starts.size, title }
}

function collectParagraphs(node, found = [], nested = false) {
  for (const child of node.children) {
    if (typeof child !== 'object') continue
    if (child.name === 'w:p') found.push({ node: child, nested })
    else collectParagraphs(child, found, nested || child.name === 'w:tbl')
  }
  return found
}

function paragraphStyle(paragraph) {
  // The paragraph properties may sit inside <mc:AlternateContent> (equations
  // and other R2018b+ content), so search nested properties too.
  const props = collectNodes(paragraph, 'w:pPr')[0]
  const style = props && firstChild(props, 'w:pStyle')
  return style ? String(style.attrs['w:val'] || '') : ''
}

function headingPrefix(style) {
  const id = style.toLowerCase()
  if (id === 'title') return '# '
  if (id === 'heading') return '## '
  const match = /^heading([2-6])$/.exec(id)
  return match ? `${'#'.repeat(Number(match[1]) + 1)} ` : ''
}

function paragraphText(paragraph) {
  let text = ''
  const walk = (node) => {
    for (const child of node.children) {
      if (typeof child === 'string') continue
      if (child.name === 'w:t') text += collectText(child)
      else if (child.name === 'w:br' || child.name === 'w:cr') text += '\n'
      else if (child.name === 'w:tab') text += '\t'
      else if (!/^w:(pPr|rPr|delText|instrText|drawing|pict|object)$/.test(child.name)) walk(child)
    }
  }
  walk(paragraph)
  return text
}

function paragraphImageIds(paragraph) {
  const ids = []
  for (const node of collectNodes(paragraph, 'a:blip').concat(collectNodes(paragraph, 'v:imagedata'))) {
    const id = node.attrs['r:embed'] || node.attrs['r:link'] || node.attrs['r:id']
    if (id) ids.push(id)
  }
  return ids
}

function readOutputs(buffer, imageFromUri) {
  if (!buffer) return []
  const array = collectNodes(parseXml(buffer.toString('utf8')), 'outputArray')[0]
  if (!array) return []
  const outputs = []
  for (const element of array.children) {
    if (typeof element !== 'object' || element.name !== 'element') continue
    const data = firstChild(element, 'outputData')
    if (!data) continue
    const lines = collectNodes(element, 'lineNumbers').flatMap((node) => node.children
      .filter((cell) => typeof cell === 'object')
      .map((cell) => Number(collectText(cell).trim()))
      .filter((line) => Number.isFinite(line)))
    const uri = childText(data, 'figureUri') || childText(data, 'imageUri') || childText(data, 'image')
    const image = uri ? imageFromUri(uri) : null
    if (image) {
      outputs.push({ line: lines[0], payload: { type: 'output', image } })
      continue
    }
    const text = childText(data, 'text') ?? childText(data, 'value')
    if (text !== null && text.trim() !== '') outputs.push({ line: lines[0], payload: { type: 'output', text: text.trimEnd() } })
  }
  return outputs
}

function placeOutputs(items, outputs) {
  const codeItems = items.filter((item) => item.type === 'code')
  const attached = new Map()
  const orphans = []
  let lastOwner = null
  for (const output of outputs) {
    const line = output.line
    let owner = Number.isFinite(line) ? codeItems.find((item) => line >= item.lineStart && line <= item.lineEnd) || codeItems.filter((item) => item.lineStart <= line).pop() : null
    owner = owner || lastOwner || codeItems[0] || null
    if (!owner) {
      orphans.push(output.payload)
      continue
    }
    lastOwner = owner
    attached.set(owner, [...(attached.get(owner) || []), output.payload])
  }
  const sections = []
  for (const item of items) {
    if (item.type === 'output') sections.push({ type: 'output', image: item.image })
    else if (item.type === 'code') sections.push({ type: 'code', text: item.text, language: 'matlab' })
    else sections.push({ type: 'text', text: item.text })
    sections.push(...(attached.get(item) || []))
  }
  return sections.concat(orphans)
}

function readRelationships(buffer) {
  const rels = new Map()
  if (!buffer) return rels
  for (const node of collectNodes(parseXml(buffer.toString('utf8')), 'Relationship')) {
    const { Id, Target, TargetMode = '' } = node.attrs
    if (Id && Target) rels.set(Id, { target: Target, external: String(TargetMode).toLowerCase() === 'external' })
  }
  return rels
}

const resolvePart = (partName, target) => posix.normalize(posix.join(posix.dirname(partName), target))

function lookupMember(members, partName) {
  // OPC targets are relative to the source part folder; some writers keep images
  // under matlab/media while the relationship resolves to media/, so try both.
  const candidates = [partName, MEDIA_PREFIX + posix.basename(partName)]
  if (partName.startsWith('media/')) candidates.push(MEDIA_PREFIX + partName.slice(6))
  for (const candidate of candidates) {
    const bytes = members.get(candidate)
    if (bytes) return { name: candidate, bytes }
  }
  return null
}

function parseDataUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('data:')) return null
  const comma = uri.indexOf(',')
  const header = comma < 0 ? '' : uri.slice(5, comma)
  if (!/;base64$/i.test(header)) return null
  const mime = header.split(';')[0].trim().toLowerCase() || null
  const bytes = Buffer.from(uri.slice(comma + 1).replace(/\s+/g, ''), 'base64')
  return bytes.length ? { mime, bytes } : null
}

const MIME_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

function sniffMime(bytes) {
  if (!bytes || bytes.length < 4) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  const head = bytes.subarray(0, 12).toString('latin1')
  if (head.startsWith('GIF8')) return 'image/gif'
  if (head.startsWith('BM')) return 'image/bmp'
  if (head.startsWith('II*\u0000') || head.startsWith('MM\u0000*')) return 'image/tiff'
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp'
  if (head.trimStart().startsWith('<svg')) return 'image/svg+xml'
  return null
}
