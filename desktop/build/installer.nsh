!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

Var OBWelcomeDialog
Var OBWelcomeTitle
Var OBWelcomeBody
Var OBWelcomeHint
Var OBFinishDialog
Var OBFinishTitle
Var OBFinishBody

!macro customWelcomePage
  Page custom OBWelcomePageCreate OBWelcomePageLeave
!macroend

!macro customFinishPage
  Page custom OBFinishPageCreate OBFinishPageLeave
!macroend

!macro customUnWelcomePage
  Page custom OBUnWelcomePageCreate OBUnWelcomePageLeave
!macroend

Function OBWelcomePageCreate
  nsDialogs::Create 1018
  Pop $OBWelcomeDialog
  ${If} $OBWelcomeDialog == error
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Welcome to ONE BRAIN" "Your private AI workspace, built by Wonder Studios."
  ${NSD_CreateLabel} 0 4u 100% 15u "ONE BRAIN"
  Pop $OBWelcomeTitle
  SetCtlColors $OBWelcomeTitle "65E6D0" "101B2B"
  CreateFont $0 "Segoe UI" 22 700
  SendMessage $OBWelcomeTitle ${WM_SETFONT} $0 0
  ${NSD_CreateLabel} 0 27u 100% 14u "AI workspace  |  PC tools  |  Device connectivity"
  Pop $OBWelcomeHint
  SetCtlColors $OBWelcomeHint "8FA9C1" "101B2B"
  ${NSD_CreateLabel} 0 55u 100% 45u "Bring your AI providers, conversations, system tools and connected devices together in one workspace. Your saved data stays in your Windows user profile."
  Pop $OBWelcomeBody
  SetCtlColors $OBWelcomeBody "E6F0FA" "101B2B"
  ${NSD_CreateLabel} 0 111u 100% 34u "INSTALLATION"
  Pop $0
  SetCtlColors $0 "65E6D0" "101B2B"
  ${NSD_CreateLabel} 0 128u 100% 42u "Choose Next to select an installation folder. ONE BRAIN will create a Start Menu entry and a desktop shortcut."
  Pop $0
  SetCtlColors $0 "AFC2D5" "101B2B"
  nsDialogs::Show
FunctionEnd

Function OBWelcomePageLeave
FunctionEnd

Function OBFinishPageCreate
  nsDialogs::Create 1018
  Pop $OBFinishDialog
  ${If} $OBFinishDialog == error
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "ONE BRAIN is ready" "Installation completed."
  ${NSD_CreateLabel} 0 8u 100% 20u "ONE BRAIN"
  Pop $OBFinishTitle
  SetCtlColors $OBFinishTitle "65E6D0" "101B2B"
  CreateFont $0 "Segoe UI" 22 700
  SendMessage $OBFinishTitle ${WM_SETFONT} $0 0
  ${NSD_CreateLabel} 0 45u 100% 45u "Your workspace has been installed. Launch ONE BRAIN from the desktop shortcut or Start Menu."
  Pop $OBFinishBody
  SetCtlColors $OBFinishBody "E6F0FA" "101B2B"
  ${NSD_CreateLabel} 0 108u 100% 28u "Tip: Open Settings to configure your AI provider and connect your devices."
  Pop $0
  SetCtlColors $0 "8FA9C1" "101B2B"
  nsDialogs::Show
FunctionEnd

Function OBFinishPageLeave
FunctionEnd

Function OBUnWelcomePageCreate
  nsDialogs::Create 1018
  Pop $OBWelcomeDialog
  ${If} $OBWelcomeDialog == error
    Abort
  ${EndIf}
  !insertmacro MUI_UN_HEADER_TEXT "Remove ONE BRAIN" "Choose Next to continue uninstalling."
  ${NSD_CreateLabel} 0 8u 100% 20u "ONE BRAIN"
  Pop $OBWelcomeTitle
  SetCtlColors $OBWelcomeTitle "65E6D0" "101B2B"
  CreateFont $0 "Segoe UI" 22 700
  SendMessage $OBWelcomeTitle ${WM_SETFONT} $0 0
  ${NSD_CreateLabel} 0 48u 100% 48u "This removes the application files. Your chats and settings are stored separately in your Windows user profile and are not removed by this installer."
  Pop $OBWelcomeBody
  SetCtlColors $OBWelcomeBody "E6F0FA" "101B2B"
  nsDialogs::Show
FunctionEnd

Function OBUnWelcomePageLeave
FunctionEnd

!macro customHeader
  !define MUI_ABORTWARNING
!macroend
