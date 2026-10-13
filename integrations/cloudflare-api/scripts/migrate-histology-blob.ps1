[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$ArchivePath,
  [switch]$DryRun,
  [switch]$Overwrite,
  [int]$Limit = 0
)

$ErrorActionPreference = "Stop"
$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$migrationScript = Join-Path $PSScriptRoot "migrate-histology-blob.mjs"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("medbiohim-histology-" + [guid]::NewGuid().ToString("N"))
$extractRoot = Join-Path $tempRoot "extract"
$manifestPath = Join-Path (Get-Location).Path "medbiohim-histology-blob-manifest.json"
$originalBlobToken = $env:UPSTASH_BLOB_TOKEN

try {
  New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
  Write-Host "Extracting archive to temporary folder..."
  Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force

  $sourceRoot = Join-Path $extractRoot "content/histology"
  if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Expected content/histology inside archive; no upload was attempted."
  }

  if (-not $DryRun -and [string]::IsNullOrWhiteSpace($env:UPSTASH_BLOB_TOKEN)) {
    $secure = Read-Host "Paste the private Upstash Blob token (input is hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $env:UPSTASH_BLOB_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
      
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
      $secure.Dispose()
    }
  }

  $nodeArgs = @($migrationScript, $sourceRoot, "--manifest-out", $manifestPath)
  if ($DryRun) { $nodeArgs += "--dry-run" }
  if ($Overwrite) { $nodeArgs += "--overwrite" }
  if ($Limit -gt 0) { $nodeArgs += @("--limit", "$Limit") }

  Push-Location $repoRoot
  try {
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) {
      throw "Migration utility exited with code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
} finally {
  $env:UPSTASH_BLOB_TOKEN = $originalBlobToken
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
