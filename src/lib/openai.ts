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
      grams: z.number().positive().optional().nullable(),
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
type NutritionSourceHint = { name: string; kcalPer100g: number };

const nutritionLabelSchema = z.object({
  name: z.string().min(1),
  kcal_per_100g: z.number().positive(),
  protein_per_100g: z.number().nonnegative().optional().nullable(),
  fat_per_100g: z.number().nonnegative().optional().nullable(),
  carbs_per_100g: z.number().nonnegative().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().optional().nullable()
});

const presetRecalculationSchema = z.object({
  items: z.array(
    z.object({
      preset_item_id: z.string().min(1),
      name: z.string().min(1),
      grams: z.number().positive(),
      kcal: z.number().int().nonnegative(),
      confidence: z.number().min(0).max(1).optional().nullable()
    })
  ),
  total_kcal: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  uncertainty: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const dashboardInsightSchema = z.object({
  summaryTitle: z.string().min(1),
  insights: z.array(z.string().min(1)).min(1).max(4),
  suggestions: z.array(z.string().min(1)).min(1).max(3),
  cautions: z.array(z.string().min(1)).max(3).default([])
});

export type NutritionLabelAnalysis = z.infer<typeof nutritionLabelSchema>;
export type PresetRecalculation = z.infer<typeof presetRecalculationSchema>;
export type DashboardInsight = z.infer<typeof dashboardInsightSchema>;
export type DashboardInsightInput = {
  dateKey: string;
  fingerprint: string;
  primarySignal: unknown;
  slotCorrelations: unknown[];
  metrics: Record<string, unknown>;
  recentDays: unknown[];
};

export async function analyzeMealImage(
  imageDataUrl: string,
  userDescription?: string | null,
  nutritionSources: NutritionSourceHint[] = []
): Promise<MealAnalysis> {
  const description = userDescription?.trim();
  const nutritionLibrary = nutritionLibraryPrompt(nutritionSources);
  const payload = {
    model: optionalEnv("OPENAI_MODEL") || "gpt-4.1-mini",
    max_output_tokens: 900,
    instructions:
      "你是谨慎的餐食热量估算助手。结合图片和用户补充说明识别每一种食物，估算实际可食用重量和热量；用户说明包含重量、烹饪手法、店铺、规格时优先使用。不要假装精确，不确定时降低 confidence 并在 uncertainty 中说明。返回严格 JSON，不要 Markdown。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请识别这张餐食图片，拆分食物项并估算热量。",
              description ? `用户补充说明：${description}` : "用户没有补充重量、做法或店铺信息。",
              "每个食物项都要识别具体种类，并输出 grams 表示估测的实际可食用克数。用户写了克数时优先使用用户克数；只能根据图片目测时给出合理估测并降低置信度。",
              nutritionLibrary,
              "如果补充说明里有耳熟能详的连锁店和具体菜品/规格，可以结合常见标准化配方估算，但要在 notes 或 uncertainty 中说明这是标准化估算，门店、地区、加料、酱料会造成偏差。",
              "JSON schema: {\"items\":[{\"name\":\"string\",\"portion\":\"string\",\"grams\":number,\"kcal\":number,\"confidence\":0-1}],\"total_kcal\":number,\"confidence\":0-1,\"uncertainty\":\"string\",\"notes\":\"string\"}。"
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

export async function analyzeMealText(userDescription: string, nutritionSources: NutritionSourceHint[] = []): Promise<MealAnalysis> {
  const description = userDescription.trim();
  const nutritionLibrary = nutritionLibraryPrompt(nutritionSources);
  const payload = {
    model: optionalEnv("OPENAI_MODEL") || "gpt-4.1-mini",
    max_output_tokens: 900,
    instructions:
      "你是谨慎的餐食热量估算助手。只根据用户的文字描述识别每一种食物，估算实际可食用重量和热量；描述包含重量、烹饪手法、店铺、规格时优先使用。不要假装精确，不确定时降低 confidence 并在 uncertainty 中说明。返回严格 JSON，不要 Markdown。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请根据下面的餐食文字描述，拆分食物项并估算热量。",
              `用户描述：${description}`,
              "每个食物项都要识别具体种类，并输出 grams 表示估测的实际可食用克数。用户写了克数时优先使用用户克数；缺少克数时按常见份量估测并降低置信度。",
              nutritionLibrary,
              "如果描述里有耳熟能详的连锁店和具体菜品/规格，可以结合常见标准化配方估算，但要在 notes 或 uncertainty 中说明这是标准化估算，门店、地区、加料、酱料会造成偏差。",
              "如果缺少重量或关键做法，基于常见份量给出保守估算，并明确说明不确定项。",
              "JSON schema: {\"items\":[{\"name\":\"string\",\"portion\":\"string\",\"grams\":number,\"kcal\":number,\"confidence\":0-1}],\"total_kcal\":number,\"confidence\":0-1,\"uncertainty\":\"string\",\"notes\":\"string\"}。"
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

function nutritionLibraryPrompt(nutritionSources: NutritionSourceHint[]) {
  if (!nutritionSources.length) return "个人营养库暂无可匹配食品。";
  return [
    "下面是用户个人营养库中的食品候选。只有图片或文字明确对应时，才将 name 原样返回为营养库名称；无法明确判断品牌或食品时，不要强行匹配。",
    JSON.stringify(nutritionSources)
  ].join("\n");
}

export async function analyzeNutritionLabel(imageDataUrl: string, suggestedName?: string | null): Promise<NutritionLabelAnalysis> {
  const payload = {
    model: optionalEnv("OPENAI_MODEL") || "gpt-4.1-mini",
    max_output_tokens: 700,
    instructions:
      "你是食品营养标签录入助手。读取图片中的营养成分表，统一换算成每100克数据。能量如果以kJ标示，使用 1 kcal = 4.184 kJ 换算。不要猜测无法读取的值；无法可靠得到每100克热量时直接说明。返回严格 JSON，不要 Markdown。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请读取这张食品营养成分表图片，统一输出每100克营养数据。",
              suggestedName?.trim() ? `食品名称提示：${suggestedName.trim()}` : "食品名称未知，请根据包装识别。",
              "如果标签按每份显示且图片中有每份克数，请换算为每100克。",
              "JSON schema: {\"name\":\"string\",\"kcal_per_100g\":number,\"protein_per_100g\":number|null,\"fat_per_100g\":number|null,\"carbs_per_100g\":number|null,\"confidence\":0-1,\"notes\":\"string\"}。"
            ].join("\n")
          },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }
    ]
  };

  const data = await postOpenAi(payload);
  return nutritionLabelSchema.parse(parseJson(extractResponseText(data)));
}

export async function recalculatePresetItems(
  items: Array<{
    presetItemId: string;
    name: string;
    grams: number;
    portion?: string | null;
    kcalPer100g?: number | null;
    cookingNotes?: string | null;
  }>
): Promise<PresetRecalculation> {
  const payload = {
    model: optionalEnv("OPENAI_MODEL") || "gpt-4.1-mini",
    max_output_tokens: 900,
    instructions:
      "你是谨慎的餐食热量复核助手。按照用户提供的每种食物克数重新估算热量。有每100克热量时优先精确换算；没有营养表时根据常见食材和烹饪方式保守估算。必须保留输入的 preset_item_id 和 grams，不要增加或删除食物。返回严格 JSON，不要 Markdown。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请按以下食物清单重新计算热量：",
              JSON.stringify(items),
              "JSON schema: {\"items\":[{\"preset_item_id\":\"string\",\"name\":\"string\",\"grams\":number,\"kcal\":number,\"confidence\":0-1}],\"total_kcal\":number,\"confidence\":0-1,\"uncertainty\":\"string\",\"notes\":\"string\"}。"
            ].join("\n")
          }
        ]
      }
    ]
  };

  const data = await postOpenAi(payload);
  return presetRecalculationSchema.parse(parseJson(extractResponseText(data)));
}

