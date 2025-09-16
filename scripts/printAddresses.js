const fs = require("fs");

// Usage:
//  node scripts/printAddresses.js                 -> reads deployments/latest.json
//  node scripts/printAddresses.js 11155111        -> reads deployments/by-chain/11155111.latest.json
//  node scripts/printAddresses.js path/to/file.json -> reads explicit file

function load(pathOrChain) {
  if (!pathOrChain) {
    return JSON.parse(fs.readFileSync("deployments/latest.json", "utf8"));
  }
  if (/^\d+$/.test(pathOrChain)) {
    const p = `deployments/by-chain/${pathOrChain}.latest.json`;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return JSON.parse(fs.readFileSync(pathOrChain, "utf8"));
}

function main() {
  const arg = process.argv[2];
  const info = load(arg);
  const a = info.addresses || info;
  console.log(JSON.stringify({
    network: info.network,
    chainId: info.chainId,
    ...a,
  }, null, 2));
}

main();

