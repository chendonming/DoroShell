param(
  [string]$Version = ''
)

# Determine base version and compute next beta number
if (-not $Version -or $Version -eq '') {
  $pkgPath = Join-Path $PSScriptRoot '..\package.json'
  $json = Get-Content $pkgPath -Raw | ConvertFrom-Json
  $base = $json.version

  # Fetch tags from remote to compute next beta number
  Write-Host "Fetching tags from origin..."
  git fetch --tags origin

  $pattern = "^v" + [regex]::Escape($base) + "-beta\.(\d+)$"
  $tags = git ls-remote --tags origin | ForEach-Object {
    $_ -split '\t' | Select-Object -Last 1
  }

  $max = 0
  foreach ($t in $tags) {
    if ($t -match $pattern) {
      $n = [int]$Matches[1]
      if ($n -gt $max) { $max = $n }
    }
  }
  $next = $max + 1
  $Version = "$base-beta.$next"
} else {
  # If user supplied explicit version e.g. 1.2.3, start at beta.1
  if ($Version -match '^\d+\.\d+\.\d+$') {
    $Version = "$Version-beta.1"
  }
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
# If the tag already exists locally or remotely, increment until an unused tag is found
Write-Host "Checking for existing tags..."
while ($true) {
  $existsLocal = (git tag --list $tag) -ne $null -and (git tag --list $tag).Trim() -ne ''
  $existsRemote = (git ls-remote --tags origin $tag) -ne $null -and (git ls-remote --tags origin $tag).Trim() -ne ''
  if (-not $existsLocal -and -not $existsRemote) { break }
  Write-Host "Tag $tag already exists; incrementing..."
  # parse current Version like base-beta.N, increment N
  if ($Version -match '-beta\.(\d+)$') {
    $num = [int]$Matches[1]
    $num = $num + 1
    $Version = $Version -replace '-beta\.(\d+)$', "-beta.$num"
    $tag = "v$Version"
  } else {
    # fallback: append .1
    $Version = "$Version-beta.1"
    $tag = "v$Version"
  }
}

Write-Host "Creating annotated tag $tag"
git tag -a $tag -m "beta release $tag"
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to create tag" -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host "Pushing tag to origin: $tag"
git push origin $tag
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to push tag" -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host "Tag pushed. GitHub Actions should be triggered to build and publish the beta prerelease." -ForegroundColor Green
