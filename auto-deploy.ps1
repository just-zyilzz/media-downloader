# auto-deploy.ps1
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = Get-Location
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    Write-Host "📁 Terjadi perubahan: $changeType pada $path" -ForegroundColor Yellow
    
    # Tunggu 2 detik agar file selesai disimpan
    Start-Sleep -Seconds 2
    
    # Push ke GitHub
    git add .
    git commit -m "Auto-update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git push
    Write-Host "✅ Auto-push selesai!" -ForegroundColor Green
}

Register-ObjectEvent $watcher "Changed" -Action $action
Register-ObjectEvent $watcher "Created" -Action $action
Register-ObjectEvent $watcher "Deleted" -Action $action

Write-Host "👀 Menunggu perubahan file... (Tekan Ctrl+C untuk berhenti)" -ForegroundColor Cyan
while ($true) { Start-Sleep 1 }