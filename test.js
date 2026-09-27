require("dotenv").config();

console.log("Key loaded:", process.env.GROQ_API_KEY ? "YES" : "NO");
console.log("Key prefix:", process.env.GROQ_API_KEY?.slice(0, 4));

async function main() {
  const response = await fetch(
    "https://api.groq.com/openai/v1/models",
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      }
    }
  );

  console.log("HTTP:", response.status);
  console.log(await response.json());
}

main();