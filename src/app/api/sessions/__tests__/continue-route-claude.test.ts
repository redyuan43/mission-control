import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/sessions/continue/route'

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn(async () => ({ stdout: 'Claude reply', stderr: '', code: 0 })),
  prepare: vi.fn(),
  get: vi.fn(),
  getDatabase: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { role: 'operator', username: 'tester' } })),
}))

vi.mock('@/lib/command', () => ({
  runCommand: mocks.runCommand,
}))

vi.mock('@/lib/db', () => ({
  getDatabase: mocks.getDatabase,
}))

vi.mock('@/lib/opencode-sessions', () => ({
  getOpenCodeExecutable: vi.fn(() => '/custom/bin/opencode'),
}))

describe('Claude session continue route', () => {
  beforeEach(() => {
    mocks.runCommand.mockClear()
    mocks.prepare.mockReset()
    mocks.get.mockReset()
    mocks.getDatabase.mockReset()

    mocks.prepare.mockReturnValue({ get: mocks.get })
    mocks.getDatabase.mockReturnValue({ prepare: mocks.prepare })
  })

  it('uses the Claude session project_path as cwd for resume', async () => {
    mocks.get.mockReturnValue({ project_path: '/home/ivan/github' })

    const request = new Request('http://localhost/api/sessions/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'claude-code', id: '372c3165-4267-44a9-9984-9904d71f966d', prompt: '你好，你是什么大模型？' }),
    })

    const response = await POST(request as any)

    expect(response.status).toBe(200)
    expect(mocks.prepare).toHaveBeenCalledWith(
      'SELECT project_path FROM claude_sessions WHERE session_id = ? LIMIT 1'
    )
    expect(mocks.get).toHaveBeenCalledWith('372c3165-4267-44a9-9984-9904d71f966d')
    expect(mocks.runCommand).toHaveBeenCalledWith(
      'claude',
      ['--print', '--resume', '372c3165-4267-44a9-9984-9904d71f966d', '你好，你是什么大模型？'],
      expect.objectContaining({ cwd: '/home/ivan/github', timeoutMs: 180000 }),
    )
  })

  it('still resumes without cwd when no project_path is found', async () => {
    mocks.get.mockReturnValue(undefined)

    const request = new Request('http://localhost/api/sessions/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'claude-code', id: '372c3165-4267-44a9-9984-9904d71f966d', prompt: '继续' }),
    })

    const response = await POST(request as any)

    expect(response.status).toBe(200)
    expect(mocks.runCommand).toHaveBeenCalledWith(
      'claude',
      ['--print', '--resume', '372c3165-4267-44a9-9984-9904d71f966d', '继续'],
      expect.objectContaining({ cwd: undefined, timeoutMs: 180000 }),
    )
  })
})
