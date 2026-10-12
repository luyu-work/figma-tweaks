# figma-tweaks

Надстройка над Figma для Windows.

**Нужно установить**
- Node.js
- Figma

Один раз откройте Figma, чтобы создались нужные папки.

**Установка**

Откройте PowerShell и вставьте команду.

```powershell
$d="$env:USERPROFILE\figma-tweaks"; $z="$env:TEMP\ft.zip"; iwr https://github.com/luyu-work/figma-tweaks/archive/refs/heads/main.zip -OutFile $z; Expand-Archive $z $env:TEMP\ft -Force; Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue; Move-Item $env:TEMP\ft\figma-tweaks-main $d; powershell -ExecutionPolicy Bypass -File $d\install.ps1
```

Запускайте Figma через ярлык «Figma» в меню Пуск.
