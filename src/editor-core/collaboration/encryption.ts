const AES_GCM = { name: 'AES-GCM', length: 256 } as const

export async function generateSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES_GCM, true, ['encrypt', 'decrypt'])
}

export async function exportKeyBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
}

export async function importKeyBase64(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, AES_GCM, false, ['encrypt', 'decrypt'])
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const result = new Uint8Array(12 + ciphertext.byteLength)
  result.set(iv)
  result.set(new Uint8Array(ciphertext), 12)
  return result
}

export async function decryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.slice(0, 12)
  const ct = data.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new Uint8Array(plain)
}
