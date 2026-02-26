import { NextRequest, NextResponse } from "next/server";

// 硬编码 AI 模型配置（不放入 .env.local）
const AI_BASE_URL = "https://api.aihubmix.com/v1";
const AI_MODEL = "gemini-2.5-pro";

/**
 * 统一 AI 请求接口
 * 支持两种请求类型：
 *   - type: "ocr"     → 图片 OCR 识别（多模态：图片 + 文本）
 *   - type: "comment" → AI 生成评语（纯文本）
 *
 * 注意：gemini-2.5-pro 为思考模型，思考 token 也计入 max_tokens，
 * OCR 任务需要更大的 token 上限，避免输出中途截断。
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.AIHUBMIX_API_KEY;
    if (!apiKey || apiKey === "your_api_key_here") {
      return NextResponse.json(
        { error: "未配置 AIHUBMIX_API_KEY，请在 .env.local 中设置" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { type } = body;

    let messages: Array<Record<string, unknown>>;
    let maxTokens: number;
    let temperature: number;

    if (type === "ocr") {
      // 多模态请求：图片 OCR
      const { imageBase64 } = body as { type: string; imageBase64: string };
      if (!imageBase64) {
        return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
      }

      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请识别并提取这张图片中的手写文字，忽略涂抹修改的部分。只输出识别到的纯文本内容，不要有任何多余的解释。",
            },
            {
              type: "image_url",
              image_url: { url: imageBase64 },
            },
          ],
        },
      ];
      // OCR 为思考模型，需要更大的 token 空间；temperature=0 提高识别准确率
      maxTokens = 8192;
      temperature = 0;

    } else if (type === "comment") {
      // 纯文本请求：生成评语
      const { content, studentInfo } = body as {
        type: string;
        content: string;
        studentInfo: string;
      };
      if (!content) {
        return NextResponse.json({ error: "缺少习作正文" }, { status: 400 });
      }

      messages = [
        {
          role: "user",
          content: `你是一位有十几年经验的资深儿童阅读指导老师。请根据以下学生的习作内容，写一段50-80字的老师评语。语气要鼓励、专业、有针对性。只输出评语正文，不要输出其他废话。\n年级/学员信息：${studentInfo || "未提供"}\n习作内容：${content}`,
        },
      ];
      maxTokens = 2048;
      temperature = 0.7;

    } else {
      return NextResponse.json(
        { error: "无效的请求类型，支持 ocr / comment" },
        { status: 400 }
      );
    }

    // 调用 OpenAI 兼容格式的 API
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API 响应错误:", response.status, errorText);
      return NextResponse.json(
        { error: `AI 服务请求失败 (${response.status})` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const resultText = choice?.message?.content?.trim() || "";
    const finishReason = choice?.finish_reason;

    // 如果因 token 超限被截断，返回已有内容并附带警告
    if (finishReason === "length") {
      return NextResponse.json({
        result: resultText,
        warning: "内容较长，识别结果可能不完整，请检查并手动补全。",
      });
    }

    return NextResponse.json({ result: resultText });

  } catch (error) {
    console.error("AI 接口异常:", error);
    return NextResponse.json(
      { error: "服务器内部错误，请稍后重试" },
      { status: 500 }
    );
  }
}
