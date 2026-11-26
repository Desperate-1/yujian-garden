# -*- coding: utf-8 -*-
<#
================================================================
  MindGarden 心灵花园 —— 一键启动（完整版）
================================================================
  作用：
    1. 从系统设置载入全部 API 密钥（明文不写在脚本里）
    2. 启动 MySQL 与 MongoDB（已在运行则跳过）
    3. 启动 Flask 应用
    4. 自动打开浏览器
    5. 显示手机访问地址（同一 WiFi 下可用）

  用法：双击根目录的「一键启动.bat」即可，不用手敲命令。

  停止：关掉本窗口，或按 Ctrl+C。
  作者：鲸鱼娘   日期：2026-10-13
================================================================
#>

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ---------------- 路径 ----------------
# 全部按"脚本自己所在目录"定位 —— 整个运行包解压到任意目录、任意盘符都能直接跑。
$ProjectRoot = Join-Path $PSScriptRoot "MindGarden"
# 数据库：优先用运行包自带的 DBPortable；找不到再退回本机固定位置（开发机用）。
$DBBase      = Join-Path $PSScriptRoot "DBPortable"
if (-not (Test-Path (Join-Path $DBBase "mysql\bin\mysqld.exe"))) {
    $DBBase = (Join-Path $env:USERPROFILE "DBPortable")
}
$mysqld      = Join-Path $DBBase "mysql\bin\mysqld.exe"
$myIni       = Join-Path $DBBase "mysql\my.ini"
$mongod      = Join-Path $DBBase "mongodb\bin\mongod.exe"
$mongoData   = Join-Path $DBBase "mongodb\data"
$mongoLog    = Join-Path $DBBase "mongodb\mongod.log"
$ffmpegBin   = Join-Path $DBBase "ffmpeg\bin"
$VenvPython  = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$Port = 5000
if ($env:PORT -and (-not [int]::TryParse($env:PORT, [ref]$Port) -or $Port -lt 1 -or $Port -gt 65535)) {
    Write-Error "PORT 必须是 1 至 65535 之间的整数"
    exit 1
}

function Title($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Cyan }
function OK($t)    { Write-Host "   [OK] $t" -ForegroundColor Green }
function Info($t)  { Write-Host "   [..] $t" -ForegroundColor Gray }
function Bad($t)   { Write-Host "   [!!] $t" -ForegroundColor Red }
function Wait-Port($port, $seconds) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

Clear-Host
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkCyan
Write-Host "      愈见花园  ·  一键启动" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor DarkCyan

# ---------------- 0. 环境自检 ----------------
Title "0. 环境自检"
$missing = @()
if (-not (Test-Path $VenvPython)) { $missing += "Python 虚拟环境（$VenvPython）" }
if ($missing.Count -gt 0) {
    Bad "缺少以下组件，无法启动："
    $missing | ForEach-Object { Write-Host "        - $_" -ForegroundColor Red }
    Write-Host ""
    Info "若是首次使用，请先运行 工具\部署数据库.ps1"
    Read-Host "  按回车退出"
    exit 1
}
OK "组件齐全"

# ---------------- 1. 载入 API 密钥 ----------------
Title "1. 载入 API 密钥"
# 环境变量只对"设置之后新启动的进程"生效。这里显式从用户级注册表读一次，
# 保证无论本窗口是什么时候打开的，都能拿到最新密钥。
$KeyNames = @(
    "DEEPSEEK_API_KEY", "GLM_API_KEY", "VISION_PROVIDER",
    "GLM_VISION_MODEL", "GLM_VISION_MODEL_FALLBACK", "DEEPSEEK_MODEL",
    "MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE", "MONGO_URI",
    "SECRET_KEY", "KIMI_API_KEY", "HF_ENDPOINT", "IMAGE_PROVIDER",
    "LOCAL_IMAGE_MODEL", "SD15_STEPS",
              "POSE_CORRECTION", "SHOW_SKELETON",
              "DEEPSEEK_THINKING",
              "POSE_STRENGTH",
              "SENTIMENT_USE_LLM",
    "TENCENT_SECRET_ID", "TENCENT_SECRET_KEY",
    "IFLYTEK_APP_ID", "IFLYTEK_API_KEY", "IFLYTEK_API_SECRET"
)
$loaded = @()
foreach ($n in $KeyNames) {
    if ([System.Environment]::GetEnvironmentVariable($n, 'Process')) { continue }
    $v = [System.Environment]::GetEnvironmentVariable($n, 'User')
    if (-not [string]::IsNullOrWhiteSpace($v)) {
        [System.Environment]::SetEnvironmentVariable($n, $v, 'Process')
        $loaded += $n
    }
}
if ($loaded.Count -gt 0) { OK "已载入 $($loaded.Count) 项配置" }


