import assert from "node:assert/strict";
import test from "node:test";
import { createCloudClient } from "../scripts/crabnebula-client.mjs";

test("认证响应缺少访问令牌时停止请求目录", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({
    result: { type: "response", data: {} },
  }));
  await assert.rejects(createCloudClient({ apiKey: "fixture-api-key" }), /认证响应缺少访问令牌/);
  assert.equal(mock.mock.callCount(), 1);
});

test("服务端错误消息中的 API key 与访问令牌都被隐藏", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("apiKeys.authenticate")) {
      return Response.json({ result: { type: "response", data: { accessToken: "fixture-access-token" } } });
    }
    return Response.json({ result: { type: "error", data: {
      code: 401, message: "fixture-api-key fixture-access-token 无效",
    } } });
  });
  const cloud = await createCloudClient({ apiKey: "fixture-api-key" });
  await assert.rejects(cloud.query("distribution.release.list", {}), (err) => {
    assert.match(err.message, /401/);
    assert.doesNotMatch(err.message, /fixture-api-key|fixture-access-token/);
    return true;
  });
});

test("暂时性网络错误最多尝试三次并给出不含密钥的错误", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    throw new Error("fixture-api-key 不应出现在日志中");
  });
  await assert.rejects(createCloudClient({ apiKey: "fixture-api-key" }), (err) => {
    assert.match(err.message, /已尝试 3 次/);
    assert.doesNotMatch(err.message, /fixture-api-key/);
    return true;
  });
  assert.equal(mock.mock.callCount(), 3);
});
