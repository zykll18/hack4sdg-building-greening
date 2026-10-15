import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Reproduce the reviewed climate aggregate from the official EPW, without a runtime dependency.
const file = process.argv[2];
if (!file) throw new Error('Supply the original Hong Kong CityUHK EPW path');
const bytes = await readFile(file), lines = bytes.toString('utf8').trim().split(/\r?\n/);
const rows = lines.slice(8).map(line => line.split(','));
if (rows.length !== 8760) throw new Error('Expected a complete 8760-hour typical year');
const bins = Array(24).fill(0), seen = new Set();
for (const row of rows) {
  const hour = Number(row[3]) - 1, temperature = Number(row[6]), key = row.slice(1,4).join(':');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isFinite(temperature) || temperature < -40 || temperature > 60 || seen.has(key)) throw new Error('Invalid or duplicate weather record');
  seen.add(key); bins[hour] += Math.max(0, temperature - 26);
}
console.log(JSON.stringify({ sha256: createHash('sha256').update(bytes).digest('hex'), hours: rows.length,
  degreeHoursByHour: bins, annual: bins.reduce((a,b) => a+b,0), daytime: bins.slice(8,18).reduce((a,b) => a+b,0) }, null, 2));
