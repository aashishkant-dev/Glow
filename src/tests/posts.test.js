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

describe('POST /posts/:id/like', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/posts/post1/like');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent or inactive post', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/posts/does-not-exist/like')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(404);
  });

  it('creates a PostLike and increments likeCount via $transaction', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findUnique.mockResolvedValueOnce({ id: 'post1', active: true });

    const txPostLike = { create: jest.fn().mockResolvedValue({ id: 'like1', postId: 'post1', userId: 'customer1' }) };
    const txPost = { update: jest.fn().mockResolvedValue({ id: 'post1', likeCount: 1 }) };
    prisma.$transaction.mockImplementationOnce((fn) => fn({ post: txPost, postLike: txPostLike }));

    const res = await request(app)
      .post('/posts/post1/like')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(txPostLike.create).toHaveBeenCalledWith({ data: { postId: 'post1', userId: 'customer1' } });
    expect(txPost.update).toHaveBeenCalledWith({
      where: { id: 'post1' },
      data: { likeCount: { increment: 1 } },
    });
  });

  it('is a no-op (not an error) when the same user likes the post twice (P2002)', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findUnique.mockResolvedValueOnce({ id: 'post1', active: true });

    const duplicateError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prisma.$transaction.mockImplementationOnce(async () => {
      throw duplicateError;
    });

    const res = await request(app)
      .post('/posts/post1/like')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('propagates non-P2002 errors as a 500', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findUnique.mockResolvedValueOnce({ id: 'post1', active: true });

    const otherError = Object.assign(new Error('boom'), { code: 'P9999' });
    prisma.$transaction.mockImplementationOnce(async () => {
      throw otherError;
    });

    const res = await request(app)
      .post('/posts/post1/like')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(500);
  });
});

