export default {
  test: {
    include: ['artifacts/trailer-45s/rehearsal-geometry.check.ts'],
    environment: 'node',
    testTimeout: 20000,
    maxWorkers: 1,
    fileParallelism: false,
  },
};
