import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDeviceSummary, isMobileUserAgent } from './deviceLabel';

test('parses common desktop and mobile user agents into clean summaries', () => {
  assert.equal(
    formatDeviceSummary('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'),
    'Chrome · Android'
  );
  assert.equal(
    formatDeviceSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'),
    'Safari · iOS'
  );
  assert.equal(
    formatDeviceSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'),
    'Firefox · Windows'
  );
  assert.equal(formatDeviceSummary('Unknown'), 'Unknown Device');
});

test('identifies mobile user agents cleanly', () => {
  assert.equal(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)'), true);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0'), false);
});
