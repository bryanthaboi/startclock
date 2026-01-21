type SlackApiOk<T> = T & { ok: true };
type SlackApiError = { ok: false; error?: string };

function requireSlackBotToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing SLACK_BOT_TOKEN (required for Slack modals).");
  }
  return token;
}

export async function slackApi<TResponse extends Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>
): Promise<SlackApiOk<TResponse>> {
  const token = requireSlackBotToken();

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  });

  const json = (await res.json().catch(() => null)) as (SlackApiOk<TResponse> | SlackApiError | null);
  if (!res.ok) {
    throw new Error(`Slack API HTTP ${res.status} calling ${method}.`);
  }
  if (!json || (json as SlackApiError).ok === false) {
    const err = (json as SlackApiError | null)?.error ?? "unknown_error";
    throw new Error(`Slack API error calling ${method}: ${err}`);
  }
  return json as SlackApiOk<TResponse>;
}

