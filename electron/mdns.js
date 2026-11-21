/**
 * electron/mdns.js
 * 
 * Zero-dependency LAN Service Discovery for Taqfeela POS.
 * Listens for multicast / broadcast discovery probes and responds with cashier server details.
 * Also advertises on UDP port 53535 so mobile apps discover the cashier in < 500ms on the Wi-Fi.
 */

'use strict';

const dgram = require('dgram');
const os = require('os');

let server = null;
const DISCOVERY_PORT = 53535;
const MDNS_MULTICAST_ADDR = '224.0.0.251';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const addr = iface.address;
        if (addr.startsWith('169.254.')) continue;
        let priority = 10;
        const lowerName = name.toLowerCase();
        if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wireless') || lowerName.includes('wlan')) {
          priority = 100;
        } else if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('lan')) {
          priority = 80;
        } else if (lowerName.includes('tailscale') || lowerName.includes('vethernet') || lowerName.includes('virtual')) {
          priority = 1;
        }
        if (addr.startsWith('192.168.1.') || addr.startsWith('192.168.0.')) {
          priority += 30;
        } else if (addr.startsWith('192.168.')) {
          priority += 20;
        }
        candidates.push({ address: addr, priority });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].address;
  }
  return '127.0.0.1';
}

function startDiscoveryBeacon(options = {}) {
  const { port = 3000, cafeName = 'تقفيلة كافيه', version = '1.0.2' } = options;

  if (server) {
    try { server.close(); } catch (_) {}
  }

  try {
    server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    server.on('error', (err) => {
      console.warn('[Discovery Beacon] UDP socket error:', err.message);
    });

    server.on('message', (msg, rinfo) => {
      try {
        const text = msg.toString('utf8');
        if (text.includes('taqfeela') || text.includes('TAQFEELA_DISCOVER')) {
          const responsePayload = JSON.stringify({
            app: 'taqfeela',
            service: '_taqfeela._tcp',
            cafe: cafeName,
            host: getLocalIp(),
            port,
            ver: version
          });
          const responseBuffer = Buffer.from(responsePayload, 'utf8');
          server.send(responseBuffer, 0, responseBuffer.length, rinfo.port, rinfo.address);
        }
      } catch (_) {}
    });

    server.bind(DISCOVERY_PORT, () => {
      try {
        server.setBroadcast(true);
        server.setMulticastTTL(128);
        console.log(`[Discovery Beacon] LAN Discovery listening on UDP:${DISCOVERY_PORT} (_taqfeela._tcp)`);
      } catch (bindErr) {
        console.warn('[Discovery Beacon] Multicast setup warning:', bindErr.message);
      }
    });
  } catch (err) {
    console.warn('[Discovery Beacon] Could not start UDP beacon:', err.message);
  }
}

function stopDiscoveryBeacon() {
  if (server) {
    try {
      server.close();
    } catch (_) {}
    server = null;
  }
}

module.exports = {
  startDiscoveryBeacon,
  stopDiscoveryBeacon,
  getLocalIp
};
