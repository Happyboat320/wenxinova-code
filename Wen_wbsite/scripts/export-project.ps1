$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot

$DestinationPath = Join-Path -Path $repoRoot -ChildPath "output"
$DestinationPath = [System.IO.Path]::GetFullPath($DestinationPath)

if (Test-Path -Path $DestinationPath) {
    Remove-Item -Path $DestinationPath -Recurse -Force
}

New-Item -ItemType Directory -Path $DestinationPath | Out-Null

$directoriesToCopy = @("backend", "frontend")

foreach ($directoryName in $directoriesToCopy) {
    $sourcePath = Join-Path -Path $repoRoot -ChildPath $directoryName

    if (-not (Test-Path -Path $sourcePath)) {
        Write-Warning "Source path not found: $sourcePath"
        continue
    }

    $targetPath = Join-Path -Path $DestinationPath -ChildPath $directoryName

    if (Test-Path -Path $targetPath) {
        Remove-Item -Path $targetPath -Recurse -Force
    }

    New-Item -ItemType Directory -Path $targetPath | Out-Null

    $robocopyArguments = @(
        $sourcePath,
        $targetPath,
        "/E",
        "/XD",
        "node_modules"
    )

    # robocopy signals errors with exit codes 8 and above.
    $robocopyProcess = Start-Process -FilePath "robocopy.exe" -ArgumentList $robocopyArguments -Wait -PassThru -NoNewWindow
    $exitCode = $robocopyProcess.ExitCode

    if ($exitCode -ge 8) {
        throw "Failed to copy '$directoryName'. robocopy exit code: $exitCode"
    }
}

Write-Host "Export completed successfully to $DestinationPath"
