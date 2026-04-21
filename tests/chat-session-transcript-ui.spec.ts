import { expect, test, type Page, type Route } from '@playwright/test'

async function loginThroughUi(page: Page, username: string, password: string) {
  await page.goto('/login?next=%2Fchat')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/chat/)
  await expect(page.getByText('Agent Chat')).toBeVisible()
}

async function stubBootApis(page: Page) {
  await page.route('**/api/status?action=capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        gateway: false,
        claudeHome: '/tmp/e2e-claude-home',
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

  await page.route('**/api/memory/graph?**', async (route) => {
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
}

async function stubCommonSessionApis(page: Page, handlers: {
  transcriptHandler: (route: Route) => Promise<void> | void
  continueHandler: (route: Route) => Promise<void> | void
}) {
  await page.route('**/api/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: [{
          id: 'hermes-e2e-session',
          key: 'hermes-e2e-session',
          kind: 'hermes',
          source: 'local',
          model: 'Hermes Test',
          tokens: '12 tok',
          active: true,
          age: 'just now',
          startTime: Date.now(),
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

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, pref: null }),
    })
  })

  await page.route('**/api/sessions/transcript?**', handlers.transcriptHandler)
  await page.route('**/api/sessions/continue', handlers.continueHandler)
}

test.describe('Session transcript UI', () => {
  const username = process.env.AUTH_USER || 'testadmin'
  const password = process.env.AUTH_PASS || 'testpass1234!'

  test('成功发送时会即时回显并在 transcript 刷新后去重', async ({ page }) => {
    await stubBootApis(page)

    const prompt = 'optimistic e2e prompt'
    let transcriptMessages = [
      {
        role: 'assistant',
        timestamp: '2026-04-21T11:59:00.000Z',
        parts: [{ type: 'text', text: 'Initial assistant context' }],
      },
      {
        role: 'assistant',
        timestamp: '2026-04-21T11:59:30.000Z',
        parts: [{
          type: 'text',
          text: '```text\n' + 'WIDE-LINE-'.repeat(50) + '\n```',
        }],
      },
    ]

    let continueRequestSeen = false
    let releaseContinue!: () => void
    const continueBlocked = new Promise<void>((resolve) => {
      releaseContinue = resolve
    })

    await stubCommonSessionApis(page, {
      transcriptHandler: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ messages: transcriptMessages }),
        })
      },
      continueHandler: async (route) => {
        continueRequestSeen = true
        const body = route.request().postDataJSON()
        expect(body.prompt).toBe(prompt)

        transcriptMessages = [
          ...transcriptMessages,
          {
            role: 'user',
            timestamp: '2026-04-21T12:00:00.000Z',
            parts: [{ type: 'text', text: prompt }],
          },
          {
            role: 'assistant',
            timestamp: '2026-04-21T12:00:01.000Z',
            parts: [{ type: 'text', text: 'server ack reply' }],
          },
        ]

        await continueBlocked
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ reply: 'server ack reply' }),
        })
      },
    })

    await loginThroughUi(page, username, password)

    await page.getByRole('button', { name: /Hermes • hermes-e2e-session/i }).click()
    await expect(page.getByText('Initial assistant context')).toBeVisible()

    const horizontalMetrics = await page.locator('pre').first().evaluate((node) => {
      const el = node as HTMLElement
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }
    })
    expect(horizontalMetrics.scrollWidth).toBeGreaterThan(horizontalMetrics.clientWidth)

    const input = page.getByPlaceholder('Send prompt to this local session...')
    await input.fill(prompt)
    await page.getByRole('button', { name: 'Send' }).click()

    await expect.poll(() => continueRequestSeen).toBe(true)
    await expect(page.getByText(prompt, { exact: true })).toBeVisible()
    await expect(input).toHaveValue('')

    releaseContinue()

    await expect(page.getByText('server ack reply')).toBeVisible()
    await expect.poll(async () => await page.getByText(prompt, { exact: true }).count()).toBe(1)
    await expect(page.getByText('Send failed')).toHaveCount(0)
  })

  test('发送失败时保留用户消息并显示失败态', async ({ page }) => {
    await stubBootApis(page)

    const prompt = 'optimistic failure prompt'

    await stubCommonSessionApis(page, {
      transcriptHandler: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            messages: [{
              role: 'assistant',
              timestamp: '2026-04-21T12:10:00.000Z',
              parts: [{ type: 'text', text: 'Failure path transcript seed' }],
            }],
          }),
        })
      },
      continueHandler: async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'synthetic continue failure' }),
        })
      },
    })

    await loginThroughUi(page, username, password)
    await page.getByRole('button', { name: /Hermes • hermes-e2e-session/i }).click()
    await expect(page.getByText('Failure path transcript seed')).toBeVisible()

    const input = page.getByPlaceholder('Send prompt to this local session...')
    await input.fill(prompt)
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(prompt, { exact: true })).toBeVisible()
    await expect(page.getByText('Send failed')).toBeVisible()
    await expect(page.getByText('synthetic continue failure')).toBeVisible()
    await expect.poll(async () => await page.getByText(prompt, { exact: true }).count()).toBe(1)
  })
})
