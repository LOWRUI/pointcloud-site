const DIRECTORY_API = "https://api.crabnebula.app/directory/rspc";
const AUTH_API = "https://auth.crabnebula.cloud/rspc";
const REQUEST_TIMEOUT = 15_000;
const MAX_ATTEMPTS = 3;

function safeMessage(message, secrets) {
  let text = String(message ?? "请求失败");
  for (const secret of secrets) text = text.replaceAll(secret, "[已隐藏]");
  return text.slice(0, 160);
}

async function send(url, init, method) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    let text;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
      text = await response.text();
    } catch {
      if (attempt === MAX_ATTEMPTS) throw new Error(`${method}: 网络请求失败或超时，已尝试 ${attempt} 次`);
      response = undefined;
    }
    const temporary = !response || response.status === 429 || response.status >= 500;
    if (!temporary || attempt === MAX_ATTEMPTS) return { response, text };
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
  }
}

function responseData({ response, text }, method, secrets) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${method}: 响应不是 JSON（HTTP ${response.status}）`);
  }
  if (body?.result?.type === "error") {
    const { code, message } = body.result.data ?? {};
    throw new Error(`${method}: ${code ?? response.status} ${safeMessage(message, secrets)}`);
  }
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  if (body?.result?.type !== "response" || body.result.data === undefined) {
    throw new Error(`${method}: 响应格式不符合预期`);
  }
  return body.result.data;
}

/** 先用组织 API key 换取访问令牌，再以该令牌读取 Cloud 发布数据。 */
export async function createCloudClient({ apiKey, directoryApi = DIRECTORY_API, authApi = AUTH_API }) {
  const secrets = [apiKey];
  const authMethod = "apiKeys.authenticate";
  const auth = responseData(await send(`${authApi}/${authMethod}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(apiKey),
  }, authMethod), authMethod, secrets);
  const token = auth?.accessToken;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error(`${authMethod}: 认证响应缺少访问令牌`);
  }
  secrets.push(token);

  return {
    async query(method, input) {
      const url = new URL(`${directoryApi}/${method}`);
      url.searchParams.set("input", JSON.stringify(input));
      const result = await send(url, {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
      }, method);
      return responseData(result, method, secrets);
    },
  };
}
