import 'dotenv/config'

async function main() {
  const apiKey = process.env.AI_GATEWAY_API_KEY
  if (!apiKey) {
    console.error('AI_GATEWAY_API_KEY not found')
    process.exit(1)
  }

  console.log('Using API key:', apiKey.slice(0, 10) + '...')

  const response = await fetch('https://gateway.vercel.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'Say exactly: Hello from AI Gateway! The API key works!' }],
      max_tokens: 30,
    }),
  })

  const data = await response.json()
  console.log('Status:', response.status)
  console.log('Response:', JSON.stringify(data, null, 2))
}

main()
