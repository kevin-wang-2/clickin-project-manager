import { getAppAccessToken } from "./feishu-auth";

const BASE = "https://open.feishu.cn/open-apis";

export async function sendBotDm(openId: string, text: string): Promise<void> {
  const token = await getAppAccessToken();
  const res = await fetch(`${BASE}/im/v1/messages?receive_id_type=open_id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receive_id: openId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });
  const raw = await res.text();
  let data: { code: number; msg: string };
  try { data = JSON.parse(raw); } catch { throw new Error(`飞书机器人返回非 JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`); }
  if (data.code !== 0) {
    console.error(`[feishu-bot] DM to ${openId} failed: code=${data.code} msg=${data.msg}`);
    throw new Error(`飞书机器人推送失败 (${data.code}): ${data.msg}`);
  }
}
