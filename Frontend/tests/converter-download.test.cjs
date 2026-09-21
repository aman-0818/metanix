const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/api.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function service(origin, fetch) {
  const context = { exports: {}, window: { location: { origin } }, fetch, Error, TypeError };
  vm.runInNewContext(compiled, context);
  context.exports.apiService.setToken('test-access');
  return context.exports.apiService;
}

test('converter download uses the working API origin and bearer authentication', async () => {
  for (const [origin, expected] of [
    ['http://localhost:5173', 'http://localhost:8000/api'],
    ['https://workspace.example', 'https://workspace.example/api'],
  ]) {
    const api = service(origin, async (url, options) => {
      assert.equal(url, `${expected}/admin/converter/5/download/`);
      assert.equal(options.headers.Authorization, 'Bearer test-access');
      return new Response('%PDF-1.7 test', { headers: { 'Content-Type': 'application/pdf' } });
    });
    assert.match(await (await api.downloadConversion(5)).text(), /^%PDF/);
  }
});

test('an expired access token is refreshed before retrying the file request', async () => {
  const requests = [];
  const api = service('http://localhost:5173', async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) return new Response('', { status: 401 });
    if (requests.length === 2) {
      assert.equal(url, 'http://localhost:8000/api/token/refresh/');
      return Response.json({ access: 'new-access' });
    }
    assert.equal(options.headers.Authorization, 'Bearer new-access');
    return new Response('%PDF-1.7 test');
  });
  api.setRefreshToken('test-refresh');
  await api.downloadConversion(5);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, requests[2].url);
});

test('missing files and expired sessions return actionable errors', async () => {
  for (const [status, message] of [[404, /unavailable/], [401, /session has expired/],
                                  [403, /permission/], [500, /500/]]) {
    const api = service('http://localhost:5173', async () => new Response('', { status }));
    await assert.rejects(api.downloadConversion(5), message);
  }
});

test('a proxy webpage is rejected but an intentional HTML conversion downloads', async () => {
  let attachment = false;
  const api = service('https://workspace.example', async () => new Response('<html>test</html>', {
    headers: { 'Content-Type': 'text/html', ...(attachment ? { 'Content-Disposition': 'attachment; filename=report.html' } : {}) },
  }));
  await assert.rejects(api.downloadConversion(5), /webpage instead of a file/);
  attachment = true;
  assert.match(await (await api.downloadConversion(5)).text(), /test/);
});
