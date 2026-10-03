import { describe, expect, it } from 'vitest'
import { MAX_ASSET_BYTES, isWithinAssetLimit } from './assetLimits'

describe('isWithinAssetLimit', () => {
  it('accepts a size at or under the limit', () => {
    expect(isWithinAssetLimit(0)).toBe(true)
    expect(isWithinAssetLimit(MAX_ASSET_BYTES)).toBe(true)
  })

  it('rejects a size over the limit', () => {
    expect(isWithinAssetLimit(MAX_ASSET_BYTES + 1)).toBe(false)
  })
})
