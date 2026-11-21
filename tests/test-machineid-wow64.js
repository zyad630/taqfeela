const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

console.log('=== Item 2: Machine ID and Registry WOW64 Audit ===');
console.log('Current process architecture:', process.arch);

function queryRegistry(args) {
  try {
    const cmd = `reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid ${args}`.trim();
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const match = out.match(/MachineGuid\s+REG_SZ\s+([a-f0-9\-]+)/i);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

const guidDefault = queryRegistry('');
const guid64 = queryRegistry('/reg:64');
const guid32 = queryRegistry('/reg:32');

console.log('Default query MachineGuid: ', guidDefault);
console.log('/reg:64 query MachineGuid: ', guid64);
console.log('/reg:32 query MachineGuid: ', guid32);

// Test with 32-bit electron or node if available
console.log('\nTesting with /reg:64 explicit flag guarantee:');
const machineIdCurrent = crypto.createHash('sha256').update(guidDefault || '').digest('hex').substring(0, 16).toUpperCase();
const machineId64 = crypto.createHash('sha256').update(guid64 || '').digest('hex').substring(0, 16).toUpperCase();
console.log('MachineId (default): ', machineIdCurrent);
console.log('MachineId (/reg:64): ', machineId64);

if (guid64 && guid32) {
  console.log('MachineGuid matches between /reg:64 and /reg:32?', guid64.toLowerCase() === guid32.toLowerCase());
}

