# Seed Admin and CENRO_Staff accounts into the running cenrowatch_api container.
# Run from the project root: .\seed-users.ps1

Write-Host "Seeding Admin account..." -ForegroundColor Cyan
docker exec `
  -e NEW_USER_EMAIL="admin@cenrowatch.local" `
  -e NEW_USER_PASSWORD="Admin@1234" `
  -e NEW_USER_ROLE="Admin" `
  -e NEW_USER_FIRST="System" `
  -e NEW_USER_LAST="Administrator" `
  cenrowatch_api node prisma/create-admin.js

Write-Host ""
Write-Host "Seeding CENRO_Staff account..." -ForegroundColor Cyan
docker exec `
  -e NEW_USER_EMAIL="staff@cenrowatch.local" `
  -e NEW_USER_PASSWORD="Staff@1234" `
  -e NEW_USER_ROLE="CENRO_Staff" `
  -e NEW_USER_FIRST="CENRO" `
  -e NEW_USER_LAST="Staff" `
  cenrowatch_api node prisma/create-admin.js

Write-Host ""
Write-Host "Done! Credentials:" -ForegroundColor Green
Write-Host "  Admin  -> admin@cenrowatch.local  / Admin@1234"
Write-Host "  Staff  -> staff@cenrowatch.local  / Staff@1234"
