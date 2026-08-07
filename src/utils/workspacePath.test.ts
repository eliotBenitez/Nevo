import { describe, expect, it } from 'vitest'
import { formatWorkspacePath } from './workspacePath'

describe('workspace paths', () => {
  it('uses backslashes for paths displayed on Windows', () => {
    expect(formatWorkspacePath('C:/Users/Nevo/Documents', 'windows')).toBe('C:\\Users\\Nevo\\Documents')
  })

  it('keeps forward slashes on non-Windows platforms', () => {
    expect(formatWorkspacePath('C:\\Users\\Nevo\\Documents', 'linux')).toBe('C:/Users/Nevo/Documents')
  })
})
