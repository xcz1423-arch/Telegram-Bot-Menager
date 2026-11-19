export function formatDeviceSummary(userAgent?: string | null): string {
  const ua = (userAgent || '').trim();
  if (!ua || ua === 'Unknown') return 'Unknown Device';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/curl\//i.test(ua)) browser = 'cURL Client';
  else if (/node|undici|playwright/i.test(ua)) browser = 'Automated Client';

  let os = 'Web';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} · ${os}`;
}

export function isMobileUserAgent(userAgent?: string | null): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent || '');
}
