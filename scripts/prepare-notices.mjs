import { copyFile } from 'node:fs/promises'
for (const name of ['core', 'react', 'cli']) {
  await copyFile(new URL('../LICENSE', import.meta.url), new URL('../packages/' + name + '/LICENSE', import.meta.url))
}

