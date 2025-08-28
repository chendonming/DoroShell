param(
  [string]$Version = ''
)

# Determine version
if (-not $Version -or $Version -eq '') {
  $pkg = Join-Path $PSScriptRoot '..\package.json' | Resolve-Path -Relative
  $json = Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json
  $base = $json.version
  $timestamp = (Get-Date -Format "yyyyMMddHHmm")
  $Version = "$base-beta.$timestamp"
}

Write-Host "Preparing release tag: v$Version"

<# Ensure working tree is clean #>
$status = git status --porcelain
if ($status) {
  Write-Host "Working tree is not clean; commit or stash your changes first." -ForegroundColor Yellow
  exit 1
}

Write-Host "Installing dependencies..."
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running local build..."
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$tag = "v$Version"
Write-Host "Creating annotated tag $tag"
git tag -a $tag -m "beta release $tag"
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to create tag" -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host "Pushing tag to origin: $tag"
git push origin $tag
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to push tag" -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host "Tag pushed. GitHub Actions should be triggered to build and publish the beta prerelease." -ForegroundColor Green
