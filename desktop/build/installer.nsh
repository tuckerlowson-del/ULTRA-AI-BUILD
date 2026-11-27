!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to ONE BRAIN"
  !define MUI_WELCOMEPAGE_TEXT "Your private AI workspace is ready to install.$\\r$\\n$\\r$\\nONE BRAIN brings your AI models, saved conversations, PC tools and diagnostics into one desktop app.$\\r$\\n$\\r$\\nClick Next to choose where ONE BRAIN should be installed."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Remove ONE BRAIN"
  !define MUI_WELCOMEPAGE_TEXT "This will uninstall the ONE BRAIN application. Your saved chats and settings are kept in your Windows user data folder unless you remove them separately."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
