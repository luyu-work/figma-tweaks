# figma-tweaks

**Нужно установить**
1. Node.js
2. Figma

Один раз откройте Figma, чтобы создались нужные папки, после чего откройте PowerShell и вставьте команду:

```powershell
$d="$env:USERPROFILE\figma-tweaks"; $z="$env:TEMP\ft.zip"; iwr https://github.com/luyu-work/figma-tweaks/archive/refs/heads/main.zip -OutFile $z; Expand-Archive $z $env:TEMP\ft -Force; Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue; Move-Item $env:TEMP\ft\figma-tweaks-main $d; powershell -ExecutionPolicy Bypass -File $d\install.ps1
```

Запускайте Figma через ярлык «Figma» в меню Пуск
