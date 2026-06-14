import { describe, it, expect, beforeAll } from 'vitest'
import supertest from 'supertest'

let app

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  const mod = await import('../server/index.js')
  app = mod.app
})

function extractCookies(res) {
  const cookies = res.headers['set-cookie']
  if (!cookies) return ''
  return cookies.map(c => c.split(';')[0]).join('; ')
}

describe('CSRF protection', () => {
  it('allows POST /api/login without CSRF token (login is excluded from CSRF)', async () => {
    const res = await supertest(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('allows POST /api/config/change-password without CSRF but requires correct password', async () => {
    const loginRes = await supertest(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' })
    const cookies = extractCookies(loginRes)

    const res = await supertest(app)
      .post('/api/config/change-password')
      .set('Cookie', cookies)
      .send({ currentPassword: 'wrong', newPassword: 'newpass' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/неверен/i)
  })
})

describe('Default password flow', () => {
  it('returns mustChangePassword flag when logging in with admin/admin', async () => {
    const loginRes = await supertest(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' })
    expect(loginRes.body).toHaveProperty('mustChangePassword')
    expect(loginRes.body.mustChangePassword).toBe(true)
  })

  it('returns mustChangePassword on /api/me after login with admin/admin', async () => {
    const loginRes = await supertest(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' })
    const cookie = extractCookies(loginRes)

    const meRes = await supertest(app)
      .get('/api/me')
      .set('Cookie', cookie)
    expect(meRes.body).toHaveProperty('mustChangePassword')
    expect(meRes.body.mustChangePassword).toBe(true)
  })
})

describe('Security headers', () => {
  it('includes X-Content-Type-Options: nosniff', async () => {
    const res = await supertest(app).get('/')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('includes X-Frame-Options header', async () => {
    const res = await supertest(app).get('/')
    expect(res.headers['x-frame-options']).toBeDefined()
  })
})

describe('Cookie security', () => {
  it('sets Secure flag on session cookie when behind HTTPS proxy', async () => {
    const res = await supertest(app)
      .get('/api/csrf-token')
      .set('X-Forwarded-Proto', 'https')
    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()
    const hasSecure = cookies.some(c => c.includes('Secure'))
    expect(hasSecure).toBe(true)
  })
})

describe('Rate limiting on /api/login', () => {
  it('blocks after 5 rapid login attempts', async () => {
    // Reset rate limiter state for this test by using a unique IP via X-Forwarded-For
    const ip = '10.0.0.1'

    const csrfRes = await supertest(app)
      .get('/api/csrf-token')
      .set('X-Forwarded-For', ip)
    const csrfToken = csrfRes.body?.csrfToken
    const cookie = extractCookies(csrfRes)

    for (let i = 0; i < 5; i++) {
      await supertest(app)
        .post('/api/login')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken || '')
        .set('X-Forwarded-For', ip)
        .send({ username: 'admin', password: 'wrong' })
    }

    const res = await supertest(app)
      .post('/api/login')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken || '')
      .set('X-Forwarded-For', ip)
      .send({ username: 'admin', password: 'wrong' })
    expect(res.status).toBe(429)
  })
})
