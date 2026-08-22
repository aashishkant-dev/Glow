process.env.JWT_SECRET = 'test_secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../socket', () => ({ emitToUser: jest.fn(), emitToRole: jest.fn() }));
jest.mock('../utils/cache', () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));

function mockModelStub() {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
}

// Names must start with `mock` — babel-plugin-jest-hoist (which hoists the
// jest.mock() call below above these declarations) only allows referencing
// out-of-scope variables from inside a factory when they carry that prefix.
// Same constraint posts.test.js's `mockFindUnique` already relies on.
const mockFindUnique = jest.fn();
const mockCommentModel = mockModelStub();
const mockPostModel = mockModelStub();
const mockProviderLookModel = mockModelStub();

jest.mock('../lib/prisma', () => ({
  user: { ...mockModelStub(), findUnique: (...args) => mockFindUnique(...args) },
  comment: mockCommentModel,
  post: mockPostModel,
  providerLook: mockProviderLookModel,
  // comments.js uses the ARRAY form of $transaction (unlike posts.js's
  // callback form elsewhere) — real Prisma resolves each op and returns an
  // array of results, so the mock does the same via Promise.all.
  $transaction: jest.fn((ops) => (Array.isArray(ops) ? Promise.all(ops) : ops({}))),
}));

const app = require('../app');
const JWT_SECRET = process.env.JWT_SECRET;

function tokenFor(userId, role) {
  return jwt.sign({ userId, role }, JWT_SECRET);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /comments', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/comments').send({ postId: 'p1', text: 'hi' });
    expect(res.status).toBe(401);
  });

  it('rejects when neither postId nor providerLookId is given', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`)
      .send({ text: 'hi' });
    expect(res.status).toBe(400);
  });

  it('rejects when both postId and providerLookId are given', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`)
      .send({ postId: 'p1', providerLookId: 'l1', text: 'hi' });
    expect(res.status).toBe(400);
  });

  it('rejects empty/whitespace-only text', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`)
      .send({ postId: 'p1', text: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects text over 500 characters', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`)
      .send({ postId: 'p1', text: 'a'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('404s when the target post does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    mockPostModel.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`)
      .send({ postId: 'missing', text: 'hi' });
    expect(res.status).toBe(404);
  });

  it('creates a comment on a post and increments commentCount', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    mockPostModel.findUnique.mockResolvedValueOnce({ id: 'p1', active: true });
    mockCommentModel.create.mockResolvedValueOnce({
      id: 'c1', postId: 'p1', providerLookId: null, text: 'love this', createdAt: new Date(),
      user: { id: 'u1', name: 'Jamie', photoUrl: null, role: 'CUSTOMER' },
    });
    mockPostModel.update.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`)
      .send({ postId: 'p1', text: 'love this' });

    expect(res.status).toBe(201);
    expect(res.body.comment.text).toBe('love this');
    expect(mockPostModel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { commentCount: { increment: 1 } } })
    );
  });

  it('creates a comment on a look WITHOUT touching Post.update (no denormalized counter there)', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'Provider', deletedAt: null });
    mockProviderLookModel.findUnique.mockResolvedValueOnce({ id: 'l1', active: true });
    mockCommentModel.create.mockResolvedValueOnce({
      id: 'c2', postId: null, providerLookId: 'l1', text: 'stunning', createdAt: new Date(),
      user: { id: 'u1', name: 'Sam', photoUrl: null, role: 'Provider' },
    });

    const res = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'Provider')}`)
      .send({ providerLookId: 'l1', text: 'stunning' });

    expect(res.status).toBe(201);
    expect(mockPostModel.update).not.toHaveBeenCalled();
  });
});

describe('GET /comments', () => {
  it('rejects when neither postId nor providerLookId is given', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .get('/comments')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`);
    expect(res.status).toBe(400);
  });

  it('returns a paginated list for a post', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    mockCommentModel.findMany.mockResolvedValueOnce([
      { id: 'c1', postId: 'p1', providerLookId: null, text: 'hi', createdAt: new Date(), user: { id: 'u2', name: 'A', photoUrl: null, role: 'CUSTOMER' } },
    ]);
    const res = await request(app)
      .get('/comments?postId=p1')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.nextCursor).toBeNull();
  });
});

describe('DELETE /comments/:id — moderation authorization', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).delete('/comments/c1');
    expect(res.status).toBe(401);
  });

  it('404s when the comment does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', role: 'CUSTOMER', deletedAt: null });
    mockCommentModel.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/comments/missing')
      .set('Authorization', `Bearer ${tokenFor('u1', 'CUSTOMER')}`);
    expect(res.status).toBe(404);
  });

  it('403s a stranger — neither the comment author nor the content owner', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'stranger', role: 'CUSTOMER', deletedAt: null });
    mockCommentModel.findUnique.mockResolvedValueOnce({
      id: 'c1', userId: 'author1', postId: 'p1', providerLookId: null,
      post: { id: 'p1', profile: { userId: 'artist1' } }, providerLook: null,
    });
    const res = await request(app)
      .delete('/comments/c1')
      .set('Authorization', `Bearer ${tokenFor('stranger', 'CUSTOMER')}`);
    expect(res.status).toBe(403);
  });

  it('lets the comment author delete their own comment (not the content owner)', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'author1', role: 'CUSTOMER', deletedAt: null });
    mockCommentModel.findUnique.mockResolvedValueOnce({
      id: 'c1', userId: 'author1', postId: 'p1', providerLookId: null,
      post: { id: 'p1', profile: { userId: 'artist1' } }, providerLook: null,
    });
    mockCommentModel.delete.mockResolvedValueOnce({});
    mockPostModel.update.mockResolvedValueOnce({});

    const res = await request(app)
      .delete('/comments/c1')
      .set('Authorization', `Bearer ${tokenFor('author1', 'CUSTOMER')}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('lets the artist who owns the post delete a comment they did NOT write — the core moderation case', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'artist1', role: 'Provider', deletedAt: null });
    mockCommentModel.findUnique.mockResolvedValueOnce({
      id: 'c1', userId: 'someCustomer', postId: 'p1', providerLookId: null,
      post: { id: 'p1', profile: { userId: 'artist1' } }, providerLook: null,
    });
    mockCommentModel.delete.mockResolvedValueOnce({});
    mockPostModel.update.mockResolvedValueOnce({});

    const res = await request(app)
      .delete('/comments/c1')
      .set('Authorization', `Bearer ${tokenFor('artist1', 'Provider')}`);
    expect(res.status).toBe(200);
    expect(mockPostModel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { commentCount: { decrement: 1 } } })
    );
  });

  it('lets the artist who owns a LOOK delete a comment on it — same moderation rule for looks', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'artist1', role: 'Provider', deletedAt: null });
    mockCommentModel.findUnique.mockResolvedValueOnce({
      id: 'c2', userId: 'someCustomer', postId: null, providerLookId: 'l1',
      post: null, providerLook: { id: 'l1', profile: { userId: 'artist1' } },
    });
    mockCommentModel.delete.mockResolvedValueOnce({});

    const res = await request(app)
      .delete('/comments/c2')
      .set('Authorization', `Bearer ${tokenFor('artist1', 'Provider')}`);
    expect(res.status).toBe(200);
    expect(mockPostModel.update).not.toHaveBeenCalled(); // no denormalized counter on looks
  });
});
