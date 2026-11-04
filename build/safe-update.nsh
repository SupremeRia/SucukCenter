; Never terminate a process holding a business database. The user closes the app normally.
!macro customCheckAppRunning
  sc_check_running:
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    IfSilent sc_cancel_update
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "SucukCenter acik. Islerinizi kaydedip uygulamayi normal sekilde kapatin. Ardindan Yeniden Dene secin. Kurulum uygulamayi zorla kapatmaz." IDRETRY sc_check_running
    sc_cancel_update:
    Abort
  ${ElseIf} $R0 != 603
    IfSilent sc_cancel_check
    MessageBox MB_OK|MB_ICONSTOP "Calisan uygulama kontrol edilemedi. Kurulum durduruldu."
    sc_cancel_check:
    Abort
  ${EndIf}
!macroend
