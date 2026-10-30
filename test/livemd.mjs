// Self-contained tests for the .mlx parser (lib/livemd.js).
// Builds a synthetic live-script package in memory, so it runs on a clean
// checkout without MATLAB; parses /tmp/mlx/demo*.mlx as well when present.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { parseMlx, parseMlxBuffer } from '../lib/livemd.js'

// --- minimal ZIP writer: store or deflate, real CRC32 ---
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i += 1) {
  let c = i
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c >>> 0
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function buildZip(entries) {
  const chunks = []
  const directory = []
  let offset = 0
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const deflated = deflateRawSync(data)
    const method = deflated.length < data.length ? 8 : 0
    const payload = method === 8 ? deflated : data
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    chunks.push(local, nameBytes, payload)
    directory.push({ nameBytes, method, crc, compressed: payload.length, size: data.length, offset })
    offset += 30 + nameBytes.length + payload.length
  }
  const centralOffset = offset
  for (const entry of directory) {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(entry.method, 10)
    header.writeUInt32LE(entry.crc, 16)
    header.writeUInt32LE(entry.compressed, 20)
    header.writeUInt32LE(entry.size, 24)
    header.writeUInt16LE(entry.nameBytes.length, 28)
    header.writeUInt32LE(entry.offset, 42)
    chunks.push(header, entry.nameBytes)
    offset += 46 + entry.nameBytes.length
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(directory.length, 8)
  end.writeUInt16LE(directory.length, 10)
  end.writeUInt32LE(offset - centralOffset, 12)
  end.writeUInt32LE(centralOffset, 16)
  chunks.push(end)
  return Buffer.concat(chunks)
}

// --- synthetic live script package ---
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_BYTES = Buffer.from(PNG_1X1, 'base64')

const DOCUMENT_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">',
  '<w:body>',
  '<w:p><w:pPr><w:pStyle w:val="title"/></w:pPr><w:r><w:t>Demo live script</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:pStyle w:val="text"/></w:pPr><w:r><w:t>Intro with &amp; entity</w:t></w:r><w:r><w:br/><w:t>second line</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:pStyle w:val="text"/></w:pPr></w:p>',
  '<w:p><w:pPr><w:pStyle w:val="code"/></w:pPr><w:r><w:t><![CDATA[x = 1:10;',
  'y = x.^2;]]></w:t></w:r></w:p>',
  '<w:p><w:pPr><w:sectPr/></w:pPr></w:p>',
  '<w:p><w:pPr><w:pStyle w:val="heading"/></w:pPr><w:r><w:t>Second section</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:pStyle w:val="text"/></w:pPr><w:r><w:t>Before plot</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:pStyle w:val="code"/></w:pPr><w:r><w:t>plot(x, y)</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:sectPr/></w:pPr></w:p>',
  '<w:foo w:val="bar"><w:t>ignored unknown element</w:t></w:foo>',
  '<w:tbl><w:tblPr><w:tblStyle w:val="Table"/></w:tblPr><w:tr><w:tc>',
  '<w:p><w:pPr><w:pStyle w:val="text"/></w:pPr><w:r><w:t>Cell text</w:t></w:r></w:p>',
  '</w:tc></w:tr></w:tbl>',
  '<w:p><w:pPr><w:pStyle w:val="text"/></w:pPr><w:r><w:t>See figure</w:t></w:r>',
  '<w:r><w:drawing><wp:inline><a:blip r:embed="rId1"/></wp:inline></w:drawing></w:r></w:p>',
  '<w:p><w:pPr><w:pStyle w:val="text"/></w:pPr><w:r><w:t>Unknown &lt;tag&gt; kept as text</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:sectPr/></w:pPr></w:p>',
  '</w:body></w:document>'
].join('\n')

