// Asymmetric key management for end-to-end-encrypted shared storages.
//
// Each user holds an RSA-OAEP keypair. The private key never leaves the device
// (persisted via the OS-backed secure store); the public key is uploaded to the
// relay so other members can wrap a storage's symmetric DEK for this user.

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

export interface SerializedKeypair {
  publicKey: string // base64 SPKI
  privateKey: string // base64 PKCS8
}

/** Generate a fresh RSA-OAEP keypair and return both halves serialized. */
export async function generateKeypair(): Promise<SerializedKeypair> {
  const pair = await crypto.subtle.generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt'])
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey)
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  return { publicKey: toBase64(spki), privateKey: toBase64(pkcs8) }
}

async function importPublicKey(b64Spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromBase64(b64Spki), RSA_PARAMS, false, ['encrypt'])
}

async function importPrivateKey(b64Pkcs8: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', fromBase64(b64Pkcs8), RSA_PARAMS, false, ['decrypt'])
}

/**
 * Wrap a storage's raw DEK bytes for a recipient identified by their public key.
 * Returns base64 ciphertext stored server-side as the member's wrapped_dek.
 */
export async function wrapDEK(recipientPublicKey: string, rawDEK: Uint8Array): Promise<string> {
  const pub = await importPublicKey(recipientPublicKey)
  const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, rawDEK)
  return toBase64(ct)
}

/** Unwrap a wrapped DEK with this user's private key, returning the raw bytes. */
export async function unwrapDEK(privateKeyPkcs8: string, wrappedDEK: string): Promise<Uint8Array> {
  const priv = await importPrivateKey(privateKeyPkcs8)
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, fromBase64(wrappedDEK))
  return new Uint8Array(raw)
}

/** Import raw DEK bytes as an AES-GCM key usable with the collaboration codec. */
export async function importDEK(rawDEK: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawDEK, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** Generate a fresh 256-bit storage DEK, returning the raw bytes. */
export function generateRawDEK(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}
