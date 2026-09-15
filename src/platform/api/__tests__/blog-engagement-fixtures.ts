import express, { type Express, type Router } from 'express';

export function buildApp(router: Router): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/blog', router);
  return app;
}