const OUTPUT_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<embeddedOutputs>',
  '<metaData><evaluationState>idle</evaluationState><layoutState>auto</layoutState></metaData>',
  '<outputArray type="array">',
  '<element><type>text</type><outputData><text>     0.2500\n</text>',
  '<truncationInfo><wasTruncatedAtLineBreak>false</wasTruncatedAtLineBreak></truncationInfo></outputData>',
  '<lineNumbers type="array"><element>2</element></lineNumbers></element>',
  `<element><type>figure</type><outputData><figureId>0b2a</figureId><figureUri>data:image/png;base64,${PNG_1X1}</figureUri>`,
  '<figureSize type="array"><element>560</element><element>420</element></figureSize></outputData>',
  '<lineNumbers type="array"><element>3</element></lineNumbers></element>',
  '<element><type>matrix</type><outputData><header></header><name>ans</name><varSize>2×2</varSize>',
  '<rows>2</rows><columns>2</columns><varType>double</varType><value>    1    2\n    3    4\n</value></outputData>',
  '<lineNumbers type="array"><element>4</element></lineNumbers></element>',
  '<element><type>weird</type><outputData/></element>',
  '</outputArray>',
  '<regionArray type="array"/>',
  '</embeddedOutputs>'
].join('\n')

const DOCUMENT_RELS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.mathworks.com/matlab/code/2013/relationships/image"',
  ' Target="../media/image1.png"/>',
  '</Relationships>'
].join('\n')

const CONTENT_TYPES = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Default Extension="png" ContentType="image/png"/>',
  '</Types>'
].join('\n')

function fixtureEntries() {
  return {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': '<?xml version="1.0"?><Relationships/>',
    'matlab/document.xml': DOCUMENT_XML,
    'matlab/output.xml': OUTPUT_XML,
    'matlab/_rels/document.xml.rels': DOCUMENT_RELS,
    'matlab/media/image1.png': PNG_BYTES,
    'metadata/coreProperties.xml': '<?xml version="1.0"?><cp:coreProperties/>'
  }
}

function fixtureZip() {
  return buildZip(fixtureEntries())
}

// Small helpers for the section-count cases below.
function paragraph(style, text) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`
}

function minimalDocument(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
}

const EXPECTED_TYPES = ['text', 'code', 'output', 'text', 'code', 'output', 'output', 'text', 'output', 'text']
const EXPECTED_TEXT = [
  '# Demo live script\n\nIntro with & entity\nsecond line',
  '## Second section\n\nBefore plot',
  'Cell text\n\nSee figure',
  'Unknown <tag> kept as text'
]

function checkParsed(result, label) {
  const sections = result.sections
  assert.deepEqual(sections.map((section) => section.type), EXPECTED_TYPES, `${label}: section order`)
  const texts = sections.filter((section) => section.type === 'text').map((section) => section.text)
  assert.deepEqual(texts, EXPECTED_TEXT, `${label}: text sections`)
  const code = sections.filter((section) => section.type === 'code')
  assert.deepEqual(code.map((section) => section.text), ['x = 1:10;\ny = x.^2;', 'plot(x, y)'], `${label}: code text`)
  assert.deepEqual(code.map((section) => section.language), ['matlab', 'matlab'], `${label}: code language`)
  assert.deepEqual(sections[2], { type: 'output', text: '     0.2500' }, `${label}: text output placement`)
  assert.deepEqual(sections[5], { type: 'output', image: 'output-1.png' }, `${label}: figure output placement`)
  assert.deepEqual(sections[6], { type: 'output', text: '    1    2\n    3    4' }, `${label}: matrix output placement`)
  assert.deepEqual(sections[8], { type: 'output', image: 'matlab/media/image1.png' }, `${label}: inline image output`)
  // Sections: paragraph 0, the "heading" paragraph, and the paragraph after the
  // second <?sectPr?> break (the trailing break does not open a new section).
  assert.deepEqual(result.meta, { sectionCount: 3, imageCount: 2, title: 'Demo live script' }, `${label}: meta`)
  assert.equal(result.images.length, 2, `${label}: image count`)
  assert.equal(result.images[0].name, 'matlab/media/image1.png', `${label}: media image name`)
  assert.equal(result.images[0].mime, 'image/png', `${label}: media image mime`)
  assert.ok(result.images[0].bytes.equals(PNG_BYTES), `${label}: media image bytes`)
  assert.equal(result.images[1].name, 'output-1.png', `${label}: data uri image name`)
  assert.deepEqual([...result.images[1].bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${label}: png signature`)
}

async function expectMlxError(promise, pattern, label) {
  let error
  try {
    await promise
  } catch (err) {
    error = err
  }
  assert.ok(error, `${label}: expected a rejection`)
  assert.ok(error.message.startsWith('mlx:'), `${label}: message must start with "mlx:" (got ${error.message})`)
  assert.match(error.message, pattern, `${label}: message text`)
}

