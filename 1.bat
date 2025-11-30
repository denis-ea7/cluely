@echo off
echo ===========================================
echo  Отключение визуальных эффектов Windows 10
echo ===========================================

:: Режим "Обеспечить наилучшее быстродействие"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f

:: Отключить анимацию окон
reg add "HKCU\Control Panel\Desktop\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f

:: Отключить прозрачность
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" /v EnableTransparency /t REG_DWORD /d 0 /f

:: Отключить анимации в интерфейсе
reg add "HKCU\Control Panel\Accessibility" /v Animation /t REG_DWORD /d 0 /f

:: Отключить тени под окнами
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v TaskbarAcrylicOpacity /t REG_DWORD /d 1 /f

:: Отключить превью миниатюр в Проводнике (экономит память)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v DisableThumbnailCache /t REG_DWORD /d 1 /f

:: Отключить визуальные миниатюры (мини-окна)
reg add "HKCU\Software\Microsoft\Windows\DWM" /v AlwaysHibernateThumbnails /t REG_DWORD /d 1 /f

echo ===========================================
echo  Оптимизация служб, которые жрут память
echo ===========================================

:: Отключить службу диагностики (DiagTrack)
sc stop DiagTrack
sc config DiagTrack start=disabled

:: Отключить службу сборщика совместимости
sc stop dmwappushservice
sc config dmwappushservice start=disabled

:: Отключить службу поиска Windows (если не нужен поиск)
sc stop WSearch
sc config WSearch start=disabled

echo ===========================================
echo  Применение изменений — перезапуск Explorer
echo ===========================================

taskkill /f /im explorer.exe
start explorer.exe

echo Готово! Визуальные эффекты отключены, система облегчена.
pause

