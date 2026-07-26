process.env.JWT_SECRET = 'test_secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../socket', () => ({ emitToUser: jest.fn(), emitToRole: jest.fn() }));
jest.mock('../utils/cache', () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));
jest.mock('../utils/storage', () => ({
  uploadFile: jest.fn().mockResolvedValue({ url: 'https://blob.example.com/posts/test.jpg', pathname: 'posts/test.jpg' }),
  deleteFile: jest.fn().mockResolvedValue(true),
}));

const mockFindUnique = jest.fn();
jest.mock('../lib/prisma', () => {
  function mockModelStub() {
    return {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    };
  }
  return {
    user: { ...mockModelStub(), findUnique: (...args) => mockFindUnique(...args) },
    providerProfile: mockModelStub(),
    providerService: mockModelStub(),
    post: mockModelStub(),
    postLike: mockModelStub(),
    $transaction: jest.fn((fn) => fn({ post: mockModelStub(), postLike: mockModelStub() })),
  };
});

const app = require('../app');
const prisma = require('../lib/prisma');
const JWT_SECRET = process.env.JWT_SECRET;

function providerToken(userId = 'provider1') {
  return jwt.sign({ userId, role: 'Provider' }, JWT_SECRET);
}
function customerToken(userId = 'customer1') {
  return jwt.sign({ userId, role: 'CUSTOMER' }, JWT_SECRET);
}

describe('POST /posts', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/posts').send({ photoBase64: 'abc' });
    expect(res.status).toBe(401);
  });

  it('rejects non-provider roles', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ photoBase64: 'abc' });
    expect(res.status).toBe(403);
  });

  it('rejects missing photoBase64', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'provider1', role: 'Provider', deletedAt: null });
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${providerToken()}`)
      .send({ caption: 'no photo here' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/photoBase64/);
  });

  it('rejects oversized photoBase64', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'provider1', role: 'Provider', deletedAt: null });
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${providerToken()}`)
      .send({ photoBase64: 'a'.repeat(8_000_001) });
    expect(res.status).toBe(413);
  });

  it('creates a post and returns 201', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test_blob_token';
    mockFindUnique.mockResolvedValueOnce({ id: 'provider1', role: 'Provider', deletedAt: null });
    prisma.providerProfile.findUnique.mockResolvedValueOnce({ id: 'profile1', userId: 'provider1' });
    const createdPost = {
      id: 'post1',
      profileId: 'profile1',
      photoUrl: 'https://blob.example.com/posts/test.jpg',
      caption: 'hello world',
      serviceId: null,
      active: true,
    };
    prisma.post.create.mockResolvedValueOnce(createdPost);

    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${providerToken()}`)
      .send({ photoBase64: Buffer.from('fake image bytes').toString('base64'), caption: 'hello world' });

    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(res.status).toBe(201);
    expect(res.body.post).toEqual(createdPost);
  });
});

describe('DELETE /posts/:id', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).delete('/posts/post1');
    expect(res.status).toBe(401);
  });

  it('rejects deleting a post owned by a different provider', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'provider1', role: 'Provider', deletedAt: null });
    prisma.providerProfile.findUnique.mockResolvedValueOnce({ id: 'profile1', userId: 'provider1' });
    prisma.post.findUnique.mockResolvedValueOnce({
      id: 'post1',
      profileId: 'someone-elses-profile',
      active: true,
    });

    const res = await request(app)
      .delete('/posts/post1')
      .set('Authorization', `Bearer ${providerToken()}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent or already-inactive post', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'provider1', role: 'Provider', deletedAt: null });
    prisma.providerProfile.findUnique.mockResolvedValueOnce({ id: 'profile1', userId: 'provider1' });
    prisma.post.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/posts/does-not-exist')
      .set('Authorization', `Bearer ${providerToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /posts/mine', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/posts/mine');
    expect(res.status).toBe(401);
  });

  it('returns a populated list of the provider\'s posts', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'provider1', role: 'Provider', deletedAt: null });
    prisma.providerProfile.findUnique.mockResolvedValueOnce({ id: 'profile1', userId: 'provider1' });
    const posts = [
      { id: 'post2', profileId: 'profile1', photoUrl: 'https://blob.example.com/posts/2.jpg', active: true },
      { id: 'post1', profileId: 'profile1', photoUrl: 'https://blob.example.com/posts/1.jpg', active: true },
    ];
    prisma.post.findMany.mockResolvedValueOnce(posts);

    const res = await request(app)
      .get('/posts/mine')
      .set('Authorization', `Bearer ${providerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual(posts);
  });
});
