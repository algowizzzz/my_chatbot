const request = require('supertest');
const app = require('../index');
const Document = require('../models/Document');
const path = require('path');

describe('Document API Endpoints', () => {
  describe('POST /api/documents/upload', () => {
    it('should upload a document with metadata', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .attach('file', path.join(__dirname, '../test_document.txt'))
        .expect(200);

      expect(res.body).toHaveProperty('documentId');
      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('name');
      expect(res.body.metadata).toHaveProperty('uploadDate');
    });

    it('should handle invalid file upload', async () => {
      await request(app)
        .post('/api/documents/upload')
        .expect(400);
    });
  });

  describe('GET /api/documents', () => {
    beforeEach(async () => {
      await Document.create({
        name: 'test.pdf',
        type: 'application/pdf',
        pageCount: 5,
        sections: ['Introduction', 'Methods'],
        uploadDate: new Date(),
        metadata: {
          filename: 'test.pdf',
          documentId: 'test-id',
          pageNumber: 1,
          section: 'Introduction'
        }
      });
    });

    it('should retrieve all documents with metadata', async () => {
      const res = await request(app)
        .get('/api/documents')
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body[0]).toHaveProperty('name', 'test.pdf');
      expect(res.body[0]).toHaveProperty('metadata');
      expect(res.body[0].metadata).toHaveProperty('section');
    });
  });

  describe('GET /api/documents/:id/chunks', () => {
    let documentId;

    beforeEach(async () => {
      const doc = await Document.create({
        name: 'test.pdf',
        type: 'application/pdf',
        chunks: [
          {
            content: 'Test content',
            metadata: {
              pageNumber: 1,
              section: 'Introduction',
              relevanceScore: 0.95
            }
          }
        ]
      });
      documentId = doc._id;
    });

    it('should retrieve document chunks with metadata', async () => {
      const res = await request(app)
        .get(`/api/documents/${documentId}/chunks`)
        .expect(200);

      expect(res.body.chunks).toBeInstanceOf(Array);
      expect(res.body.chunks[0]).toHaveProperty('content');
      expect(res.body.chunks[0]).toHaveProperty('metadata');
      expect(res.body.chunks[0].metadata).toHaveProperty('relevanceScore');
    });

    it('should handle invalid document ID', async () => {
      await request(app)
        .get('/api/documents/invalid-id/chunks')
        .expect(400);
    });
  });
});
