import { NextRequest, NextResponse } from "next/server";

// ============================================================
// AI 模型配置（硬编码，不放入 .env.local）
// ============================================================

const AI_BASE_URL = "https://api.aihubmix.com/v1";

/** OCR 使用非思考模型：速度快、token 利用率高、不易截断 */
const OCR_MODEL = "gemini-2.0-flash";

/** 评语生成使用思考模型：输出更有深度和针对性 */
const COMMENT_MODEL = "gemini-2.5-pro";

/**
 * 统一 AI 请求接口
 * 支持两种请求类型：
 *   - type: "ocr"     → 图片 OCR 识别（多模态，使用快速模型）
 *   - type: "comment" → AI 生成评语（纯文本，使用思考模型）
 *
 * 策略说明：
 *   OCR 本质是"看图抄写"，不需要复杂推理，非思考模型响应更快且 token 全用于输出。
 *   评语生成需要理解习作内容并写出有深度的评价，思考模型更合适。
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
    let model: string;
    let maxTokens: number;
    let temperature: number;

    if (type === "ocr") {
      // ---- 多模态请求：图片 OCR（快速模型，支持多图） ----
      // 兼容两种格式：单图 imageBase64（string）或多图 imageBase64List（string[]）
      const { imageBase64, imageBase64List } = body as {
        type: string;
        imageBase64?: string;
        imageBase64List?: string[];
      };

      // 统一转为数组
      const images: string[] = imageBase64List && imageBase64List.length > 0
        ? imageBase64List
        : (imageBase64 ? [imageBase64] : []);

      console.log(`[OCR] 收到 ${images.length} 张图片，imageBase64List=${!!imageBase64List}, imageBase64=${!!imageBase64}`);

      if (images.length === 0) {
        return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
      }
      if (images.length > 5) {
        return NextResponse.json({ error: "最多支持 5 张图片" }, { status: 400 });
      }

      // 根据图片数量选择不同提示词
      const promptText = images.length === 1
        ? "请完整识别并提取这张图片中的所有手写文字，从头到尾不要遗漏任何内容。忽略涂抹修改的部分。直接输出识别到的纯文本内容，不要有任何多余的解释、总结或省略。必须输出完整全文。"
        : `以下是一份手写稿的 ${images.length} 张照片（按页码顺序排列）。请完整识别并提取所有页面中的手写文字，按顺序拼接输出。忽略涂抹修改的部分。直接输出识别到的纯文本内容，不要有任何多余的解释、总结或省略。必须输出完整全文。`;

      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            // 按顺序插入所有图片
            ...images.map((img) => ({
              type: "image_url",
              image_url: { url: img },
            })),
          ],
        },
      ];
      model = OCR_MODEL;
      // 多图时适当增大 token 上限
      maxTokens = images.length > 1 ? 8192 : 4096;
      temperature = 0;

    } else if (type === "comment") {
      // ---- 纯文本请求：生成评语（思考模型） ----
      const { content, studentInfo, bookTitle, mainTitle } = body as {
        type: string;
        content: string;
        studentInfo: string;
        bookTitle?: string;
        mainTitle?: string;
      };
      if (!content) {
        return NextResponse.json({ error: "缺少习作正文" }, { status: 400 });
      }

      // 根据是否有课程书目，构建不同的背景信息
      const hasBook = bookTitle && bookTitle.trim();
      const contextInfo = hasBook
        ? `课程书目：${bookTitle}\n习作标题：${mainTitle || "未提供"}`
        : `习作类型：看图写话\n习作标题：${mainTitle || "未提供"}`;

      messages = [
        {
          role: "user",
          content: `你是一位有十几年经验的资深儿童阅读指导老师。请根据以下学生的习作内容，写一段50-80字的老师评语。语气要鼓励、专业、有针对性。只输出评语正文，不要输出其他废话。\n年级/学员信息：${studentInfo || "未提供"}\n${contextInfo}\n习作内容：${content}`,
        },
      ];
      model = COMMENT_MODEL;
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
        model,
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
