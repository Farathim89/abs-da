; SPDX-License-Identifier: GPL-3.0-or-later
; On a real uninstall (not an update), remove the "Start with Windows" entry.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.farathim.audiobookshelfplayer"
  ${endIf}
!macroend
