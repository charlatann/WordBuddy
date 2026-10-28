// 测试用：模拟 GitHub Gist API
/** 模拟的 GitHub Gist 服务（测试用）：记录所有 Gist，校验令牌 */
export function fakeGitHub(validToken = 'ghp_test') {
  const gists = {};
  let n = 0;
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fake = async (url, opt = {}) => {
    const u = new URL(url);
    if ((opt.headers?.Authorization || '') !== `Bearer ${validToken}`) return reply(401, { message: 'Bad credentials' });
    const body = opt.body ? JSON.parse(opt.body) : null;
    const m = u.pathname.match(/^\/gists(?:\/([^/]+))?$/);
    if (!m) return reply(404, {});
    const id = m[1];
    const view = g => ({ id: g.id, description: g.description, files: Object.fromEntries(Object.entries(g.files).map(([k, v]) => [k, { filename: k, content: v.content, truncated: false }])) });
    if (!id && (opt.method || 'GET') === 'GET') return reply(200, Object.values(gists).map(view));
    if (!id && opt.method === 'POST') { const g = { id: 'g' + (++n), description: body.description, files: body.files }; gists[g.id] = g; return reply(201, view(g)); }
    if (!gists[id]) return reply(404, {});
    if (opt.method === 'PATCH') { Object.assign(gists[id].files, body.files); return reply(200, view(gists[id])); }
    return reply(200, view(gists[id]));
  };
  fake.gists = gists;
  return fake;
}
