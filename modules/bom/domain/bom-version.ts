export function nextBomVersion(existingVersions: string[]) {
  const largest = existingVersions.reduce((current, version) => {
    const match = /^v(\d+)$/i.exec(version)
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `v${largest + 1}`
}
