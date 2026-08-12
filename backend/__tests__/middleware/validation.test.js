const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Create test app with just the validation middleware
const {
  createJob,
  updateJob,
  discoverEmail,
  generateEmail,
  sendEmail,
  singleDraft,
  fetchJobs,
  sendFollowup,
  pagination,
  validate,
} = require('../../src/middleware/validation');

const app = express();
app.use(express.json());

// Test routes for each validation
app.post('/test/create-job', createJob, (req, res) => res.json({ success: true }));
app.put('/test/update-job/:id', updateJob, (req, res) => res.json({ success: true }));
app.post('/test/discover-email', discoverEmail, (req, res) => res.json({ success: true }));
app.post('/test/generate-email', generateEmail, (req, res) => res.json({ success: true }));
app.post('/test/send-email', sendEmail, (req, res) => res.json({ success: true }));
app.post('/test/single-draft', singleDraft, (req, res) => res.json({ success: true }));
app.post('/test/fetch-jobs', fetchJobs, (req, res) => res.json({ success: true }));
app.post('/test/send-followup', sendFollowup, (req, res) => res.json({ success: true }));
app.get('/test/pagination', pagination, (req, res) => res.json({ success: true }));

describe('Validation Middleware', () => {
  describe('createJob', () => {
    test('rejects missing company', async () => {
      const response = await request(app).post('/test/create-job').send({ role: 'Developer' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    test('rejects missing role', async () => {
      const response = await request(app).post('/test/create-job').send({ company: 'Google' });
      expect(response.status).toBe(400);
    });

    test('accepts valid job data', async () => {
      const response = await request(app)
        .post('/test/create-job')
        .send({ company: 'Google', role: 'Developer', jd: 'Job description' });
      expect(response.status).toBe(200);
    });
  });

  describe('updateJob', () => {
    test('rejects invalid status', async () => {
      const response = await request(app)
        .put('/test/update-job/123')
        .send({ status: 'InvalidStatus' });
      expect(response.status).toBe(400);
    });

    test('accepts valid status', async () => {
      const response = await request(app).put('/test/update-job/123').send({ status: 'Sent' });
      expect(response.status).toBe(200);
    });

    test('rejects invalid email', async () => {
      const response = await request(app)
        .put('/test/update-job/123')
        .send({ emailRecipient: 'not-an-email' });
      expect(response.status).toBe(400);
    });
  });

  describe('discoverEmail', () => {
    test('rejects missing company', async () => {
      const response = await request(app)
        .post('/test/discover-email')
        .send({ jd: 'Job description' });
      expect(response.status).toBe(400);
    });

    test('accepts valid data', async () => {
      const response = await request(app)
        .post('/test/discover-email')
        .send({ company: 'Google', jd: 'Job description' });
      expect(response.status).toBe(200);
    });
  });

  describe('generateEmail', () => {
    test('rejects missing company', async () => {
      const response = await request(app).post('/test/generate-email').send({ role: 'Developer' });
      expect(response.status).toBe(400);
    });

    test('rejects missing role', async () => {
      const response = await request(app).post('/test/generate-email').send({ company: 'Google' });
      expect(response.status).toBe(400);
    });

    test('accepts valid data', async () => {
      const response = await request(app)
        .post('/test/generate-email')
        .send({ company: 'Google', role: 'Developer', jd: 'Job description' });
      expect(response.status).toBe(200);
    });
  });

  describe('sendEmail', () => {
    test('rejects missing jobId', async () => {
      const response = await request(app)
        .post('/test/send-email')
        .send({ to: 'test@example.com', body: 'Email body' });
      expect(response.status).toBe(400);
    });

    test('rejects invalid email', async () => {
      const response = await request(app)
        .post('/test/send-email')
        .send({ jobId: '123', to: 'not-an-email', body: 'Email body' });
      expect(response.status).toBe(400);
    });

    test('rejects missing body', async () => {
      const response = await request(app)
        .post('/test/send-email')
        .send({ jobId: '123', to: 'test@example.com' });
      expect(response.status).toBe(400);
    });

    test('accepts valid data', async () => {
      const response = await request(app)
        .post('/test/send-email')
        .send({ jobId: '123', to: 'test@example.com', body: 'Email body' });
      expect(response.status).toBe(200);
    });
  });

  describe('singleDraft', () => {
    test('rejects missing recipientEmail', async () => {
      const response = await request(app)
        .post('/test/single-draft')
        .send({ jd: 'Job description' });
      expect(response.status).toBe(400);
    });

    test('rejects invalid email', async () => {
      const response = await request(app)
        .post('/test/single-draft')
        .send({ recipientEmail: 'not-an-email', jd: 'Job description' });
      expect(response.status).toBe(400);
    });

    test('rejects missing jd', async () => {
      const response = await request(app)
        .post('/test/single-draft')
        .send({ recipientEmail: 'test@example.com' });
      expect(response.status).toBe(400);
    });

    test('accepts valid data', async () => {
      const response = await request(app)
        .post('/test/single-draft')
        .send({ recipientEmail: 'test@example.com', jd: 'Job description', company: 'Google' });
      expect(response.status).toBe(200);
    });
  });

  describe('fetchJobs', () => {
    test('rejects empty queries', async () => {
      const response = await request(app).post('/test/fetch-jobs').send({ queries: [] });
      expect(response.status).toBe(400);
    });

    test('rejects missing queries', async () => {
      const response = await request(app).post('/test/fetch-jobs').send({});
      expect(response.status).toBe(400);
    });

    test('accepts valid queries', async () => {
      const response = await request(app)
        .post('/test/fetch-jobs')
        .send({ queries: ['software developer'] });
      expect(response.status).toBe(200);
    });
  });

  describe('sendFollowup', () => {
    test('rejects missing jobId', async () => {
      const response = await request(app).post('/test/send-followup').send({ day: 3 });
      expect(response.status).toBe(400);
    });

    test('rejects invalid day', async () => {
      const response = await request(app)
        .post('/test/send-followup')
        .send({ jobId: '123', day: 0 });
      expect(response.status).toBe(400);
    });

    test('rejects day > 30', async () => {
      const response = await request(app)
        .post('/test/send-followup')
        .send({ jobId: '123', day: 31 });
      expect(response.status).toBe(400);
    });

    test('accepts valid data', async () => {
      const response = await request(app)
        .post('/test/send-followup')
        .send({ jobId: '123', day: 3 });
      expect(response.status).toBe(200);
    });
  });

  describe('pagination', () => {
    test('rejects limit > 100', async () => {
      const response = await request(app).get('/test/pagination?limit=101');
      expect(response.status).toBe(400);
    });

    test('rejects limit < 1', async () => {
      const response = await request(app).get('/test/pagination?limit=0');
      expect(response.status).toBe(400);
    });

    test('accepts valid limit', async () => {
      const response = await request(app).get('/test/pagination?limit=20');
      expect(response.status).toBe(200);
    });

    test('accepts valid status', async () => {
      const response = await request(app).get('/test/pagination?status=Sent');
      expect(response.status).toBe(200);
    });

    test('rejects invalid status', async () => {
      const response = await request(app).get('/test/pagination?status=Invalid');
      expect(response.status).toBe(400);
    });
  });
});
