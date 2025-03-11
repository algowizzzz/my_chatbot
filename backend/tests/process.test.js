const request = require('supertest');
const app = require('../index');
const Process = require('../models/Process');

describe('Business Process API Endpoints', () => {
  describe('POST /api/processes', () => {
    it('should create a new business process', async () => {
      const processData = {
        name: 'Test Process',
        steps: [
          {
            type: 'document_selection',
            documentId: 'test-doc-id',
            outputFormat: 'text'
          },
          {
            type: 'analysis',
            prompt: 'Analyze the content'
          }
        ]
      };

      const res = await request(app)
        .post('/api/processes')
        .send(processData)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('steps');
      expect(res.body.steps).toHaveLength(2);
    });

    it('should validate required process fields', async () => {
      await request(app)
        .post('/api/processes')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/processes', () => {
    beforeEach(async () => {
      await Process.create({
        name: 'Test Process',
        steps: [
          {
            type: 'document_selection',
            documentId: 'test-doc-id'
          }
        ]
      });
    });

    it('should retrieve all processes', async () => {
      const res = await request(app)
        .get('/api/processes')
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body[0]).toHaveProperty('name', 'Test Process');
      expect(res.body[0]).toHaveProperty('steps');
    });
  });

  describe('POST /api/processes/:id/execute', () => {
    let processId;

    beforeEach(async () => {
      const process = await Process.create({
        name: 'Test Process',
        steps: [
          {
            type: 'document_selection',
            documentId: 'test-doc-id'
          }
        ]
      });
      processId = process._id;
    });

    it('should execute a business process', async () => {
      const res = await request(app)
        .post(`/api/processes/${processId}/execute`)
        .send({
          inputs: {
            documentId: 'test-doc-id'
          }
        })
        .expect(200);

      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('metadata');
    });

    it('should handle process execution errors', async () => {
      await request(app)
        .post('/api/processes/invalid-id/execute')
        .send({ inputs: {} })
        .expect(400);
    });
  });
});