describe('DELETE /posts/:id/like', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).delete('/posts/post1/like');
    expect(res.status).toBe(401);
  });

  it('is a no-op success when no like exists, without running the transaction', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.postLike.findUnique.mockResolvedValueOnce(null);
    prisma.$transaction.mockClear();

    const res = await request(app)
      .delete('/posts/post1/like')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes the PostLike and decrements likeCount when a like exists', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.postLike.findUnique.mockResolvedValueOnce({ id: 'like1', postId: 'post1', userId: 'customer1' });

    const txPostLike = { delete: jest.fn().mockResolvedValue({ id: 'like1' }) };
    const txPost = { update: jest.fn().mockResolvedValue({ id: 'post1', likeCount: 0 }) };
    prisma.$transaction.mockImplementationOnce((fn) => fn({ post: txPost, postLike: txPostLike }));

    const res = await request(app)
      .delete('/posts/post1/like')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(txPostLike.delete).toHaveBeenCalledWith({ where: { id: 'like1' } });
    expect(txPost.update).toHaveBeenCalledWith({
      where: { id: 'post1' },
      data: { likeCount: { decrement: 1 } },
    });
  });

  it('is a no-op (not an error) when a concurrent request already deleted the like (P2025)', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.postLike.findUnique.mockResolvedValueOnce({ id: 'like1', postId: 'post1', userId: 'customer1' });

    const raceError = Object.assign(new Error('An operation failed because it depends on one or more records that were required but not found'), { code: 'P2025' });
    prisma.$transaction.mockImplementationOnce(async () => {
      throw raceError;
    });

    const res = await request(app)
      .delete('/posts/post1/like')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe('GET /posts/explore', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/posts/explore');
    expect(res.status).toBe(401);
  });

  it('rejects invalid sort values', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .get('/posts/explore?sort=bogus')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(400);
  });

  it('defaults to sort=recent and orders by createdAt desc', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post2', photoUrl: 'https://blob.example.com/2.jpg', caption: 'newer', likeCount: 1,
        createdAt: new Date('2026-07-20T00:00:00Z'),
        profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } },
        service: null,
        likes: [],
      },
      {
        id: 'post1', photoUrl: 'https://blob.example.com/1.jpg', caption: 'older', likeCount: 5,
        createdAt: new Date('2026-07-10T00:00:00Z'),
        profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } },
        service: null,
        likes: [],
      },
    ]);

    const res = await request(app)
      .get('/posts/explore')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
    expect(res.body.posts.map((p) => p.id)).toEqual(['post2', 'post1']);
  });

  it('sort=top orders by likeCount desc', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post1', photoUrl: 'https://blob.example.com/1.jpg', caption: 'most liked', likeCount: 10,
        createdAt: new Date('2026-07-10T00:00:00Z'),
        profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } },
        service: null,
        likes: [],
      },
      {
        id: 'post2', photoUrl: 'https://blob.example.com/2.jpg', caption: 'less liked', likeCount: 2,
        createdAt: new Date('2026-07-20T00:00:00Z'),
        profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } },
        service: null,
        likes: [],
      },
    ]);

    const res = await request(app)
      .get('/posts/explore?sort=top')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { likeCount: 'desc' } })
    );
    expect(res.body.posts.map((p) => p.id)).toEqual(['post1', 'post2']);
  });

  it('computes isLikedByMe true when the requesting user has liked the post', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post1', photoUrl: 'https://blob.example.com/1.jpg', caption: 'liked by me', likeCount: 1,
        createdAt: new Date(),
        profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } },
        service: null,
        likes: [{ id: 'like1' }],
      },
      {
        id: 'post2', photoUrl: 'https://blob.example.com/2.jpg', caption: 'not liked by me', likeCount: 0,
        createdAt: new Date(),
        profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } },
        service: null,
        likes: [],
      },
    ]);

    const res = await request(app)
      .get('/posts/explore')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.posts.map((p) => [p.id, p]));
    expect(byId.post1.isLikedByMe).toBe(true);
    expect(byId.post2.isLikedByMe).toBe(false);
  });

  it('sets nextCursor to the last item id and excludes the peek item when more results exist', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    // limit=2 requested, mock returns 3 (limit+1 "peek" item)
    prisma.post.findMany.mockResolvedValueOnce([
      { id: 'post3', photoUrl: '', caption: '', likeCount: 0, createdAt: new Date(), profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } }, service: null, likes: [] },
      { id: 'post2', photoUrl: '', caption: '', likeCount: 0, createdAt: new Date(), profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } }, service: null, likes: [] },
      { id: 'post1', photoUrl: '', caption: '', likeCount: 0, createdAt: new Date(), profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } }, service: null, likes: [] },
    ]);

    const res = await request(app)
      .get('/posts/explore?limit=2')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.map((p) => p.id)).toEqual(['post3', 'post2']);
    expect(res.body.nextCursor).toBe('post1');
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 })
    );
  });

  it('clamps a negative limit to a minimum of 1 instead of 500ing', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    // limit clamped to 1 requested, mock returns 2 (limit+1 "peek" item)
    prisma.post.findMany.mockResolvedValueOnce([
      { id: 'post2', photoUrl: '', caption: '', likeCount: 0, createdAt: new Date(), profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } }, service: null, likes: [] },
      { id: 'post1', photoUrl: '', caption: '', likeCount: 0, createdAt: new Date(), profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } }, service: null, likes: [] },
    ]);

    const res = await request(app)
      .get('/posts/explore?sort=recent&limit=-5')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.map((p) => p.id)).toEqual(['post2']);
    expect(res.body.nextCursor).toBe('post1');
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 })
    );
  });

  it('sets nextCursor to null when fewer results exist than the limit', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([
      { id: 'post1', photoUrl: '', caption: '', likeCount: 0, createdAt: new Date(), profile: { id: 'profile1', photoUrl: '', user: { name: 'Alice' } }, service: null, likes: [] },
    ]);

    const res = await request(app)
      .get('/posts/explore?limit=20')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.map((p) => p.id)).toEqual(['post1']);
    expect(res.body.nextCursor).toBeNull();
  });

  // Search used to be done client-side over whatever page the app had already
  // loaded — about 20 posts out of the whole catalogue — so anything further
  // down could not be found at all, reported as "search doesn't work".
  it('passes a case-insensitive search across caption, category, artist and service when q is given', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/posts/explore?q=bridal')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    const { where } = prisma.post.findMany.mock.calls.at(-1)[0];
    expect(where.OR).toEqual([
      { caption: { contains: 'bridal', mode: 'insensitive' } },
      { category: { contains: 'bridal', mode: 'insensitive' } },
      { profile: { user: { name: { contains: 'bridal', mode: 'insensitive' } } } },
      { service: { name: { contains: 'bridal', mode: 'insensitive' } } },
    ]);
    // Search narrows the existing visibility rules, never replaces them.
    expect(where.active).toBe(true);
    expect(where.profile).toEqual(expect.objectContaining({ approvedByAdmin: true }));
  });

  it('trims q and ignores it when blank, so a stray space is not a search', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([]);

    await request(app)
      .get('/posts/explore?q=%20%20')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(prisma.post.findMany.mock.calls.at(-1)[0].where.OR).toBeUndefined();
  });

  it('applies category and q together rather than one overriding the other', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([]);

    await request(app)
      .get('/posts/explore?category=Makeup&q=glam')
      .set('Authorization', `Bearer ${customerToken()}`);

    const { where } = prisma.post.findMany.mock.calls.at(-1)[0];
    expect(where.category).toBe('Makeup');
    expect(where.OR).toHaveLength(4);
  });

  it('passes cursor and skip:1 to prisma when a cursor is provided', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'customer1', role: 'CUSTOMER', deletedAt: null });
    prisma.post.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/posts/explore?cursor=post5')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'post5' }, skip: 1 })
    );
  });
});
