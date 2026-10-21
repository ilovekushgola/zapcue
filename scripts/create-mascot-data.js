import fs from 'fs';
import path from 'path';

const icon48Path = path.resolve('public/icons/icon48.png');
const b64 = fs.readFileSync(icon48Path).toString('base64');
const dataUri = `data:image/png;base64,${b64}`;

const outPath = path.resolve('src/content/ui/mascot-data.ts');
fs.writeFileSync(outPath, `// Zapcue Mascot Logo Data URI (Self-contained, zero-latency)\nexport const ZAPCUE_LOGO_DATA_URI = ${JSON.stringify(dataUri)};\n`);

console.log('✓ Created src/content/ui/mascot-data.ts with base64 mascot icon');
