const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/zyad/.gemini/antigravity-ide/brain/2218f3d1-5d62-4c6c-99d8-1685f970a44b/.system_generated/logs/transcript_full.jsonl')
});

rl.on('line', line => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 1514 && obj.step_index <= 1517) {
      console.log('Step:', obj.step_index, 'type:', obj.type, 'content:', (obj.content || '').slice(0, 200));
    }
  } catch(e) {}
});
