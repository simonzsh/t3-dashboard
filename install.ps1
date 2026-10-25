# Installs t3-dashboard for Windows: irm <url>/install.ps1 | iex
# Env: T3_DASHBOARD_REPO, T3_DASHBOARD_VERSION, T3_DASHBOARD_NO_SERVICE=1.
function Install-T3Dashboard {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  $repo = if ($env:T3_DASHBOARD_REPO) { $env:T3_DASHBOARD_REPO } else { 'simonzsh/t3-dashboard' }
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($arch -eq 'ARM64') { Write-Host 'ARM64: the x64 build runs under emulation.' }
  elseif ($arch -ne 'AMD64') { throw "$arch is not supported." }
  $asset = 't3-dashboard-windows-x64.exe'

  if ($env:T3_DASHBOARD_VERSION) {
    $base = "https://github.com/$repo/releases/download/v$($env:T3_DASHBOARD_VERSION.TrimStart('v'))"
  } else {
    $base = "https://github.com/$repo/releases/latest/download"
  }
  if ($env:T3_DASHBOARD_DRY_RUN -eq '1') { Write-Output "$base/$asset"; return }

  $dir = Join-Path $env:LOCALAPPDATA 'Programs\t3-dashboard'
  $exe = Join-Path $dir 't3-dashboard.exe'
  $tmp = Join-Path ([IO.Path]::GetTempPath()) "t3-dashboard-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    Write-Host "Downloading $asset"
    Invoke-WebRequest "$base/$asset" -OutFile (Join-Path $tmp $asset)
    Invoke-WebRequest "$base/SHA256SUMS" -OutFile (Join-Path $tmp 'SHA256SUMS')
    $line = Get-Content (Join-Path $tmp 'SHA256SUMS') | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1
    if (-not $line) { throw "No checksum for $asset in SHA256SUMS." }
    $actual = (Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash
    if ($actual -ne ($line -split '\s+')[0].ToUpper()) { throw "Checksum mismatch for $asset." }

    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    # Stop the running dashboard first: a running exe cannot be replaced.
    # cmd hides stderr from PowerShell 5.1, which turns it into an error under 'Stop'.
    cmd /c 'schtasks /End /TN "T3 Dashboard" >nul 2>&1'
    $global:LASTEXITCODE = 0
    Get-Process t3-dashboard -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
    Remove-Item "$exe.old" -Force -ErrorAction SilentlyContinue
    if (Test-Path $exe) { Move-Item $exe "$exe.old" -Force }
    Move-Item (Join-Path $tmp $asset) $exe -Force
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Installed $exe"

  # Read the raw value: expanding it would turn %VARS% entries into fixed text.
  $userPath = [string](Get-Item 'HKCU:\Environment').GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  if (($userPath -split ';') -notcontains $dir) {
    Set-ItemProperty 'HKCU:\Environment' -Name Path -Value "$userPath;$dir".TrimStart(';') -Type ExpandString
    # Setting a user variable broadcasts WM_SETTINGCHANGE: new consoles then read the new PATH.
    [Environment]::SetEnvironmentVariable('T3DashboardPathRefresh', '1', 'User')
    [Environment]::SetEnvironmentVariable('T3DashboardPathRefresh', $null, 'User')
    Write-Host 'Added the folder to your PATH. Open a new terminal to use t3-dashboard.'
  }

  if ($env:T3_DASHBOARD_NO_SERVICE -ne '1') {
    & $exe install
    if ($LASTEXITCODE -ne 0) { throw "t3-dashboard install failed (exit $LASTEXITCODE)." }
  }
}

Install-T3Dashboard
