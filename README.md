# figma-tweaks

CSS cleanup for Figma desktop (Windows). Figma files are not modified. The launcher starts Figma and injects `userContent.css` into every figma.com page. Saving the CSS applies it live.

Requires Node.js, git and Figma desktop.

## Install / update

```powershell
if (Test-Path $env:USERPROFILE\figma-tweaks) { git -C $env:USERPROFILE\figma-tweaks pull } else { git clone git@github.com:luyu-work/figma-tweaks.git $env:USERPROFILE\figma-tweaks }; powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\figma-tweaks\install.ps1
```

Start Figma from the Start menu shortcut "Figma". After a Figma update the shortcut is restored by Squirrel, run the command again.

## Files

- `userContent.css` the tweaks
- `desktop/launch.js` starts Figma with `--remote-debugging-pipe` and injects the CSS
- `desktop/Figma.vbs` starts the launcher hidden
- `install.ps1` points the Start menu shortcut to `Figma.vbs`
- `userChrome.css` Firefox web app window tweak, not used by the Figma launcher
