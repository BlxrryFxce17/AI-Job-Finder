# Package AI Job Copilot Chrome Extension for Chrome Web Store distribution
$outputDir = "dist-extension"
$zipPath = "$outputDir/ai-job-copilot-extension.zip"

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "extension/*" -DestinationPath $zipPath -Force
Write-Host " Extension packaged successfully!" -ForegroundColor Green
Write-Host " Output: $zipPath" -ForegroundColor Cyan
Get-Item $zipPath | Select-Object Name, Length, LastWriteTime
