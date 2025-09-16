const fs = require('fs')

// Usage: node scripts/generateWebsiteEnv.js [deployments/latest.json]
// Writes website/.env.local with VITE_* from the deployment addresses

function main() {
  const path = process.argv[2] || 'deployments/latest.json'
  if (!fs.existsSync(path)) {
    console.error('Missing deployments file at', path)
    process.exit(1)
  }
  const info = JSON.parse(fs.readFileSync(path, 'utf8'))
  const a = info.addresses || info
  let out = ''
  if (info.chainId) out += `VITE_CHAIN_ID=${info.chainId}\n`
  // RPC left for user to fill
  out += `VITE_STAKING_ADDRESS=${a.STAKING || ''}\n`
  out += `VITE_POP_ADDRESS=${a.POP || ''}\n`
  out += `VITE_TOKEN_BLUE=${a.BLUE || ''}\n`
  out += `VITE_TOKEN_RED=${a.RED || ''}\n`
  out += `VITE_TOKEN_YELLOW=${a.YELLOW || ''}\n`
  out += `VITE_TOKEN_GREEN=${a.GREEN || ''}\n`
  out += `VITE_TOKEN_ORANGE=${a.ORANGE || ''}\n`
  out += `VITE_TOKEN_PURPLE=${a.PURPLE || ''}\n`
  out += `VITE_PID_BLUE_YELLOW=0\nVITE_PID_RED_YELLOW=1\nVITE_PID_BLUE_RED=2\nVITE_PID_PURPLE_SINGLE=3\nVITE_PID_GREEN_SINGLE=4\nVITE_PID_ORANGE_SINGLE=5\n`
  fs.writeFileSync('website/.env.local', out)
  console.log('Wrote website/.env.local from', path)
}

main()
