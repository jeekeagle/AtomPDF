import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { mountPdfStudio } from './pdf-studio';
import { appRoot, dataDir } from './paths';

const app = express();

app.use(express.json({ limit: '8mb' }));

mountPdfStudio(app);

const distRoot = path.join(appRoot, 'dist');
if (fs.existsSync(distRoot)) {
  app.use(express.static(distRoot));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distRoot, 'index.html'));
  });
}

const port = Number(process.env.PORT || 8890);
const server = app.listen(port, () => {
  console.log(`PDF Knowledge Studio API listening on http://127.0.0.1:${port}`);
  console.log(`Library folder: ${path.join(dataDir, 'pdf-library')}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already taken. Start with another port, for example:`,
      `PORT=8900 npm run dev`
    );
  }
  throw error;
});
