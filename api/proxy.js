// File: api/proxy.js
import axios from 'axios';
import * as cheerio from 'cheerio';

// Security configuration
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
  // 'example.com',
  // 'github.com',
];

// Helper function to validate URLs
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

// Helper function to rewrite URLs in HTML
function rewriteUrls(html, baseUrl, proxyBase) {
  const $ = cheerio.load(html);
  
  // Rewrite links
  $('a[href]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        $(elem).attr('href', `${proxyBase}/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
      } catch (e) {
        // Keep malformed URLs as-is
      }
    }
  });
  
  // Rewrite images
  $('img[src]').each((i, elem) => {
    const src = $(elem).attr('src');
    if (src) {
      try {
        const absoluteUrl = new URL(src, baseUrl).href;
        $(elem).attr('src', `${proxyBase}/api/resource?url=${encodeURIComponent(absoluteUrl)}`);
      } catch (e) {
        // Keep malformed URLs as-is
      }
    }
  });
  
  // Rewrite CSS links
  $('link[rel="stylesheet"][href]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        $(elem).attr('href', `${proxyBase}/api/resource?url=${encodeURIComponent(absoluteUrl)}`);
      } catch (e) {
        // Keep malformed URLs as-is
      }
    }
  });
  
  // Rewrite script sources
  $('script[src]').each((i, elem) => {
    const src = $(elem).attr('src');
    if (src) {
      try {
        const absoluteUrl = new URL(src, baseUrl).href;
        $(elem).attr('src', `${proxyBase}/api/resource?url=${encodeURIComponent(absoluteUrl)}`);
      } catch (e) {
        // Keep malformed URLs as-is
      }
    }
  });
  
  // Add base tag for remaining relative URLs
  if (!$('base').length) {
    $('head').prepend(`<base href="${baseUrl}">`);
  }
  
  return $.html();
}

// Main serverless function
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    const proxyBase = `https://${req.headers.host}`;
    
    // Make request to target URL
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status < 500;
      }
    });
    
    const contentType = response.headers['content-type'] || '';
    
    if (contentType.includes('text/html')) {
      const rewrittenHtml = rewriteUrls(response.data, targetUrl, proxyBase);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache
      
      return res.status(200).send(rewrittenHtml);
    } else {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
      
      return res.status(200).send(response.data);
    }
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    if (error.code === 'ENOTFOUND') {
      return res.status(404).json({ error: 'Website not found' });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(502).json({ error: 'Connection refused by target server' });
    } else if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({ error: 'Request timeout' });
    } else if (error.response && error.response.status >= 400) {
      return res.status(error.response.status).json({ 
        error: `Target server returned ${error.response.status}` 
      });
    } else {
      return res.status(500).json({ error: 'Proxy server error' });
    }
  }
}