import { describe, expect, it } from 'vitest'
import { isWorkspaceSchemaTooNewError } from './workspaceSchemaError'

describe('isWorkspaceSchemaTooNewError', () => {
  it('matches the machine-readable prefix from open_workspace / validate_header', () => {
    expect(isWorkspaceSchemaTooNewError('workspace-schema-too-new:3:1')).toBe(true)
  })

  it('does not match unrelated error strings', () => {
    expect(isWorkspaceSchemaTooNewError('Target folder not found')).toBe(false)
    expect(isWorkspaceSchemaTooNewError(new Error('boom'))).toBe(false)
    expect(isWorkspaceSchemaTooNewError(undefined)).toBe(false)
  })
})
