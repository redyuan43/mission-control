import { expect, test, type Page } from '@playwright/test'

async function openMockedSessionChat(page: Page, options?: {
  continueStatus?: number
  continueError?: string
}) {
  await page.context().addCookies([{
    name: 'mc-session',
    value: 'e2e-session-token',
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }])

  const sessionId = 'hermes-e2e'
  const sessionKey = 'hermes-key-e2e'
  const promptText = 'deploy status'
  const assistantReply = 'all systems nominal'
  const transcriptMessages: Array<Record<string, unknown>> = [
    {
      role: 'assistant',
      timestamp: '2026-04-21T10:00:00.000Z',
      parts: [{ type: 'text', text: 'ready for next instruction' }],
    },
  ]

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 1,
          username: 'e2e-admin',
          display_name: 'E2E Admin',
          role: 'admin',
          workspace_id: 1,
          tenant_id: 1,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          last_login_at: Math.floor(Date.now() / 1000),
        },
      }),
    })
  })

  await page.route('**/api/status?action=capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        gateway: false,
        claudeHome: '/tmp/e2e',
        interfaceMode: 'full',
      }),
    })
  })

  await page.route('**/api/onboarding', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        isAdmin: true,
        showOnboarding: false,
        completed: true,
        skipped: false,
      }),
    })
  })

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ agents: [] }),
    })
  })

  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [] }),
    })
  })

  await page.route('**/api/memory/graph?agent=all', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ agents: [] }),
    })
  })

  await page.route('**/api/skills', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ skills: [], groups: [], total: 0 }),
    })
  })

  await page.route('**/api/releases/check', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ updateAvailable: false }),
    })
  })

  await page.route('**/api/openclaw/version', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ updateAvailable: false }),
    })
  })

  await page.route('**/api/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: [{
          id: sessionId,
          key: sessionKey,
          kind: 'hermes',
          source: 'local',
          age: '1m',
          model: 'hermes-e2e-model',
          tokens: '12',
          flags: [],
          active: true,
          lastActivity: Date.now(),
        }],
      }),
    })
  })

  await page.route('**/api/chat/session-prefs', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prefs: {} }),
      })
      return
    }
    await route.fallback()
  })

  await page.route(`**/api/sessions/transcript?kind=hermes&id=${encodeURIComponent(sessionId)}&limit=40`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: transcriptMessages }),
    })
  })

  let releaseContinue: (() => void) | null = null
  const continueSeen = new Promise<void>((resolve) => {
    releaseContinue = resolve
  })

  await page.route('**/api/sessions/continue', async (route) => {
    const body = route.request().postDataJSON()
    if (body?.id === sessionId && body?.prompt === promptText) {
      await continueSeen

      if ((options?.continueStatus || 200) >= 400) {
        await route.fulfill({
          status: options?.continueStatus || 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: options?.continueError || 'continue failed' }),
        })
        return
      }

      transcriptMessages.push(
        {
          role: 'user',
          timestamp: '2026-04-21T10:00:05.000Z',
          parts: [{ type: 'text', text: promptText }],
        },
        {
          role: 'assistant',
          timestamp: '2026-04-21T10:00:06.000Z',
          parts: [{ type: 'text', text: assistantReply }],
        },
      )

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reply: assistantReply }),
      })
      return
    }

    await route.fallback()
  })

  await page.goto('/chat')
  await expect(page).toHaveURL(/\/chat/)

  const sessionButton = page.locator('button').filter({ hasText: `Hermes • ${sessionKey}` })
  await expect(sessionButton).toBeVisible()
  await sessionButton.click()

  const input = page.locator('input[placeholder="Send prompt to this local session..."]')
  await expect(input).toBeVisible()
  await input.fill(promptText)
  await page.getByRole('button', { name: 'Send' }).click()

  return {
    promptText,
    assistantReply,
    releaseContinue: () => releaseContinue?.(),
  }
}

test.describe('Chat Session Transcript UI', () => {
  test('session 消息立即回显，transcript 刷新后不重复', async ({ page }) => {
    const flow = await openMockedSessionChat(page)

    await expect(page.getByText(flow.promptText, { exact: true })).toBeVisible()
    await expect(page.getByText(flow.promptText, { exact: true })).toHaveCount(1)

    flow.releaseContinue()

    await expect(page.getByText(flow.assistantReply, { exact: true })).toBeVisible()
    await expect(page.getByText(flow.promptText, { exact: true })).toHaveCount(1)
  })

  test('session continue 失败时保留用户消息并标失败', async ({ page }) => {
    const flow = await openMockedSessionChat(page, {
      continueStatus: 500,
      continueError: 'simulated continue failure',
    })

    await expect(page.getByText(flow.promptText, { exact: true })).toBeVisible()

    flow.releaseContinue()

    await expect(page.getByText('simulated continue failure')).toBeVisible()
    await expect(page.getByText('Send failed')).toBeVisible()
    await expect(page.getByText(flow.promptText, { exact: true })).toBeVisible()
  })
})
