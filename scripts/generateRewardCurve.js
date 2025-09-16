#!/usr/bin/env node
// Generate a 91-point reward curve for ProofOfPaint (days 0..90), scaled by 1e6
// Usage examples:
//   node scripts/generateRewardCurve.js                 # default quadratic
//   node scripts/generateRewardCurve.js --alpha 3.0     # exponential with alpha=3.0
//   node scripts/generateRewardCurve.js --type exp --alpha 4 > curve.json
//   node scripts/generateRewardCurve.js --type quad > curve.json

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { type: 'exp', alpha: 3.0 }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--type') out.type = args[++i]
    else if (a === '--alpha') out.alpha = parseFloat(args[++i])
  }
  if (!['exp', 'quad'].includes(out.type)) out.type = 'exp'
  if (!(out.alpha > 0)) out.alpha = 3.0
  return out
}

function genExp(alpha) {
  const n = 90
  const res = []
  const denom = Math.expm1(alpha) // exp(alpha) - 1
  for (let d = 0; d <= n; d++) {
    const t = d / n
    const y = Math.expm1(alpha * t) / denom
    res.push(Math.round(y * 1_000_000))
  }
  res[0] = 0
  res[n] = 1_000_000
  for (let i = 1; i <= n; i++) if (res[i] < res[i - 1]) res[i] = res[i - 1]
  return res
}

function genQuad() {
  const n = 90
  const res = []
  for (let d = 0; d <= n; d++) {
    const t = d / n
    res.push(Math.round(t * t * 1_000_000))
  }
  res[n] = 1_000_000
  return res
}

function main() {
  const { type, alpha } = parseArgs()
  const curve = type === 'quad' ? genQuad() : genExp(alpha)
  console.log(JSON.stringify({ type, alpha, points: curve.length, curve }, null, 2))
}

main()

