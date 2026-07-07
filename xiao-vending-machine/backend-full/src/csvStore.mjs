import fs from 'fs';
import path from 'path';
import { parse } from '@fast-csv/parse';
import { format } from '@fast-csv/format';

export const DATA_DIR = path.resolve(process.cwd(), 'data');

export function csvPath(name) {
  return path.join(DATA_DIR, name);
}

export async function readCsv(fileName) {
  const filePath = csvPath(fileName);
  if (!fs.existsSync(filePath)) return [];
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(parse({ headers: true, ignoreEmpty: true, trim: true }))
      .on('error', reject)
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows));
  });
}

export async function writeCsv(fileName, rows, headers) {
  const filePath = csvPath(fileName);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    const stream = format({ headers, writeHeaders: true });
    stream.pipe(ws).on('finish', resolve).on('error', reject);
    rows.forEach(row => stream.write(row));
    stream.end();
  });
}

export async function appendCsv(fileName, row, headers) {
  const filePath = csvPath(fileName);
  const exists = fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath, { flags: 'a' });
    const stream = format({ headers, writeHeaders: !exists, includeEndRowDelimiter: true });
    stream.pipe(ws).on('finish', resolve).on('error', reject);
    stream.write(row);
    stream.end();
  });
}

export function nowIso() {
  return new Date().toISOString();
}
