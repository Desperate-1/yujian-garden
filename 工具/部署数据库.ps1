# 用已运行的数据库服务建表。首次使用 Windows 便携版时，从 DBInstallers 解压。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$appDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'MindGarden'
$python = Join-Path $appDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw '请先根据安装说明创建 Python 虚拟环境并安装依赖。' }
if (-not $env:MYSQL_PASSWORD) { throw '请先设置 MYSQL_PASSWORD 为目标 MySQL 用户密码。' }

$baseDir = Join-Path $env:USERPROFILE 'DBPortable'
$installers = Join-Path $env:USERPROFILE 'DBInstallers'
$initializer = Join-Path $PSScriptRoot '初始化数据库.py'
$env:PYTHONIOENCODING = 'utf-8'
$mysqlHost = if ($env:MYSQL_HOST) { $env:MYSQL_HOST } else { '127.0.0.1' }
$mysqlPort = if ($env:MYSQL_PORT) { [int]$env:MYSQL_PORT } else { 3306 }

function Test-Port([string]$address, [int]$port) {
    $client = New-Object Net.Sockets.TcpClient
    try { return $client.ConnectAsync($address, $port).Wait(800) -and $client.Connected }
    catch { return $false }
    finally { $client.Dispose() }
}

function Wait-Port([int]$port) {
    for ($i = 0; $i -lt 45; $i++) {
        if (Test-Port '127.0.0.1' $port) { return }
        Start-Sleep -Seconds 1
    }
    throw "本机数据库端口 $port 未就绪。"
}

function Install-Portable([string]$name, [string]$executable) {
    $folder = Join-Path $baseDir $name
    if (Test-Path -LiteralPath (Join-Path $folder "bin\$executable")) { return $folder }
    $zip = Join-Path $installers "$name.zip"
    if (-not (Test-Path -LiteralPath $zip)) { throw "请先启动已有服务，或将官方 Windows 便携版 ZIP 放在 $zip" }
    if (Test-Path -LiteralPath $folder) { throw "请检查已有安装目录 $folder，它缺少 $executable" }
    $staging = Join-Path $baseDir ([guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $staging
    $binary = Get-ChildItem -LiteralPath $staging -Filter $executable -Recurse -File | Select-Object -First 1
    if (-not $binary -or $binary.Directory.Name -ne 'bin') { throw "安装包中找不到 bin\$executable" }
    $source = $binary.Directory.Parent.FullName
    if (-not $source.StartsWith($staging + '\', [StringComparison]::OrdinalIgnoreCase) -and $source -ne $staging) { throw '安装包目录无效' }
    Move-Item -LiteralPath $source -Destination $folder
    if ((Test-Path -LiteralPath $staging) -and -not (Get-ChildItem -LiteralPath $staging -Force)) {
        Remove-Item -LiteralPath $staging
    }
    return $folder
}

if (-not (Test-Port $mysqlHost $mysqlPort)) {
    if ($mysqlHost -notin '127.0.0.1','localhost','::1') { throw '请启动已配置的远程 MySQL 服务。' }
    $folder = Install-Portable 'mysql' 'mysqld.exe'
    $server = Join-Path $folder 'bin\mysqld.exe'
    $ini = Join-Path $folder 'my.ini'
    $data = Join-Path $folder 'data'
    $fresh = -not (Test-Path -LiteralPath (Join-Path $data 'mysql'))
    if ($fresh) {
        if ($env:MYSQL_USER -and $env:MYSQL_USER -ne 'root') { throw '首次初始化便携版请先用本地 root 建库，已有服务可选择自己的数据库账号。' }
        if ((Test-Path -LiteralPath $data) -and (Get-ChildItem -LiteralPath $data -Force)) { throw '已有数据文件，请检查 MySQL 数据目录。' }
        $mysqlTemp = Join-Path $folder "tmp"
        New-Item -ItemType Directory -Path $mysqlTemp -Force | Out-Null
        $cfg = "[mysqld]
basedir=$($folder.Replace('\','/'))
datadir=$($data.Replace('\','/'))
tmpdir=$($mysqlTemp.Replace('\','/'))
port=$mysqlPort
bind-address=127.0.0.1
character-set-server=utf8mb4"
        [IO.File]::WriteAllText($ini, $cfg, [Text.UTF8Encoding]::new($false))
        & $server "--defaults-file=$ini" --initialize-insecure
        if ($LASTEXITCODE -ne 0) { throw '初始化 MySQL 失败，请检查便携版数据目录中的错误日志。' }
    }
    $proc = Start-Process $server -WorkingDirectory $folder -ArgumentList ('--defaults-file="{0}"' -f $ini) -WindowStyle Hidden -PassThru
    Wait-Port $mysqlPort
    if ($fresh) {
        & $python -X utf8 $initializer --new-portable-instance
        if ($LASTEXITCODE -ne 0) {
            if (-not $proc.HasExited) { $proc.Kill() }
            throw '首次设置 MySQL 密码失败，已停止本次创建的进程。'
        }
    }
}
if (-not $env:MONGO_URI -and -not (Test-Port '127.0.0.1' 27017)) {
    $folder = Install-Portable 'mongodb' 'mongod.exe'
    $data = Join-Path $folder 'data'
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    $mongoArgs = @('--bind_ip=127.0.0.1','--port=27017',('--dbpath="{0}"' -f $data),('--logpath="{0}"' -f (Join-Path $folder 'mongod.log')))
    Start-Process (Join-Path $folder 'bin\mongod.exe') -ArgumentList $mongoArgs -WindowStyle Hidden
    Wait-Port 27017
}
& $python -X utf8 $initializer
exit $LASTEXITCODE
