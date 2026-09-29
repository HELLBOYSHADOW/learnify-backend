const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Transcript test server is running"
  });
});

app.get("/test-new-transcript/:videoId", async (req, res) => {
  try {
    const videoId = req.params.videoId;

    console.log(`🧪 Testing new transcript API: ${videoId}`);

    const response = await fetch(
      `https://youtube-transcript.ai/transcript/${videoId}.txt`
    );

    const text = await response.text();

    console.log("📡 API status:", response.status);
    console.log("📝 Response length:", text.length);

    res.status(response.ok ? 200 : 500).json({
      success: response.ok,
      status: response.status,
      videoId,
      length: text.length,
      sample: text.slice(0, 500)
    });

  } catch (error) {
    console.error("❌ New transcript API test failed:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Test server running on port ${PORT}`);
});