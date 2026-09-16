import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
const directory = process.cwd()
const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
if (!['@script-it/json-views-core', '@script-it/json-views-react'].includes(metadata.name)) throw new Error('Run from a library package')
await rm(path.join(directory, 'dist'), { recursive: true, force: true })

