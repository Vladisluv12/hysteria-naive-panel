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

async function loginAsAdmin() {
  const res = await supertest(app)
    .post('/api/login')
    .send({ username: 'admin', password: 'admin' })
  return extractCookies(res)
}

describe('Default password flow', () => {
  it('returns mustChangePassword flag when logging in with admin/admin', async () => {
    const loginRes = await supertest(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' })
    expect(loginRes.body).toHaveProperty('mustChangePassword')
    expect(loginRes.body.mustChangePassword).toBe(true)
  })

  it('returns mustChangePassword on /api/me after login with admin/admin', async () => {
    const cookie = await loginAsAdmin()

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
      .post('/api/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ username: 'admin', password: 'admin' })
    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()
    const hasSecure = cookies.some(c => c.includes('Secure'))
    expect(hasSecure).toBe(true)
  })
})

describe('Rate limiting on /api/login', () => {
  it('blocks after 5 rapid login attempts', async () => {
    const ip = '10.0.0.1'

    for (let i = 0; i < 5; i++) {
      await supertest(app)
        .post('/api/login')
        .set('X-Forwarded-For', ip)
        .send({ username: 'admin', password: 'wrong' })
    }

    const res = await supertest(app)
      .post('/api/login')
      .set('X-Forwarded-For', ip)
      .send({ username: 'admin', password: 'wrong' })
    expect(res.status).toBe(429)
  })
})
