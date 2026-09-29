console.log("Node version:", process.version);
require("dotenv").config();

const express = require("express");
const { PDFParse } = require("pdf-parse");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 3000;

// Stores YouTube transcript + summary temporarily.
// NOTE: This is cleared whenever the server restarts.
const youtubeCache = new Map();

// ============================================================
// AI PROVIDERS
// ============================================================

async function askGemini(prompt, maxOutputTokens = 8192, jsonMode = false) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.3,
          ...(jsonMode
            ? {
              responseMimeType: "application/json",
            }
            : {}),
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `Gemini HTTP ${response.status}`
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text.trim();
}


// ============================================================
// GROQ
// ============================================================

async function askGroq(prompt, jsonMode = false) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.3,

        ...(jsonMode
          ? {
            response_format: {
              type: "json_object",
            },
          }
          : {}),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `Groq HTTP ${response.status}`
    );
  }

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Groq returned an empty response");
  }

  return text.trim();
}


// ============================================================
// LLM7
// ============================================================

async function askLLM7(prompt, jsonMode = false) {
  const apiKey = process.env.LLM7_API_KEY;

  if (!apiKey) {
    throw new Error("LLM7_API_KEY is missing");
  }

  const response = await fetch(
    "https://api.llm7.io/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "default",

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.3,

        ...(jsonMode
          ? {
            response_format: {
              type: "json_object",
            },
          }
          : {}),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `LLM7 HTTP ${response.status}`
    );
  }

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("LLM7 returned an empty response");
  }

  return text.trim();
}


// ============================================================
// NVIDIA
// ============================================================

async function askNVIDIA(prompt, jsonMode = false) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is missing");
  }

  const response = await fetch(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "meta/muse-glimmer-30b",

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.3,

        ...(jsonMode
          ? {
            response_format: {
              type: "json_object",
            },
          }
          : {}),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `NVIDIA HTTP ${response.status}`
    );
  }

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("NVIDIA returned an empty response");
  }

  return text.trim();
}


// ============================================================
// OPENROUTER
// ============================================================

async function askOpenRouter(prompt, jsonMode = false) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "StudentAI",
      },
      body: JSON.stringify({
        model: "openrouter/free",

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.3,

        ...(jsonMode
          ? {
            response_format: {
              type: "json_object",
            },
          }
          : {}),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `OpenRouter HTTP ${response.status}`
    );
  }

  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("OpenRouter returned an empty response");
  }

  return text.trim();
}


// ============================================================
// UNIVERSAL AI FALLBACK
// ============================================================

async function askAI(prompt, options = {}) {
  const {
    maxOutputTokens = 8192,
    jsonMode = false,
  } = options;

  const providers = [
    {
      name: "Gemini",
      fn: () => askGemini(prompt, maxOutputTokens, jsonMode),
    },

    {
      name: "Groq",
      fn: () => askGroq(prompt, jsonMode),
    },

    {
      name: "LLM7",
      fn: () => askLLM7(prompt, jsonMode),
    },

    {
      name: "NVIDIA",
      fn: () => askNVIDIA(prompt, jsonMode),
    },

    {
      name: "OpenRouter",
      fn: () => askOpenRouter(prompt, jsonMode),
    },
  ];

  const errors = [];

  for (const provider of providers) {
    try {
      console.log(`🤖 Trying ${provider.name}...`);

      const answer = await provider.fn();

      console.log(`✅ ${provider.name} succeeded`);

      return {
        answer,
        provider: provider.name,
      };
    } catch (error) {
      console.log(`❌ ${provider.name} failed:`, error.message);

      errors.push({
        provider: provider.name,
        error: error.message,
      });
    }
  }

  throw new Error(
    `All AI providers failed:\n${JSON.stringify(errors, null, 2)}`
  );
}


// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "StudentAI backend is running",
  });
});


// ============================================================
// YOUTUBE VIDEO ID
// ============================================================

function extractVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "").split("?")[0];
    }

    if (
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname.includes("www.youtube-nocookie.com")
    ) {
      const id = parsed.searchParams.get("v");

      if (id) {
        return id;
      }

      const parts = parsed.pathname.split("/");

      const embedIndex = parts.indexOf("embed");

      if (embedIndex !== -1 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }

      const shortsIndex = parts.indexOf("shorts");

      if (shortsIndex !== -1 && parts[shortsIndex + 1]) {
        return parts[shortsIndex + 1];
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================
// YOUTUBE TRANSCRIPT
// ============================================================

function removeInternalOverlap(text) {
  const words = text.trim().split(/\s+/);

  if (words.length < 4) return text.trim();

  // Find the smallest repeating/overlapping pattern.
  // Example:
  // "hello everyone I welcome you all to this
  //  hello everyone I welcome you all to this
  //  wonderful course..."
  //
  // becomes:
  // "hello everyone I welcome you all to this wonderful course..."

  for (let size = Math.floor(words.length / 2); size >= 4; size--) {
    let found = false;

    for (let start = 0; start + size * 2 <= words.length; start++) {
      const first = words
        .slice(start, start + size)
        .join(" ")
        .toLowerCase();

      const second = words
        .slice(start + size, start + size * 2)
        .join(" ")
        .toLowerCase();

      if (first === second) {
        words.splice(start + size, size);
        found = true;
        break;
      }
    }

    if (found) {
      return removeInternalOverlap(words.join(" "));
    }
  }

  return words.join(" ");
}


function mergeTranscriptSegments(segments) {
  if (!segments.length) return "";

  // First clean duplication INSIDE every timestamp.
  const cleanedSegments = segments
    .map(segment => removeInternalOverlap(segment))
    .filter(Boolean);

  let result = cleanedSegments[0];

  // Then remove overlap BETWEEN timestamps.
  for (let i = 1; i < cleanedSegments.length; i++) {
    const current = cleanedSegments[i];

    const previousWords = result.split(/\s+/);
    const currentWords = current.split(/\s+/);

    let overlap = 0;

    const maxOverlap = Math.min(
      previousWords.length,
      currentWords.length,
      100
    );

    for (let size = maxOverlap; size >= 3; size--) {
      const previousTail = previousWords
        .slice(-size)
        .join(" ")
        .toLowerCase();

      const currentHead = currentWords
        .slice(0, size)
        .join(" ")
        .toLowerCase();

      if (previousTail === currentHead) {
        overlap = size;
        break;
      }
    }

    if (overlap > 0) {
      result += " " + currentWords.slice(overlap).join(" ");
    } else {
      result += " " + current;
    }
  }

  return result
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchYouTubeTranscript(videoId) {
  const response = await fetch(
    `https://youtube-transcript.ai/transcript/${videoId}.txt`
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `YouTube Transcript API HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  }

  if (!text || !text.trim()) {
    throw new Error(
      "YouTube Transcript API returned an empty transcript"
    );
  }

  const transcriptMarker = "## Transcript";

  const markerIndex = text.indexOf(transcriptMarker);

  if (markerIndex === -1) {
    throw new Error(
      "Transcript section was not found in API response"
    );
  }

  const transcriptSection = text.slice(
    markerIndex + transcriptMarker.length
  );

  // Extract each timestamped transcript block.
  const matches = [
    ...transcriptSection.matchAll(
      /^\[(\d+:\d{2}(?::\d{2})?)\]\s*(.+)$/gm
    )
  ];

  if (!matches.length) {
    throw new Error(
      "No timestamped transcript segments found"
    );
  }

  const segments = matches.map(match => match[2].trim());

  const transcriptText = mergeTranscriptSegments(segments);

  if (!transcriptText) {
    throw new Error("Transcript content is empty");
  }

  console.log(
    `📝 Transcript segments: ${segments.length}`
  );

  console.log(
    `📝 Clean transcript length: ${transcriptText.length}`
  );

  return transcriptText;
}


// ============================================================
// YOUTUBE SUMMARY
// ============================================================

app.post("/youtube-summary", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "YouTube URL is required",
      });
    }

    const videoId = extractVideoId(url);

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "Invalid YouTube URL",
      });
    }

    console.log(`🎥 Processing YouTube video: ${videoId}`);

    // --------------------------------------------------------
    // FETCH TRANSCRIPT
    // --------------------------------------------------------

    const transcriptText = await fetchYouTubeTranscript(videoId);

    if (!transcriptText) {
      return res.status(400).json({
        success: false,
        error: "No transcript found for this video",
      });
    }

    if (!transcriptText) {
      return res.status(400).json({
        success: false,
        error: "Transcript is empty",
      });
    }

    // Prevent extremely large prompts
    const usableTranscript = transcriptText.slice(0, 60000);

    console.log(
      `📝 Transcript length: ${usableTranscript.length} characters`
    );

    // --------------------------------------------------------
    // SUMMARY PROMPT
    // --------------------------------------------------------

    const prompt = `
You are an expert educational summarizer.

Summarize the following YouTube video transcript.

IMPORTANT:
- Use ONLY the information contained in the transcript.
- Do not invent facts.
- Do not add outside knowledge.
- Keep the explanation useful for students.
- Organize the response clearly.
- Include important concepts, definitions, examples, and key takeaways.

Use this structure:

# Overview

# Detailed Notes

# Key Concepts

# Important Definitions

# Examples

# Key Takeaways

TRANSCRIPT:

${usableTranscript}
`;

    const aiResult = await askAI(prompt, {
      maxOutputTokens: 8192,
      jsonMode: false,
    });

    const answer = aiResult.answer;

    // --------------------------------------------------------
    // SAVE VIDEO DATA
    // --------------------------------------------------------

    youtubeCache.set(videoId, {
      transcript: usableTranscript,
      summary: answer,
      createdAt: Date.now(),
    });

    console.log(`💾 Cached video: ${videoId}`);

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    res.json({
      success: true,
      videoId,
      provider: aiResult.provider,
      result: answer,
    });
  } catch (error) {
    console.error("❌ YouTube summary error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Failed to summarize YouTube video",
    });
  }
});


// ============================================================
// QUIZ JSON PARSER
// ============================================================

function parseQuizJSON(answer) {
  let cleaned = String(answer || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI did not return valid quiz JSON");
  }

  cleaned = cleaned.substring(firstBrace, lastBrace + 1);

  return JSON.parse(cleaned);
}


// ============================================================
// QUIZ VALIDATOR
// ============================================================

function validateQuestion(question) {
  if (!question || typeof question !== "object") {
    return false;
  }

  if (typeof question.question !== "string") {
    return false;
  }

  if (!Array.isArray(question.options)) {
    return false;
  }

  // Exactly 3 options
  if (question.options.length !== 3) {
    return false;
  }

  // All options must be strings
  if (
    question.options.some(
      (option) => typeof option !== "string"
    )
  ) {
    return false;
  }

  // Options must be unique
  const uniqueOptions = new Set(
    question.options.map((option) =>
      option.trim().toLowerCase()
    )
  );

  if (uniqueOptions.size !== 3) {
    return false;
  }

  if (typeof question.answer !== "string") {
    return false;
  }

  // Answer must exactly match one of the options
  if (!question.options.includes(question.answer)) {
    return false;
  }

  if (typeof question.explanation !== "string") {
    return false;
  }

  return true;
}


// ============================================================
// GENERATE QUIZ
// ============================================================

app.post("/generate-quiz", async (req, res) => {
  try {
    const {
      videoId,
      batch = 1,
    } = req.body;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "videoId is required",
      });
    }

    // --------------------------------------------------------
    // FIND VIDEO DATA
    // --------------------------------------------------------

    const video = youtubeCache.get(videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        error:
          "Video content not found. Please generate the YouTube summary again.",
      });
    }

    console.log(
      `🧠 Generating quiz for video: ${videoId}`
    );

    // --------------------------------------------------------
    // MATERIAL
    // --------------------------------------------------------

    const material = `
VIDEO SUMMARY:

${video.summary}

VIDEO TRANSCRIPT:

${video.transcript.slice(0, 30000)}
`;

    // --------------------------------------------------------
    // GENERATE 10 QUESTIONS
    // --------------------------------------------------------

    const questions = [];

    for (let i = 0; i < 10; i++) {
      let generated = false;

      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          console.log(
            `📝 Generating question ${i + 1}/10, attempt ${attempt}`
          );

          const prompt = `
You are an educational quiz generator.

Create ONE multiple-choice question based ONLY on the provided
YouTube video material.

DO NOT use outside knowledge.

The question must test something explicitly explained or supported
by the video.

RULES:

1. Generate exactly ONE question.
2. Provide exactly THREE answer options.
3. Only ONE option can be correct.
4. The "answer" must exactly match one of the options.
5. Do not create duplicate questions.
6. Do not create questions about information that is not present
   in the video.
7. The explanation must be based only on the video material.
8. Return ONLY valid JSON.
9. Do not use Markdown.
10. Do not add text outside the JSON.

JSON FORMAT:

{
  "question": "Question text",
  "options": [
    "Option A",
    "Option B",
    "Option C"
  ],
  "answer": "Option A",
  "explanation": "Explanation based only on the video."
}

QUESTIONS ALREADY GENERATED:

${questions
              .map((q, index) => `${index + 1}. ${q.question}`)
              .join("\n") || "None"}

VIDEO MATERIAL:

${material}
`;

          const aiResult = await askAI(prompt, {
            maxOutputTokens: 2048,
            jsonMode: true,
          });

          const parsed = parseQuizJSON(aiResult.answer);

          if (!validateQuestion(parsed)) {
            throw new Error(
              "AI returned an invalid question structure"
            );
          }

          // --------------------------------------------------
          // DUPLICATE CHECK
          // --------------------------------------------------

          const duplicate = questions.some(
            (existing) =>
              existing.question
                .trim()
                .toLowerCase() ===
              parsed.question
                .trim()
                .toLowerCase()
          );

          if (duplicate) {
            throw new Error(
              "Duplicate question generated"
            );
          }

          questions.push({
            question: parsed.question.trim(),

            options: parsed.options.map((option) =>
              option.trim()
            ),

            answer: parsed.answer.trim(),

            explanation: parsed.explanation.trim(),
          });

          generated = true;

          console.log(
            `✅ Question ${i + 1}/10 generated`
          );

          break;
        } catch (error) {
          console.log(
            `⚠️ Question ${i + 1} attempt ${attempt} failed:`,
            error.message
          );
        }
      }

      if (!generated) {
        console.log(
          `❌ Could not generate question ${i + 1}`
        );
      }
    }

    // --------------------------------------------------------
    // CHECK RESULT
    // --------------------------------------------------------

    if (questions.length === 0) {
      return res.status(500).json({
        success: false,
        error:
          "Could not generate any quiz questions from the video",
      });
    }

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    res.json({
      success: true,
      videoId,
      batch,
      provider: "API",
      questions,
    });
  } catch (error) {
    console.error("❌ Quiz generation error:", error);

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to generate quiz",
    });
  }
});


// ============================================================
// ANALYZE PYQ
// ============================================================

app.post("/analyze-pyq", async (req, res) => {
  try {
    const { material } = req.body;

    if (!material) {
      return res.status(400).json({
        success: false,
        error: "Material is required",
      });
    }

    const prompt = `
You are an expert academic analyst.

Analyze the following previous-year-question-paper material.

Identify:

1. Important topics
2. Frequently repeated concepts
3. Question patterns
4. High-priority areas for preparation
5. Important definitions
6. Important long-answer topics
7. Important short-answer topics

Use ONLY the provided material.

MATERIAL:

${String(material).slice(0, 50000)}
`;

    const aiResult = await askAI(prompt, {
      maxOutputTokens: 8192,
      jsonMode: false,
    });

    res.json({
      success: true,
      provider: aiResult.provider,
      result: aiResult.answer,
    });
  } catch (error) {
    console.error("❌ PYQ analysis error:", error);

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to analyze PYQ",
    });
  }
});


// ============================================================
// PDF EXTRACTION
// ============================================================

app.post("/extract-pdf", async (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: "PDF data is required",
      });
    }

    const buffer = Buffer.from(data, "base64");

    const parser = new PDFParse({
      data: buffer,
    });

    const result = await parser.getText();

    await parser.destroy();

    res.json({
      success: true,
      text: result.text || "",
    });
  } catch (error) {
    console.error("❌ PDF extraction error:", error);

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to extract PDF",
    });
  }
});

app.get("/test-transcript/:videoId", async (req, res) => {
  try {
    const videoId = req.params.videoId;

    console.log(`🧪 Testing transcript API: ${videoId}`);

    const transcript = await fetchYouTubeTranscript(videoId);

    res.json({
      success: true,
      videoId,
      transcriptLength: transcript.length,
      sample: transcript.slice(0, 500)
    });

  } catch (error) {
    console.error("❌ Transcript test failed:", error);

    res.status(500).json({
      success: false,
      videoId: req.params.videoId,
      error: error.message
    });
  }
});


// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("======================================");
  console.log("🚀 StudentAI Backend Started");
  console.log("======================================");
  console.log(`📡 Local:   http://localhost:${PORT}`);
  console.log(`📡 Network: http://0.0.0.0:${PORT}`);
  console.log("");
  console.log("Available endpoints:");
  console.log("POST /youtube-summary");
  console.log("POST /generate-quiz");
  console.log("POST /analyze-pyq");
  console.log("POST /extract-pdf");
  console.log("======================================");
});
