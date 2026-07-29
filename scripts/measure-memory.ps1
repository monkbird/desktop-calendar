# 测量指定 PID 进程树的内存占用（私有工作集 ≈ 任务管理器"内存"列）
param([int]$RootPid)

$procs = Get-CimInstance Win32_Process
$ids = @($RootPid)
$queue = New-Object System.Collections.Generic.Queue[int]
$queue.Enqueue($RootPid)
while ($queue.Count -gt 0) {
  $p = $queue.Dequeue()
  foreach ($k in ($procs | Where-Object { $_.ParentProcessId -eq $p })) {
    $ids += [int]$k.ProcessId
    $queue.Enqueue([int]$k.ProcessId)
  }
}

$rows = Get-Process -Id $ids -ErrorAction SilentlyContinue |
  Select-Object Id, ProcessName,
    @{n='PrivateMB'; e={[math]::Round($_.PrivateMemorySize64/1MB,1)}},
    @{n='WS_MB'; e={[math]::Round($_.WorkingSet64/1MB,1)}}
$rows | Format-Table -AutoSize

$sum = $rows | Measure-Object -Property PrivateMB, WS_MB -Sum
"PROCESSES: $($rows.Count)"
"TOTAL PrivateMB: $([math]::Round(($sum | Where-Object Property -eq 'PrivateMB').Sum,1))"
"TOTAL WS_MB: $([math]::Round(($sum | Where-Object Property -eq 'WS_MB').Sum,1))"
