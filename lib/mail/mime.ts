export type ComposeMailInput = {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  threadId?: string
}

export function createRfc822Message(input: ComposeMailInput) {
  const headers = [
    ["To", input.to],
    ["Subject", input.subject],
    input.cc ? ["Cc", input.cc] : null,
    input.bcc ? ["Bcc", input.bcc] : null,
    ["MIME-Version", "1.0"],
    ["Content-Type", 'text/plain; charset="UTF-8"'],
    ["Content-Transfer-Encoding", "8bit"],
  ].filter((header): header is [string, string] => Boolean(header))

  return [
    ...headers.map(([key, value]) => `${key}: ${encodeHeaderValue(value)}`),
    "",
    input.body,
  ].join("\r\n")
}

export function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function encodeHeaderValue(value: string) {
  return value.replaceAll(/\r?\n/g, " ").trim()
}
