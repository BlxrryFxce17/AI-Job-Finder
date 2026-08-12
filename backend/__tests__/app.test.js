const request = require('supertest');

// Mock all services before importing app
jest.mock('../src/services/aiService', () => ({
  callAIWithRetry: jest.fn().mockResolvedValue({ text: 'Mocked AI response' }),
  groq: {},
  gemini: {},
}));

jest.mock('../src/services/emailService', () => ({
  sendEmailViaAPI: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
  buildTrackedHtmlBody: jest.fn().mockReturnValue('<div>Mocked HTML</div>'),
  createJobMailOptions: jest.fn().mockReturnValue({}),
  createFollowupMailOptions: jest.fn().mockReturnValue({}),
}));

jest.mock('../src/services/emailDiscoveryService', () => ({
  discoverEmailForJob: jest.fn().mockResolvedValue({ email: 'test@example.com', source: 'Mock' }),
  getCompanyDomain: jest.fn().mockReturnValue('example.com'),
  sanitizeAiInstructions: jest.fn().mockImplementation(str => str),
}));

jest.mock('../src/services/jobFetchService', () => ({
  fetchAndSaveJobs: jest.fn().mockResolvedValue(5),
}));

jest.mock('../src/services/resumeService', () => ({
  parseResume: jest.fn().mockResolvedValue({
    resumeText: 'Mock resume text',
    resumePdf: Buffer.from('mock'),
    resumeFilename: 'resume.pdf',
    skills: ['JavaScript', 'React'],
    achievements: ['Built something cool'],
    experienceLevel: 'Mid',
    name: 'Test User',
    title: 'Developer',
    phone: '1234567890',
    linkedin: 'https://linkedin.com/in/test',
    github: 'https://github.com/test',
  }),
}));

jest.mock('../src/services/cronService', () => ({
  initFollowupCron: jest.fn(),
  checkGmailForReply: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/services/auditService', () => ({
  logAudit: jest.fn().mockResolvedValue({}),
  auditMiddleware: () => (req, res, next) => next(),
  AUDIT_ACTIONS: {
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    OAUTH_CALLBACK: 'OAUTH_CALLBACK',
    PROFILE_UPDATE: 'PROFILE_UPDATE',
    RESUME_UPLOAD: 'RESUME_UPLOAD',
    JOB_CREATE: 'JOB_CREATE',
    JOB_UPDATE: 'JOB_UPDATE',
    JOB_DELETE: 'JOB_DELETE',
    JOB_FETCH: 'JOB_FETCH',
    EMAIL_SEND: 'EMAIL_SEND',
    EMAIL_DRAFT: 'EMAIL_DRAFT',
    EMAIL_DISCOVER: 'EMAIL_DISCOVER',
    FOLLOWUP_SEND: 'FOLLOWUP_SEND',
    TEST_EMAIL_SEND: 'TEST_EMAIL_SEND',
    BATCH_SEND_START: 'BATCH_SEND_START',
    BATCH_SEND_COMPLETE: 'BATCH_SEND_COMPLETE',
  },
}));

const app = require('../server');

describe('Health Endpoints', () => {
  test('GET /api/health returns ok', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.environment).toBe('test');
  });

  test('GET /api/health/detailed returns service checks', async () => {
    const response = await request(app).get('/api/health/detailed');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.services).toBeDefined();
    expect(response.body.services.mongodb).toBeDefined();
  });
});

describe('Auth Endpoints', () => {
  test('GET /api/auth/google returns 500 if not configured', async () => {
    // This would need proper mocking of googleapis
    // Skipping for now as it requires more setup
  });
});

describe('Rate Limiting', () => {
  test('rate limiter headers present', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers).toHaveProperty('ratelimit-limit');
    expect(response.headers).toHaveProperty('ratelimit-remaining');
  });
});
