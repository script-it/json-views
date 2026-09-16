import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Adult English nonfiction average: Brysbaert (2019), doi:10.1016/j.jml.2019.104047.
const wordsPerMinute = 238
const directory = new URL('../apps/web/public/representative-examples/', import.meta.url)
const sourceFile = new URL('About JSON Views.json', directory)
const document = JSON.parse(readFileSync(sourceFile, 'utf8'))
for (const article of document.articles) {
  // Include titles, prose, code and diagram labels; exclude markup and link destinations.
  const plain = `${article.title}\n${article.body}`
    .replace(/```[^\n]*\n/g, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const words = (plain.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length
  article.reading_time = Math.max(1, Math.ceil(words * 60 / wordsPerMinute))
}
document.$jsonviews.schema['$.articles[*].reading_time'].description = 'Estimated seconds: title and visible article word count × 60 ÷ 238, rounded up.'
const source = `${JSON.stringify(document, null, 2)}\n`
writeFileSync(sourceFile, source)
const manifestFile = new URL('manifest.json', directory)
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
const entry = manifest.find(entry => entry.sourceFile === 'About JSON Views.json')
entry.sourceSha256 = createHash('sha256').update(source).digest('hex')
entry.bytes = Buffer.byteLength(source)
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