async function main() {
  const zip = fixtureZip()
  const fromBuffer = await parseMlxBuffer(zip)
  assert.equal(fromBuffer.path, '<memory>', 'in-memory path')
  checkParsed(fromBuffer, 'synthetic buffer')

  const directory = await mkdtemp(join(tmpdir(), 'livemd-'))
  try {
    const file = join(directory, 'synthetic.mlx')
    await writeFile(file, zip)
    const fromDisk = await parseMlx(file)
    assert.equal(fromDisk.path, resolve(file), 'disk path')
    checkParsed(fromDisk, 'synthetic disk')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  // Every `title` paragraph starts a live-script section (verified against
  // MATLAB's own .mlx -> .m round trip), not only the first one.
  const titlesOnly = await parseMlxBuffer(buildZip({
    'matlab/document.xml': minimalDocument([
      paragraph('title', 'First title'),
      paragraph('text', 'body'),
      paragraph('title', 'Second title'),
      paragraph('title', 'Third title'),
      paragraph('code', 'disp(1)')
    ].join(''))
  }))
  assert.equal(titlesOnly.meta.sectionCount, 3, 'title paragraphs: section count')
  assert.equal(titlesOnly.meta.title, 'First title', 'title paragraphs: title')
  assert.deepEqual(titlesOnly.sections.map((section) => section.text || section.type), ['# First title\n\nbody', '# Second title', '# Third title', 'disp(1)'], 'title paragraphs: section texts')

  // Paragraph properties can hide inside <mc:AlternateContent>; MATLAB does this
  // for equations, so the style must still be found to detect headings/sections.
  const alternate = await parseMlxBuffer(buildZip({
    'matlab/document.xml': minimalDocument(
      paragraph('text', 'intro') +
      '<w:p><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">' +
      '<mc:Choice Requires="R2018b"><w:pPr><w:pStyle w:val="heading"/></w:pPr></mc:Choice>' +
      '<mc:Fallback><w:pPr><w:pStyle w:val="text"/></w:pPr></mc:Fallback></mc:AlternateContent>' +
      '<w:r><w:t>Nested heading</w:t></w:r></w:p>'
    )
  }))
  assert.equal(alternate.meta.sectionCount, 2, 'alternate content: section count')
  assert.deepEqual(alternate.sections.map((section) => section.text), ['intro', '## Nested heading'], 'alternate content: heading style')

  // A document without titles or breaks is a single section without a title.
  const plain = await parseMlxBuffer(buildZip({
    'matlab/document.xml': minimalDocument(paragraph('text', 'only text'))
  }))
  assert.deepEqual(plain.meta, { sectionCount: 1, imageCount: 0 }, 'plain document: meta')

  await expectMlxError(parseMlxBuffer(Buffer.from('this is definitely not a zip archive')), /^mlx: not a zip archive$/, 'not a zip')
  await expectMlxError(parseMlxBuffer(buildZip({ '[Content_Types].xml': CONTENT_TYPES })), /^mlx: missing matlab\/document\.xml$/, 'missing document part')
  await expectMlxError(parseMlx(join(tmpdir(), 'livemd-does-not-exist.mlx')), /^mlx: cannot read file/, 'missing file')

  const corrupt = Buffer.from(zip)
  const nameAt = corrupt.indexOf(Buffer.from('matlab/document.xml', 'utf8'))
  corrupt[nameAt + 'matlab/document.xml'.length] = 0xff
  corrupt[nameAt + 'matlab/document.xml'.length + 1] = 0xff
  await expectMlxError(parseMlxBuffer(corrupt), /^mlx: corrupt entry: matlab\/document\.xml$/, 'corrupt entry')

  const real = ['/tmp/mlx/demo_exec.mlx', '/tmp/mlx/demo.mlx'].find((file) => existsSync(file))
  if (real) {
    const parsed = await parseMlx(real)
    assert.ok(parsed.sections.length > 0, 'real fixture: sections')
    assert.ok(parsed.sections.some((section) => section.type === 'code'), 'real fixture: code sections')
    console.log(`livemd: real fixture ${real} sections=${parsed.sections.length} images=${parsed.images.length}`)
  } else {
    console.log('livemd: real fixture /tmp/mlx/demo*.mlx not found, synthetic only')
  }

  console.log('livemd: ok')
}

main().catch((error) => {
  console.error(`livemd: FAILED ${error.stack || error.message}`)
  process.exit(1)
})
