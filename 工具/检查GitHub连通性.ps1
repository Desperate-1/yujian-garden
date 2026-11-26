# ============================================================
#  GitHub 连通性一键验证脚本
#  用途：判断当前能否真正访问 GitHub（DNS / TCP / TLS 三段分明）
#  用法：右键"使用 PowerShell 运行"，或在 PowerShell 里执行本文件
#  作者：鲸鱼娘  最后更新：2026-10-12
# ============================================================
$ErrorActionPreference = "Continue"

function Line($t) { Write-Host ""; Write-Host "===== $t =====" -ForegroundColor Cyan }
function OK($t)   { Write-Host "  [OK]   $t" -ForegroundColor Green }
function BAD($t)  { Write-Host "  [FAIL] $t" -ForegroundColor Red }
function INFO($t) { Write-Host "  [INFO] $t" -ForegroundColor Gray }

Line "1. 当前 DNS 服务器"
Get-DnsClientServerAddress -AddressFamily IPv4 |
    Where-Object { $_.ServerAddresses } |
    ForEach-Object { INFO "$($_.InterfaceAlias): $($_.ServerAddresses -join ', ')" }

Line "2. DNS 解析测试（能否把域名翻译成 IP）"
foreach ($h in @('github.com', 'api.github.com', 'codeload.github.com', 'raw.githubusercontent.com')) {
    try {
        $ips = (Resolve-DnsName $h -Type A -QuickTimeout -ErrorAction Stop |
                Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress) -join ', '
        if ($ips) { OK "$h -> $ips" } else { BAD "$h 解析不到 A 记录" }
    } catch { BAD "$h 解析失败（可能被 DNS 屏蔽）" }
}

Line "3. hosts 文件里的 github 条目"
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$ghLines = Get-Content $hostsPath -ErrorAction SilentlyContinue | Where-Object { $_ -match 'github' -and $_ -notmatch '^\s*#' }
if ($ghLines) {
    INFO "发现 $($ghLines.Count) 条 github 相关条目："
    $ghLines | ForEach-Object { INFO "    $_" }
    Write-Host "  [注意] 如果这些指向 127.0.0.1，而加速器没在跑，就会上不去" -ForegroundColor Yellow
} else {
    OK "hosts 里没有 github 条目（干净）"
}

Line "4. TCP + TLS 真实握手测试（关键判据）"
# 能 TCP 连上但证书不匹配  -> 说明网络通到 GitHub 了
# 一直超时                -> 说明被防火墙/SNI 拦截
# 连接被重置(reset)       -> 说明被 SNI 拦截
$tests = @(
    @{ ip = '140.82.113.3'; name = 'github.com' },
    @{ ip = '140.82.113.6'; name = 'api.github.com' },
    @{ ip = '185.199.108.133'; name = 'raw.githubusercontent.com' }
)
foreach ($t in $tests) {
    INFO "测试 $($t.name) ($($t.ip)) ..."
    $out = & curl.exe -sS -m 10 -o NUL "https://$($t.ip)/" 2>&1 | Out-String
    if ($out -match 'certificate|WRONG_PRINCIPAL|no alternative certificate') {
        OK "握手成功！证书报错=正常（因为我们用的是 IP 不是域名）=> 网络能通"
    } elseif ($out -match 'reset|Connection was reset') {
        BAD "连接被重置 => 被 SNI 拦截，hosts 硬指 IP 也没用，必须用代理/加速器"
    } elseif ($out -match 'timed out|timeout') {
        BAD "超时 => 网络层不通"
    } else {
        INFO "原始输出：$($out.Trim())"
    }
}

Line "5. 结论怎么读"
Write-Host @"
  * 第2步全 OK  + 第4步全 OK   -> 浏览器应该能直接打开 GitHub
  * 第2步 FAIL  + 第4步 OK     -> 只是 DNS 被屏蔽，改 hosts 指 IP 可绕过
  * 第2步 FAIL  + 第4步 reset  -> 双重拦截，必须开代理/加速器（推荐 Steam++ 的 GitHub 加速）
  * 本机加速器状态请手动确认：打开 Steam++ -> 网络加速 -> 看 GitHub 是否已启用
"@ -ForegroundColor White
Write-Host ""
