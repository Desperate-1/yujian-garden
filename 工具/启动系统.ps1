# -*- coding: utf-8 -*-
<#
================================================================
  启动系统（兼容入口 —— 已改用统一的一键启动脚本）
================================================================
  这个文件保留是为了兼容旧的习惯用法和已有文档里的引用。

  真正的启动逻辑在：  Start-MindGarden.ps1（项目根目录）
  最省事的用法：      双击根目录的「一键启动.bat」

  为什么合并：原先有 启动系统.ps1 / 一键启动.ps1 两份功能重叠的脚本，
  维护时容易只改一份、造成行为不一致。现在统一到一个入口。
================================================================
#>

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$target = Join-Path (Split-Path -Parent $PSScriptRoot) "Start-MindGarden.ps1"

if (Test-Path $target) {
    Write-Host ""
    Write-Host "  正在转交给统一的一键启动脚本…" -ForegroundColor Cyan
    Write-Host "  （更省事的做法：直接双击根目录的「一键启动.bat」）" -ForegroundColor DarkGray
    Write-Host ""
    & $target
} else {
    Write-Host ""
    Write-Host "  [!!] 找不到启动脚本：$target" -ForegroundColor Red
    Write-Host "       请确认项目根目录下存在 Start-MindGarden.ps1" -ForegroundColor Red
    Write-Host ""
    Read-Host "  按回车退出"
}
