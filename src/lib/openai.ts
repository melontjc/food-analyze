import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { env, optionalEnv } from "@/lib/config";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const mealAnalysisSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1),
      portion: z.string().optional().nullable(),
      kcal: z.number().int().nonnegative(),
      confidence: z.number().min(0).max(1).optional().nullable()
    })
  ),
  total_kcal: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  uncertainty: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

export async function analyzeMealImage(imageDataUrl: string, userDescription?: string | null): Promise<MealAnalysis> {
  const description = userDescription?.trim();
  const payload = {
    model: optionalEnv("OPENAI_MODEL") || "gpt-4.1-mini",
    max_output_tokens: 900,
    instructions:
      "你是谨慎的餐食热量估算助手。结合图片和用户补充说明估算热量；用户说明包含重量、烹饪手法、店铺、规格时优先使用。不要假装精确，不确定时降低 confidence 并在 uncertainty 中说明。返回严格 JSON，不要 Markdown。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请识别这张餐食图片，拆分食物项并估算热量。",
              description ? `用户补充说明：${description}` : "用户没有补充重量、做法或店铺信息。",
              "如果补充说明里有克数、份量、烹饪手法，按这些信息修正热量。",
              "如果补充说明里有耳熟能详的连锁店和具体菜品/规格，可以结合常见标准化配方估算，但要在 notes 或 uncertainty 中说明这是标准化估算，门店、地区、加料、酱料会造成偏差。",
              "JSON schema: {\"items\":[{\"name\":\"string\",\"portion\":\"string\",\"kcal\":number,\"confidence\":0-1}],\"total_kcal\":number,\"confidence\":0-1,\"uncertainty\":\"string\",\"notes\":\"string\"}。"
            ].join("\n")
          },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }
    ]
  };

  const data = await postOpenAi(payload);
  const text = extractResponseText(data);
  const json = parseJson(text);
  return mealAnalysisSchema.parse(json);
}

export async function analyzeMealText(userDescription: string): Promise<MealAnalysis> {
  const description = userDescription.trim();
  const payload = {
    model: optionalEnv("OPENAI_MODEL") || "gpt-4.1-mini",
    max_output_tokens: 900,
    instructions:
      "你是谨慎的餐食热量估算助手。只根据用户的文字描述估算热量；描述包含重量、烹饪手法、店铺、规格时优先使用。不要假装精确，不确定时降低 confidence 并在 uncertainty 中说明。返回严格 JSON，不要 Markdown。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请根据下面的餐食文字描述，拆分食物项并估算热量。",
              `用户描述：${description}`,
              "如果描述里有克数、份量、烹饪手法，按这些信息估算热量。",
              "如果描述里有耳熟能详的连锁店和具体菜品/规格，可以结合常见标准化配方估算，但要在 notes 或 uncertainty 中说明这是标准化估算，门店、地区、加料、酱料会造成偏差。",
              "如果缺少重量或关键做法，基于常见份量给出保守估算，并明确说明不确定项。",
              "JSON schema: {\"items\":[{\"name\":\"string\",\"portion\":\"string\",\"kcal\":number,\"confidence\":0-1}],\"total_kcal\":number,\"confidence\":0-1,\"uncertainty\":\"string\",\"notes\":\"string\"}。"
            ].join("\n")
          }
        ]
      }
    ]
  };

  const data = await postOpenAi(payload);
  const text = extractResponseText(data);
  const json = parseJson(text);
  return mealAnalysisSchema.parse(json);
}

async function postOpenAi(payload: unknown) {
  const body = JSON.stringify(payload);
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI ${response.status}: ${text.slice(0, 280)}`);
    }
    return response.json();
  } catch (error) {
    if (process.platform !== "win32" || optionalEnv("OPENAI_DISABLE_POWERSHELL_FALLBACK") === "1") {
      throw betterNetworkError(error);
    }
    return postOpenAiWithPowerShell(body);
  }
}

async function postOpenAiWithPowerShell(body: string) {
  const payloadPath = path.join(os.tmpdir(), `food-deficit-openai-${randomUUID()}.json`);
  await fs.writeFile(payloadPath, body, "utf8");

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$OutputEncoding = [System.Text.Encoding]::UTF8",
    "$payload = Get-Content -LiteralPath $env:OPENAI_PAYLOAD_PATH -Raw -Encoding UTF8",
    "$headers = @{ Authorization = \"Bearer $env:OPENAI_API_KEY\" }",
    "$response = Invoke-RestMethod -Uri $env:OPENAI_RESPONSES_URL -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 120",
    "$response | ConvertTo-Json -Depth 100 -Compress"
  ].join("; ");

  try {
    const stdout = await runPowerShell(script, {
      env: {
        ...process.env,
        OPENAI_API_KEY: env("OPENAI_API_KEY"),
        OPENAI_RESPONSES_URL,
        OPENAI_PAYLOAD_PATH: payloadPath
      }
    });
    return JSON.parse(stdout);
  } catch (error) {
    throw betterNetworkError(error);
  } finally {
    await fs.unlink(payloadPath).catch(() => undefined);
  }
}

function runPowerShell(script: string, options: { env: NodeJS.ProcessEnv }) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
      env: options.env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `PowerShell exited with ${code}`));
    });
    child.stdin.end();
  });
}

export function normalizeMealText(value: string | null | undefined) {
  if (!value) return value || null;
  if (!/[�锟]/.test(value)) return value;
  return "模型返回的中文编码异常，请按图片手动确认。";
}

function betterNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : "OpenAI 请求失败";
  const cause = error instanceof Error && "cause" in error ? String(error.cause) : "";
  if (/fetch failed|ConnectTimeout|timeout|socket/i.test(`${message} ${cause}`)) {
    return new Error("OpenAI 连接超时。请确认本机代理/VPN 可让 Node 或 PowerShell 访问 api.openai.com。");
  }
  return error instanceof Error ? error : new Error(message);
}

function extractResponseText(data: unknown): string {
  const maybe = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };
  if (maybe.output_text) return maybe.output_text;
  return (
    maybe.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text || "")
      .join("\n")
      .trim() || ""
  );
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型没有返回可解析的 JSON");
    return JSON.parse(match[0]);
  }
}
