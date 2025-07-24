// File: api/resource.js
import axios from 'axios';

// Same security configuration as proxy.js
const BLOCKED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'internal',
  '192.168.',
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.'
];

const ALLOWED_DOMAINS = [
  // Add domains you want to allow, or leave empty for open proxy
];

function validateUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS protocols allowed' };
    }
    
    const hostname = parsed.hostname.toLowerCase();
    for (const blocked of BLOCKED_DOMAINS) {
      if (hostname.includes(blocked)) {
        return { valid: false, error: 'Domain not allowed' };
      }
    }
    
    if (ALLOWED_DOMAINS.length > 0) {
      const allowed = ALLOWED_DOMAINS.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      if (!allowed) {
        return { valid: false, error: 'Domain not in whitelist' };
      }
    }
    
    return { valid: true, url: parsed };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { url: targetUrl } = req.query;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  const validation = validateUrl(targetUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  
  try {
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 10000,
      maxRedirects: 5
    });
    
    // Set appropriate headers
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    return res.status(200).send(response.data);
    
  } catch (error) {
    console.error('Resource proxy error:', error.message);
    return res.status(404).json({ error: 'Resource not found' });
  }
}