import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockForward = vi.fn();
const mockFilterHeaders = vi.fn(() => ({}));

vi.mock('../../src/services/database/postgrest-proxy.service.js', () => ({
  PostgrestProxyService: {
    getInstance: () => ({ forward: mockForward }),
    filterHeaders: mockFilterHeaders,
  },
}));

vi.mock('../../src/api/middlewares/auth.js', () => ({
  extractApiKey: vi.fn(() => null),
}));

vi.mock('../../src/infra/database/database.manager.js', () => ({
  DatabaseManager: {
    getColumnTypeMap: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../src/infra/socket/socket.manager.js', () => ({
  SocketManager: {
    getInstance: () => ({
      broadcastToRoom: vi.fn(),
    }),
  },
}));

describe('database records router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildPostgrestPath joins named wildcard segments', async () => {
    const { buildPostgrestPath } = await import('../../src/api/routes/database/records.routes.js');

    expect(buildPostgrestPath('posts')).toBe('/posts');
    expect(buildPostgrestPath('posts', 'nested/path')).toBe('/posts/nested/path');
    expect(buildPostgrestPath('posts', ['nested', 'path'])).toBe('/posts/nested/path');
  });

  it('registers a named wildcard route compatible with path-to-regexp v8', async () => {
    const { databaseRecordsRouter } = await import(
      '../../src/api/routes/database/records.routes.js'
    );

    const routePaths = (databaseRecordsRouter as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);

    expect(routePaths).toContain('/:tableName');
    expect(routePaths).toContain('/:tableName/*wildcardPath');
  });

  it('forwards wildcard record paths to PostgREST', async () => {
    mockForward.mockResolvedValue({
      data: [{ id: 1 }],
      status: 200,
      headers: {},
    });

    const { databaseRecordsRouter } = await import(
      '../../src/api/routes/database/records.routes.js'
    );
    const wildcardLayer = (databaseRecordsRouter as any).stack.find(
      (layer: any) => layer.route?.path === '/:tableName/*wildcardPath'
    );

    const handler = wildcardLayer.route.stack[0].handle;
    const req = {
      params: { tableName: 'posts', wildcardPath: ['nested', 'record'] },
      method: 'GET',
      query: {},
      headers: {},
      body: undefined,
    } as any;
    const res: Partial<Response> = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    await handler(req, res as Response, next);

    expect(mockForward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/posts/nested/record',
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    expect(next).not.toHaveBeenCalled();
  });
});
