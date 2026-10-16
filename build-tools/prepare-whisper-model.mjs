import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// OpenAI Whisper base multilingual weights, converted by whisper.cpp (MIT).
// Pin the revision AND verify the LFS SHA-256 before including it in an installer.
const URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin'
const SHA256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
const BYTES = 147_951_465
const destination = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri/resources/models/ggml-base.bin')

export async function verifyFile(path, size, expectedHash) {
  try {
    if ((await stat(path)).size !== size) return false
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    return hash.digest('hex') === expectedHash
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function prepareModel() {
  if (await verifyFile(destination, BYTES, SHA256)) return
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    const response = await fetch(URL)
    if (!response.ok || !response.body) throw new Error(`Model download failed (HTTP ${response.status})`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }))
    if (!await verifyFile(temporary, BYTES, SHA256)) throw new Error('Model size or SHA-256 does not match the pinned release')
    await rm(destination, { force: true })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareModel().catch(error => {
    console.error(`Could not prepare bundled offline speech model: ${error.message}`)
    process.exitCode = 1
  })
}