export async function analyzeDashboardInsight(input: DashboardInsightInput): Promise<DashboardInsight> {
  const payload = {
    model: optionalEnv("OPENAI_MODEL") || "gpt-4.1-mini",
    max_output_tokens: 850,
    instructions:
      "你是谨慎的健康数据解读助手。你只解释用户传入的算法指标，不重新计算相关系数，不编造不存在的数据，不做医疗诊断。短期体重波动可能来自水分、盐分、糖原、睡眠或同步误差，不能等同于脂肪变化。请用温和、具体、可执行的中文建议。返回严格 JSON，不要 Markdown。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请根据下面的算法结果生成分析页洞察。",
              "规则：",
              "1. 必须基于 primarySignal 和 slotCorrelations，不要自行发明新的相关性。",
              "2. 如果 primarySignal 表示弱相关或样本不足，要明确说明继续记录，不要给过度确定的建议。",
              "3. suggestions 要优先给 1-3 条饮食记录或调整建议。",
              "4. cautions 用于提醒相关性不代表因果、体重短期波动不等于脂肪变化等。",
              "JSON schema: {\"summaryTitle\":\"string\",\"insights\":[\"string\"],\"suggestions\":[\"string\"],\"cautions\":[\"string\"]}。",
              JSON.stringify(input)
            ].join("\n")
          }
        ]
      }
    ]
  };

  const data = await postOpenAi(payload);
  return dashboardInsightSchema.parse(parseJson(extractResponseText(data)));
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