# 缺哪个就明确说是哪个功能会坏，而不是让用户去猜
if (-not $env:DEEPSEEK_API_KEY) { Bad "DEEPSEEK_API_KEY 为空 -> AI 对话与提示词生成会失败" }
if (-not $env:GLM_API_KEY)      { Bad "GLM_API_KEY 为空 -> 云端图像理解不可用" }
if (-not $env:TENCENT_SECRET_ID) { Bad "TENCENT_SECRET_ID 为空 -> 云端生图/3D 会回退本地（很慢）" }
if (-not $env:IFLYTEK_APP_ID)   { Bad "IFLYTEK_APP_ID 为空 -> 语音功能不可用" }

# ffmpeg 供语音处理使用
if (Test-Path $ffmpegBin) { $env:Path = $env:Path + ";$ffmpegBin" }
$env:PYTHONIOENCODING = "utf-8"

# ---------------- 2. 数据库 ----------------
Title "2. 启动数据库"
if (-not $env:MYSQL_PASSWORD) {
    Bad "请在此环境设置 MYSQL_PASSWORD，再运行启动器。首次建表可使用 工具\部署数据库.ps1。"
    exit 1
}
$mysqlPort = if ($env:MYSQL_PORT) { [int]$env:MYSQL_PORT } else { 3306 }
if ($env:MYSQL_HOST -and $env:MYSQL_HOST -notin '127.0.0.1','localhost','::1') {
    OK "使用已配置的 MySQL 服务"
} elseif (Get-NetTCPConnection -State Listen -LocalPort $mysqlPort -ErrorAction SilentlyContinue) {
    OK "MySQL 已在运行"
} else {
    if (-not (Test-Path -LiteralPath $mysqld)) { Bad "请先启动 MySQL 服务，或运行 工具\部署数据库.ps1。"; exit 1 }
    Info "启动 MySQL…"
    Start-Process -FilePath $mysqld -WorkingDirectory (Split-Path -Parent $mysqld) -ArgumentList "--defaults-file=`"$myIni`"" -WindowStyle Hidden
    if (Wait-Port $mysqlPort 20) { OK "MySQL 已就绪" } else { Bad "MySQL 启动超时"; exit 1 }
}

if ($env:MONGO_URI) {
    OK "使用 MONGO_URI 指定的 MongoDB 服务"
} elseif (Get-NetTCPConnection -State Listen -LocalPort 27017 -ErrorAction SilentlyContinue) {
    OK "MongoDB 已在运行"
} else {
    if (-not (Test-Path -LiteralPath $mongod)) { Bad "请先启动 MongoDB 服务，或运行 工具\部署数据库.ps1。"; exit 1 }
    Info "启动 MongoDB…"
    Start-Process -FilePath $mongod -WorkingDirectory (Split-Path -Parent $mongod) -ArgumentList @(
        "--dbpath=`"$mongoData`"", "--port=27017",
        "--logpath=`"$mongoLog`"", "--bind_ip=127.0.0.1"
    ) -WindowStyle Hidden
    if (Wait-Port 27017 20) { OK "MongoDB 已就绪" } else { Bad "MongoDB 启动超时"; exit 1 }
}

# ---------------- 3. 启动应用 ----------------
Title "3. 启动网站"
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Bad "端口 $Port 已在使用。请关闭该服务或设置 PORT 后重新启动。"
    exit 1
}
Info "正在加载花园。网站就绪后会打开浏览器。"
Info "本机访问 http://127.0.0.1:$Port ，在此窗口按 Ctrl+C 可停止网站。"
Push-Location -LiteralPath $ProjectRoot
try {
    & $VenvPython -X utf8 app.py --open-browser
    $appExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $appExitCode
