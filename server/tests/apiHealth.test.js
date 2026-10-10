const request = require('supertest');
const app = require('../src/app');

describe('API Health & Configuration Endpoints', () => {
  test('GET /api/health returns { ok: true }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('GET /api/config returns categories and routing configuration', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.foodCategories).toBeDefined();
    expect(res.body.routingConfig).toBeDefined();
    expect(res.body.college).toBeDefined();
    expect(res.body.foodCategories.cooked_hot.safeWindowMinutes).toBe(120);
    expect(res.body.routingConfig.COST_PER_KM).toBe(12);
  });
});
