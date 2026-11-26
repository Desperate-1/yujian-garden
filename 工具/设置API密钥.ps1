# -*- coding: utf-8 -*-
<#
================================================================
  MindGarden API Key 一键设置
================================================================
  作用：把比赛需要的 API Key 写入当前用户的持久环境变量，
        以后每次启动系统都不用重新粘贴。
  安全：只写入你本机用户的环境变量（注册表 HKCU），不写进任何
        项目文件，不会随代码一起提交出去。

  ⚠️ 重要：下面「配置区」里一个真实 Key 都没有，全是空的。
     这个文件会随项目一起打包/提交，**绝对不要把真 Key 填进来再交出去**。
     正确做法有两种：
        1) 直接运行本脚本，它会挨个问你，输入后写入环境变量（输入不回显）
        2) 自己临时填进配置区，跑一次，然后立刻清空再保存
  用法：右键本文件 -> "使用 PowerShell 运行"
        或者：powershell -NoProfile -ExecutionPolicy Bypass -File "设置API密钥.ps1"
  作者：鲸鱼娘   日期：2026-10-12（2026-11 改为不落盘真实密钥）
================================================================
#>

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ================= 配置区：留空 = 运行时询问 =================
# 想一次性写死（仅限自己电脑临时用，用完记得清空）：把值填在引号里
$DEEPSEEK_API_KEY = ""

$GLM_API_KEY = ""

# 以下不是密钥，是服务选择，可以保留默认值
$VISION_PROVIDER = "glm"                      # glm（免费） / kimi / custom
$GLM_VISION_MODEL = "glm-4v-flash"            # 免费视觉模型，2~3 秒
$GLM_VISION_MODEL_FALLBACK = "glm-4v"         # 上面失败时降级用
$DEEPSEEK_MODEL = "deepseek-chat"             # DeepSeek 对话模型名

$TENCENT_SECRET_ID  = ""                      # 腾讯云：3D 生成用，没有就留空
$TENCENT_SECRET_KEY = ""

$IFLYTEK_APP_ID     = ""                      # 科大讯飞：语音识别/合成，没有就留空
$IFLYTEK_API_KEY    = ""
$IFLYTEK_API_SECRET = ""

$SECRET_KEY = ""                              # Flask 会话签名，留空则自动随机生成
# ============================================================

function Ask($name, $在当前值) {
    # 配置区填了就用配置区的；没填就问；回车跳过
    if (-not [string]::IsNullOrWhiteSpace($在当前值)) { return $在当前值 }
    $hint = switch ($name) {
        "DEEPSEEK_API_KEY"   { "DeepSeek 开放平台 -> API keys（sk- 开头）" }
        "GLM_API_KEY"        { "智谱开放平台 -> API keys" }
        "TENCENT_SECRET_ID"  { "腾讯云 -> 访问管理 -> API 密钥（AKID 开头）" }
        "TENCENT_SECRET_KEY" { "腾讯云 -> 访问管理 -> API 密钥（跟上面一对）" }
        "IFLYTEK_APP_ID"     { "讯飞开放平台 -> 我的应用 -> APPID" }
        "IFLYTEK_API_KEY"    { "讯飞开放平台 -> 我的应用 -> APIKey" }
        "IFLYTEK_API_SECRET"{ "讯飞开放平台 -> 我的应用 -> APISecret" }
        default              { "" }
    }
    Write-Host ("  {0}" -f $name) -ForegroundColor White
    if ($hint) { Write-Host ("    从哪拿：{0}" -f $hint) -ForegroundColor DarkGray }
    Write-Host "    直接回车 = 跳过（对应功能会不可用）" -ForegroundColor DarkGray
    $sec = Read-Host "    请输入" -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    return $plain
}

function Set-It($name, $value) {
    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Host ("  [跳过] {0}" -f $name) -ForegroundColor DarkGray
        return
    }
    [System.Environment]::SetEnvironmentVariable($name, $value, 'User')
    Write-Host ("  [已写入] {0}" -f $name) -ForegroundColor Green
}

Write-Host ""
Write-Host "===== MindGarden 密钥设置 =====" -ForegroundColor Cyan
Write-Host "只会写进本机用户环境变量，不会写进项目文件。" -ForegroundColor Gray
Write-Host ""

$DEEPSEEK_API_KEY  = Ask "DEEPSEEK_API_KEY"  $DEEPSEEK_API_KEY
$GLM_API_KEY       = Ask "GLM_API_KEY"       $GLM_API_KEY
$TENCENT_SECRET_ID = Ask "TENCENT_SECRET_ID" $TENCENT_SECRET_ID
$TENCENT_SECRET_KEY= Ask "TENCENT_SECRET_KEY" $TENCENT_SECRET_KEY
$IFLYTEK_APP_ID    = Ask "IFLYTEK_APP_ID"    $IFLYTEK_APP_ID
$IFLYTEK_API_KEY   = Ask "IFLYTEK_API_KEY"   $IFLYTEK_API_KEY
$IFLYTEK_API_SECRET= Ask "IFLYTEK_API_SECRET" $IFLYTEK_API_SECRET

# 没给会话密钥就生成一个随机的，省得用户自己想
if ([string]::IsNullOrWhiteSpace($SECRET_KEY)) {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $SECRET_KEY = [Convert]::ToBase64String($bytes)
}

Write-Host ""
Write-Host "===== 写入用户级环境变量 =====" -ForegroundColor Cyan
Set-It "DEEPSEEK_API_KEY"          $DEEPSEEK_API_KEY
Set-It "GLM_API_KEY"               $GLM_API_KEY
Set-It "VISION_PROVIDER"           $VISION_PROVIDER
Set-It "GLM_VISION_MODEL"          $GLM_VISION_MODEL
Set-It "GLM_VISION_MODEL_FALLBACK" $GLM_VISION_MODEL_FALLBACK
Set-It "DEEPSEEK_MODEL"            $DEEPSEEK_MODEL
Set-It "TENCENT_SECRET_ID"         $TENCENT_SECRET_ID
Set-It "TENCENT_SECRET_KEY"        $TENCENT_SECRET_KEY
Set-It "IFLYTEK_APP_ID"            $IFLYTEK_APP_ID
Set-It "IFLYTEK_API_KEY"           $IFLYTEK_API_KEY
Set-It "IFLYTEK_API_SECRET"        $IFLYTEK_API_SECRET
Set-It "SECRET_KEY"                $SECRET_KEY
Set-It "HF_ENDPOINT"               "https://hf-mirror.com"

Write-Host ""
Write-Host "完成。环境变量已持久保存（用户级）。" -ForegroundColor Green
Write-Host ""
Write-Host "注意：已经打开的终端/黑窗口不会自动生效，需要关掉重开。" -ForegroundColor Yellow
Write-Host "之后直接双击根目录的一键启动.bat 就行，不用再配 Key。" -ForegroundColor White
Write-Host ""
Write-Host "验证是否写入成功（新开一个 PowerShell 执行）：" -ForegroundColor Gray
Write-Host '  echo $env:DEEPSEEK_API_KEY; echo $env:GLM_API_KEY; echo $env:VISION_PROVIDER' -ForegroundColor Gray
Write-Host ""
