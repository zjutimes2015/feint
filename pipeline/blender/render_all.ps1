# 批量渲染动作库:多进程并行,每个进程渲一个 clip。
#
# 本机只有 Intel 集显,单进程 EEVEE 约 3.2s/帧;并行 4 路可把
# 27 个 clip 的总耗时从 ~40 分钟压到 ~12 分钟。
#
# 用法:
#   powershell -ExecutionPolicy Bypass -File pipeline/blender/render_all.ps1 -Jobs 4
param(
  [int]$Jobs = 4,
  [string]$Blender = "E:\blender-tool\blender-4.5.15-windows-x64\blender.exe"
)

$ErrorActionPreference = "Stop"
$Pipeline = Split-Path -Parent $PSScriptRoot
$FbxDir = Join-Path $Pipeline "assets\mixamo\fbx"
$OutDir = Join-Path $Pipeline "assets\mixamo\mp4"
$Template = Join-Path $PSScriptRoot "brawlverse_template.blend"
$RenderOne = Join-Path $PSScriptRoot "render_one.py"
$Manifest = Join-Path $Pipeline "assets\mixamo\manifest.json"

if (-not (Test-Path $Blender)) { throw "blender not found: $Blender" }
if (-not (Test-Path $Template)) { throw "template not found: $Template" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$man = Get-Content $Manifest -Raw -Encoding utf8 | ConvertFrom-Json

$clipJobs = @()
$byId = @{}
foreach ($c in $man.clips) { $byId[$c.id] = $c }
foreach ($c in $man.clips) {
  # 源文件优先级：自有 fbx → 镜像源 → 近似源
  $src = $c.fbx
  $parent = if ($c.mirror_of) { $c.mirror_of } else { $c.approx_of }
  if (-not $src -and $parent -and $byId.ContainsKey($parent)) {
    $src = $byId[$parent].fbx
  }
  if (-not $src) { continue }
  if (-not (Test-Path (Join-Path $FbxDir $src))) {
    Write-Host "SKIP missing fbx: $($c.id) -> $src" -ForegroundColor Yellow
    continue
  }
  $mirror = if ($c.mirror_of) { "1" } else { "0" }
  $clipJobs += [pscustomobject]@{ Id = $c.id; Src = $src; Mirror = $mirror }
}

Write-Host "rendering $($clipJobs.Count) clips with $Jobs parallel workers" -ForegroundColor Cyan
$start = Get-Date
$running = @()
$done = 0
$failed = @()

while ($running.Count -lt $Jobs -and $done -lt $clipJobs.Count) {
  $j = $clipJobs[$done]
  $log = Join-Path $OutDir ("_log_" + $j.Id + ".txt")
  $args = @("--background", $Template, "--python", $RenderOne, "--", $FbxDir, $OutDir, $j.Id, $j.Src, $j.Mirror)
  $p = Start-Process -FilePath $Blender -ArgumentList $args -RedirectStandardOutput $log -RedirectStandardError ($log + ".err") -PassThru -NoNewWindow
  $running += [pscustomobject]@{ Proc = $p; Job = $j; Log = $log }
  $done++
}

while ($running.Count -gt 0) {
  Start-Sleep -Seconds 3
  $still = @()
  foreach ($r in $running) {
    if ($r.Proc.HasExited) {
      # Start-Process -PassThru 的 ExitCode 有时取不到(null)，所以以产物为准
      $code = $null
      try { $code = $r.Proc.ExitCode } catch { $code = $null }
      $out = Join-Path $OutDir ($r.Job.Id + ".mp4")
      $ok = (Test-Path $out) -and ((Get-Item $out).Length -gt 10000)
      if ($ok -and ($null -eq $code -or $code -eq 0)) {
        Write-Host ("OK   {0}" -f $r.Job.Id) -ForegroundColor Green
      } else {
        Write-Host ("FAIL {0} (exit {1})" -f $r.Job.Id, $code) -ForegroundColor Red
        $failed += $r.Job.Id
      }
    } else {
      $still += $r
    }
  }
  $running = $still
  if ($running.Count -lt $Jobs -and $done -lt $clipJobs.Count) {
    $j = $clipJobs[$done]
    $log = Join-Path $OutDir ("_log_" + $j.Id + ".txt")
    $args = @("--background", $Template, "--python", $RenderOne, "--", $FbxDir, $OutDir, $j.Id, $j.Src, $j.Mirror)
    $p = Start-Process -FilePath $Blender -ArgumentList $args -RedirectStandardOutput $log -RedirectStandardError ($log + ".err") -PassThru -NoNewWindow
    $running += [pscustomobject]@{ Proc = $p; Job = $j; Log = $log }
    $done++
  }
}

$elapsed = ((Get-Date) - $start).TotalSeconds
$mp4s = @(Get-ChildItem (Join-Path $OutDir "*.mp4") -ErrorAction SilentlyContinue)
Write-Host ("done: {0} mp4 in {1:N0}s" -f $mp4s.Count, $elapsed) -ForegroundColor Cyan
if ($failed.Count -gt 0) {
  Write-Host ("failed: {0}" -f ($failed -join ", ")) -ForegroundColor Red
  exit 1
}
