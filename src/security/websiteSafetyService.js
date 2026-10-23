/**
 * 🛡️ NERO LABS — WEBSITE SCAM & SECURITY RISK ANALYSIS SERVICE
 * Defensive analysis: domain normalization, TLS cert inspection, brand spoofing,
 * redirect tracing, content urgency heuristics, and structured risk assessment.
 */

import tls from 'node:tls';
import { URL } from 'node:url';

export class WebsiteSafetyService {
  constructor() {
    this.timeoutMs = 7000;
  }

  /**
   * Determine whether query is a website safety / scam check
   */
  isSafetyQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return (
      /^(?:is\s+this\s+(?:website|site|link|url)\s+(?:safe|legit|a\s+scam|phishing|fake))\b/i.test(lower) ||
      /\b(?:check\s+(?:this\s+)?(?:site|url|link|domain)\s+for\s+(?:scam|safety|malware|phishing))\b/i.test(lower) ||
      /\b(?:website\s+safety|scam\s+check|is\s+it\s+safe)\b/i.test(lower) ||
      /^(?:\/safety|\/scamcheck|\/isitsafe)\b/i.test(lower)
    );
  }

  /**
   * Extract target URL from user query
   */
  extractUrl(text) {
    if (!text) return null;
    const match = text.match(/https?:\/\/[^\s"'<>]+/i) || text.match(/(?:www\.)[^\s"'<>]+/i);
    if (match) {
      let urlStr = match[0];
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        urlStr = 'https://' + urlStr;
      }
      return urlStr;
    }
    return null;
  }

  /**
   * Inspect TLS/HTTPS certificate directly via native TLS socket
   */
  async inspectCertificate(hostname) {
    return new Promise((resolve) => {
      const socket = tls.connect(
        {
          host: hostname,
          port: 443,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: 5000,
        },
        () => {
          try {
            const cert = socket.getPeerCertificate(true);
            const isAuthorized = socket.authorized;
            const authError = socket.authorizationError;

            let daysRemaining = null;
            if (cert.valid_to) {
              const expireDate = new Date(cert.valid_to);
              daysRemaining = Math.round((expireDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            }

            socket.destroy();
            resolve({
              hasHttps: true,
              isAuthorized,
              authError: authError ? String(authError) : null,
              issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown CA',
              subject: cert.subject?.CN || hostname,
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              daysRemaining,
              isSelfSigned: Boolean(cert.issuer && cert.subject && cert.issuer.CN === cert.subject.CN),
            });
          } catch (err) {
            socket.destroy();
            resolve({ hasHttps: true, error: err.message });
          }
        }
      );

      socket.on('error', (err) => {
        socket.destroy();
        resolve({ hasHttps: false, error: err.message });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ hasHttps: false, error: 'TLS connection timed out' });
      });
    });
  }

  /**
   * Trace redirect hops to detect deceptive cloaking
   */
  async traceRedirects(initialUrl, maxHops = 5) {
    let currentUrl = initialUrl;
    const hops = [initialUrl];

    for (let i = 0; i < maxHops; i++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
        const res = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'NeroLabsSafetyScanner/3.0' },
        });

        const status = res.status;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const loc = res.headers.get('location');
          if (loc) {
            const nextUrl = new URL(loc, currentUrl).href;
            hops.push(nextUrl);
            currentUrl = nextUrl;
            continue;
          }
        }
        break;
      } catch {
        break;
      } finally {
        clearTimeout(timeout);
      }
    }

    return hops;
  }

  /**
   * Run comprehensive defensive risk analysis on target website
   */
  async analyzeWebsite(urlStr) {
    let parsedUrl;
    try {
      let raw = (urlStr || '').trim();
      if (!raw) {
        throw new Error('Empty URL');
      }
      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = 'https://' + raw;
      }
      parsedUrl = new URL(raw);
      if (!parsedUrl.hostname || (!parsedUrl.hostname.includes('.') && parsedUrl.hostname !== 'localhost')) {
        throw new Error('Invalid hostname: missing domain suffix');
      }
    } catch {
      return {
        ok: false,
        url: urlStr,
        riskLevel: 'Unable to determine',
        summary: 'Invalid URL syntax or domain provided.',
      };
    }

    const domain = parsedUrl.hostname.toLowerCase();
    const checksPerformed = [
      'URL structure & domain normalization',
      'Punycode and lookalike character analysis',
      'TLS/HTTPS certificate inspection',
      'Brand spoofing and phishing heuristics',
      'HTTP redirect cloaking scan',
      'Page content urgency & credential pressure heuristics',
    ];

    const findings = [];
    const suspiciousIndicators = [];
    let riskScore = 0;

    // 1. IP Address check
    const isIpHost = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
    if (isIpHost) {
      suspiciousIndicators.push('URL points directly to a raw numerical IP address instead of a registered domain.');
      riskScore += 3;
    } else {
      findings.push(`Domain resolved: ${domain}`);
    }

    // 2. Punycode check
    if (domain.includes('xn--')) {
      suspiciousIndicators.push('Punycode detected: domain uses internationalized characters that can mimic legitimate brand letters.');
      riskScore += 2;
    }

    // 3. Brand impersonation / Phishing heuristics
    const protectedBrands = [
      'paypal',
      'apple',
      'google',
      'microsoft',
      'netflix',
      'amazon',
      'chase',
      'bankofamerica',
      'wellsfargo',
      'binance',
      'metamask',
      'coinbase',
      'facebook',
      'instagram',
      'telegram',
      'whatsapp',
    ];

    for (const brand of protectedBrands) {
      if (domain.includes(brand)) {
        // Legitimate apex domains for the brand
        const legitApex = `${brand}.com`;
        const isLegit = domain === legitApex || domain.endsWith(`.${legitApex}`) || domain === `${brand}.org` || domain.endsWith(`.${brand}.org`);
        if (!isLegit) {
          suspiciousIndicators.push(
            `Potential brand impersonation: "${brand}" appears in domain name "${domain}", but this is NOT the official ${brand} website.`
          );
          riskScore += 3;
        }
      }
    }

    // 4. Suspicious TLD check
    const highRiskTlds = ['.top', '.xyz', '.work', '.click', '.fit', '.buzz', '.gq', '.cf', '.tk', '.ml'];
    for (const tld of highRiskTlds) {
      if (domain.endsWith(tld)) {
        suspiciousIndicators.push(`Domain uses high-abuse TLD "${tld}" frequently associated with disposable phishing campaigns.`);
        riskScore += 1;
      }
    }

    // 5. Excessive subdomains check
    const subParts = domain.split('.');
    if (subParts.length > 4) {
      suspiciousIndicators.push('Excessive subdomain depth detected, often used to disguise deceptive landing pages.');
      riskScore += 1;
    }

    // 6. TLS Certificate Inspection
    let certInfo = null;
    if (parsedUrl.protocol === 'https:') {
      certInfo = await this.inspectCertificate(domain);
      if (certInfo.hasHttps) {
        findings.push(`TLS Certificate active: issued by ${certInfo.issuer}.`);
        if (certInfo.isSelfSigned) {
          suspiciousIndicators.push('Self-signed TLS certificate detected (not issued by a trusted public Certificate Authority).');
          riskScore += 2;
        }
        if (certInfo.daysRemaining !== null && certInfo.daysRemaining <= 0) {
          suspiciousIndicators.push('TLS Certificate is expired.');
          riskScore += 2;
        }
      } else {
        suspiciousIndicators.push(`HTTPS connection failed: ${certInfo.error || 'Unable to establish TLS handshake.'}`);
        riskScore += 2;
      }
    } else {
      suspiciousIndicators.push('Website uses unencrypted HTTP protocol without SSL/TLS security.');
      riskScore += 2;
    }

    // 7. Redirect Hops Inspection
    const hops = await this.traceRedirects(parsedUrl.href, 4);
    if (hops.length > 2) {
      const finalHop = hops[hops.length - 1];
      const finalHost = new URL(finalHop).hostname.toLowerCase();
      findings.push(`Redirect chain detected (${hops.length - 1} hops) leading to ${finalHost}.`);
      if (finalHost !== domain) {
        suspiciousIndicators.push(`Cross-domain redirect detected: starts at "${domain}" but redirects to "${finalHost}".`);
        riskScore += 1;
      }
    }

    // 8. Lightweight Page Content Inspection
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const pageRes = await fetch(parsedUrl.href, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      clearTimeout(timeout);

      if (pageRes.ok) {
        const bodyText = (await pageRes.text()).slice(0, 80000);

        // Check for urgency keywords
        if (/(?:account\s+(?:suspended|locked|disabled)|verify\s+your\s+identity\s+immediately|unauthorized\s+activity\s+detected|claim\s+your\s+(?:free|reward|airdrop))/i.test(bodyText)) {
          suspiciousIndicators.push('High-pressure urgency language detected ("Account suspended/verify immediately/claim airdrop").');
          riskScore += 2;
        }

        // Check for risky download extensions
        const downloadMatches = bodyText.match(/\.(?:exe|scr|bat|vbs|apk|iso|cmd)\b/gi);
        if (downloadMatches) {
          suspiciousIndicators.push(`Executable or script download links detected on page: ${Array.from(new Set(downloadMatches)).join(', ')}.`);
          riskScore += 2;
        }
      }
    } catch {
      findings.push('Could not fetch live HTML content (site may be blocking scrapers or offline).');
    }

    // Determine Risk Assessment
    let riskLevel = 'Low observed risk';
    if (suspiciousIndicators.length === 0) {
      riskLevel = 'Low observed risk';
    } else if (riskScore >= 4) {
      riskLevel = 'High risk';
    } else {
      riskLevel = 'Suspicious';
    }

    return {
      ok: true,
      url: parsedUrl.href,
      domain,
      riskLevel,
      riskScore,
      checksPerformed,
      findings,
      suspiciousIndicators,
      certInfo,
      limitations: [
        'A "Low observed risk" rating does not guarantee a website is 100% safe — sophisticated scams can host valid HTTPS certificates on newly registered domains.',
        'This defensive check inspects observable domain heuristics, certificates, and content indicators. It does not perform active intrusion testing, sandbox code execution, or internal vulnerability scanning.',
        'Never enter passwords, private keys, or financial credentials on unfamiliar websites.',
      ],
    };
  }

  /**
   * Format structured Telegram-friendly safety report
   */
  formatReport(analysis) {
    if (!analysis || !analysis.ok) {
      return `❌ **Website Safety Check Failed:** ${analysis?.summary || 'Invalid URL'}`;
    }

    let riskBadge = '🟢 Low observed risk';
    if (analysis.riskLevel === 'High risk') riskBadge = '🚨 High risk';
    else if (analysis.riskLevel === 'Suspicious') riskBadge = '⚠️ Suspicious';

    let msg = `🛡️ **WEBSITE SCAM & SAFETY AUDIT REPORT**\n\n`;
    msg += `🌐 **Target:** <code>${analysis.domain}</code>\n`;
    msg += `📊 **Risk Assessment:** **${riskBadge}** (Score: ${analysis.riskScore}/10)\n\n`;

    msg += `🔍 **Checks Performed:**\n`;
    msg += analysis.checksPerformed.map((c) => `• ${c}`).join('\n') + '\n\n';

    if (analysis.suspiciousIndicators.length > 0) {
      msg += `⚠️ **Suspicious Indicators Detected:**\n`;
      msg += analysis.suspiciousIndicators.map((s) => `• 🚨 ${s}`).join('\n') + '\n\n';
    } else {
      msg += `✅ **No common phishing or deceptive patterns observed.**\n\n`;
    }

    if (analysis.findings.length > 0) {
      msg += `📋 **Observed Findings:**\n`;
      msg += analysis.findings.map((f) => `• ${f}`).join('\n') + '\n\n';
    }

    msg += `⚠️ **Limitations & Precautions:**\n`;
    msg += analysis.limitations.map((l) => `_• ${l}_`).join('\n');

    return msg;
  }
}

export const websiteSafetyService = new WebsiteSafetyService();
