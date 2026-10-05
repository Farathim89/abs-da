@echo off
rem Builds the installer and portable .exe into dist\ (log: build-log.txt).
rem If the build fails with "Cannot create symbolic link", run this once as administrator.
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs"
echo BUILD STARTED %DATE% %TIME% > build-log.txt
call npm run dist >> build-log.txt 2>&1
echo BUILD-EXIT-CODE %ERRORLEVEL% >> build-log.txt
echo BUILD FINISHED %DATE% %TIME% >> build-log.txt
