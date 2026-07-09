import express from 'express'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { runAgentPipeline } from './agents.js'

dotenv.config()

const app = express()

// IMPORTANT: we need raw body for signature verification
app.use(express.raw({ type: 'application/json' }))

app.get('/', (req, res) => {
  res.send('PR Review Agent is running!')
})

app.post('/webhook', async (req, res) => {
  // Step 1: verify the signature so we know it's really GitHub
  const signature = req.headers['x-hub-signature-256']
  const computed = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex')

  if (signature !== computed) {
    console.log('Invalid signature — rejected')
    return res.status(401).send('Unauthorized')
  }

  // Step 2: parse the payload
  const payload = JSON.parse(req.body)
  const event = req.headers['x-github-event']

  console.log(`Received GitHub event: ${event}`)

  // Step 3: only act on pull_request opened or updated events
  if (event !== 'pull_request') {
    return res.status(200).send('Event ignored')
  }

  if (!['opened', 'synchronize'].includes(payload.action)) {
    return res.status(200).send('Action ignored')
  }

  // Step 4: acknowledge GitHub immediately — very important
  // GitHub expects a response within a few seconds
  res.status(200).send('Webhook received — processing')

  // Step 5: run the agent pipeline in the background
  const prData = {
    number: payload.pull_request.number,
    title: payload.pull_request.title,
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    diffUrl: payload.pull_request.diff_url,
  }

  console.log(`Processing PR #${prData.number}: ${prData.title}`)
  
  try {
    await runAgentPipeline(prData)
  } catch (err) {
    console.error('Agent pipeline error:', err.message)
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`)
})