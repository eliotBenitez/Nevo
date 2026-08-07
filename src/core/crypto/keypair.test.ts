import { describe, expect, it } from 'vitest'
import { generateKeypair, derivePublicKey, wrapDEK, unwrapDEK, generateRawDEK } from './keypair'

describe('derivePublicKey', () => {
  it('recovers exactly the public half that was generated with the private key', async () => {
    const pair = await generateKeypair()
    expect(await derivePublicKey(pair.privateKey)).toBe(pair.publicKey)
  })

  it('distinguishes two different device keys', async () => {
    const [a, b] = [await generateKeypair(), await generateKeypair()]
    expect(await derivePublicKey(a.privateKey)).not.toBe(b.publicKey)
  })

  it('agrees with the key that actually unwraps a DEK', async () => {
    // The property the sign-in guard relies on: matching derived and
    // registered public keys means this device can unwrap the storage DEK.
    const owner = await generateKeypair()
    const stranger = await generateKeypair()
    const dek = generateRawDEK()
    const wrapped = await wrapDEK(owner.publicKey, dek)

    expect(await derivePublicKey(owner.privateKey)).toBe(owner.publicKey)
    expect(Array.from(await unwrapDEK(owner.privateKey, wrapped))).toEqual(Array.from(dek))

    expect(await derivePublicKey(stranger.privateKey)).not.toBe(owner.publicKey)
    await expect(unwrapDEK(stranger.privateKey, wrapped)).rejects.toThrow()
  })
})
