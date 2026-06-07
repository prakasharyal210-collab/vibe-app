import { Router } from "express";

const router = Router();

router.post("/caption", async (req, res) => {
  const { imageBase64, mimeType, mediaType } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    mediaType?: "photo" | "video";
  };

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  const messages: any[] = [];

  if (imageBase64 && mimeType) {
    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType,
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: `You are a creative social media caption writer for the Gundruk app — a dark, aesthetic, Gen-Z social platform.

Generate exactly 3 distinct caption options for this ${mediaType === "video" ? "video thumbnail" : "photo"} and 10 relevant hashtags.

Rules:
- Captions should be engaging, authentic, and fit a dark/aesthetic/Gen-Z vibe
- Each caption should be 1-2 sentences max (under 100 chars each)
- Vary the tone: one witty, one aesthetic/poetic, one hype/energetic
- Hashtags should be relevant and trendy (no spaces, # prefix)

Respond ONLY in this exact JSON format, no extra text:
{
  "captions": [
    "caption one here",
    "caption two here",
    "caption three here"
  ],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"]
}`,
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `You are a creative social media caption writer for the Gundruk app — a dark, aesthetic, Gen-Z social platform.

Generate exactly 3 distinct caption options for a ${mediaType === "video" ? "video" : "photo"} post and 10 relevant hashtags.

Rules:
- Captions should be engaging, authentic, and fit a dark/aesthetic/Gen-Z vibe
- Each caption should be 1-2 sentences max (under 100 chars each)
- Vary the tone: one witty, one aesthetic/poetic, one hype/energetic
- Hashtags should be relevant and trendy (no spaces, # prefix)

Respond ONLY in this exact JSON format, no extra text:
{
  "captions": [
    "caption one here",
    "caption two here",
    "caption three here"
  ],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"]
}`,
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, body: errText }, "Anthropic API error");
      res.status(502).json({ error: "AI service error", detail: errText });
      return;
    }

    const data = await response.json() as any;
    const rawText: string = data?.content?.[0]?.text ?? "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ rawText }, "Failed to parse AI response as JSON");
      res.status(502).json({ error: "Invalid AI response format" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      captions: string[];
      hashtags: string[];
    };

    res.json({
      captions: parsed.captions ?? [],
      hashtags: parsed.hashtags ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "AI caption generation failed");
    res.status(500).json({ error: "Failed to generate captions" });
  }
});

export default router;
