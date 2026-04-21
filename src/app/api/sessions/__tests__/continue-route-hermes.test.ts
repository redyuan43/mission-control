import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/sessions/continue/route'

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn(async () => ({ stdout: 'Hermes reply', stderr: '', code: 0 })),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { role: 'operator', username: 'tester' } })),
}))

vi.mock('@/lib/command', () => ({
  runCommand: mocks.runCommand,
}))

vi.mock('@/lib/opencode-sessions', () => ({
  getOpenCodeExecutable: vi.fn(() => '/custom/bin/opencode'),
}))

describe('Hermes session continue route', () => {
  beforeEach(() => {
    mocks.runCommand.mockClear()
  })

  it('invokes Hermes resume chat for kind=hermes', async () => {
    const request = new Request('http://localhost/api/sessions/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'hermes', id: '20260421_181220_2154dd', prompt: '你现在可以运行了吗？' }),
    })

    const response = await POST(request as any)
    expect(response.status).toBe(200)
    expect(mocks.runCommand).toHaveBeenCalledWith(
      'hermes',
      ['--resume', '20260421_181220_2154dd', 'chat', '-q', '你现在可以运行了吗？'],
      expect.objectContaining({ timeoutMs: 180000, env: expect.any(Object) }),
    )
  })
})
