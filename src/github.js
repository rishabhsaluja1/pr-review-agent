import { Octokit } from '@octokit/rest'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REVIEWS_FILE = path.join(__dirname, 'reviews.json')

export function saveReview(data) {
  try {
    const existing = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'))
    existing.unshift(data) // newest first
    const trimmed = existing.slice(0, 50) // keep last 50 reviews
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(trimmed, null, 2))
    console.log(`Review saved — total: ${trimmed.length}`)
  } catch (err) {
    console.error('Error saving review:', err.message)
  }
}

export function getReviews() {
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'))
  } catch {
    return []
  }
}
dotenv.config()

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

// ── Fetch the code diff from a PR ─────────────────────────────────
export async function fetchPRDiff(prData) {
  try {
    const { owner, repo, number } = prData

    console.log(`Fetching diff for PR #${number} from ${owner}/${repo}`)

    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
      mediaType: {
        format: 'diff'   // tells GitHub to return raw diff format
      }
    })

    const diff = response.data

    if (!diff || diff.length === 0) {
      console.log('Empty diff received')
      return null
    }

    // Trim diff if it's massive — Gemini has a token limit
    // 8000 chars covers most PRs comfortably
    const trimmed = diff.length > 8000
      ? diff.substring(0, 8000) + '\n... (diff truncated)'
      : diff

    console.log(`Diff fetched — ${trimmed.length} characters`)
    return trimmed

  } catch (err) {
    console.error('Error fetching PR diff:', err.message)
    return null
  }
}

// ── Post the final review comment back onto the GitHub PR ──────────
export async function postReviewComment(prData, comment) {
  try {
    const { owner, repo, number } = prData

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,   // PRs and issues share the same comment API
      body: comment
    })

    console.log(`Comment posted on PR #${number}`)

  } catch (err) {
    console.error('Error posting comment:', err.message)
  }
}