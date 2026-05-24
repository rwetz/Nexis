; "Open in Nexis" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInNexis" "" "Open in Nexis"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInNexis" "Icon" '"$INSTDIR\nexis.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInNexis" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInNexis\command" "" '"$INSTDIR\nexis.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInNexis" "" "Open in Nexis"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInNexis" "Icon" '"$INSTDIR\nexis.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInNexis" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInNexis\command" "" '"$INSTDIR\nexis.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInNexis" "" "Open in Nexis"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInNexis" "Icon" '"$INSTDIR\nexis.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInNexis" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInNexis\command" "" '"$INSTDIR\nexis.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInNexis"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInNexis"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInNexis"
!macroend
