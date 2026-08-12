const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Job Email Drafter API',
      version: '1.0.0',
      description: 'API for AI-powered job search, email drafting, and application tracking',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: config.publicUrl || `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            company: { type: 'string' },
            role: { type: 'string' },
            jd: { type: 'string' },
            status: {
              type: 'string',
              enum: ['Found', 'Drafting', 'Sent', 'Opened', 'Bounced', 'Replied'],
            },
            applyLink: { type: 'string' },
            location: { type: 'string' },
            emailDraft: { type: 'string' },
            emailRecipient: { type: 'string' },
            tracked: { type: 'boolean' },
            clickedLinks: { type: 'array', items: { type: 'string' } },
            publishedAt: { type: 'string', format: 'date-time' },
            sentAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Profile: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            title: { type: 'string' },
            phone: { type: 'string' },
            linkedin: { type: 'string' },
            github: { type: 'string' },
            resumeText: { type: 'string' },
            resumeFilename: { type: 'string' },
            skills: { type: 'array', items: { type: 'string' } },
            achievements: { type: 'array', items: { type: 'string' } },
            experienceLevel: { type: 'string' },
            tone: {
              type: 'string',
              enum: [
                'Professional',
                'Confident & Direct',
                'Enthusiastic & Friendly',
                'Short & Punchy',
              ],
            },
            enableFlex: { type: 'boolean' },
            aiInstructions: { type: 'string' },
            emailUser: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'array' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
